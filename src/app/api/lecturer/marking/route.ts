import { z } from "zod";
import type { NextResponse } from "next/server";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * /api/lecturer/marking — attempt review & marking (publish_content).
 *
 *   GET  → the staff member's bank questions (or every question for
 *          admins) with recent student attempts for marking.
 *   POST → { action: "release" | "hide" | "schedule" | "mark", ... }
 *          release  — answers_hidden = false (answers visible now)
 *          hide     — answers_hidden = true, release cleared
 *          schedule — answers_hidden = true, release at a moment
 *          mark     — grade one attempt correct / incorrect / clear
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("release"), questionId: z.string().uuid() }),
  z.object({ action: z.literal("hide"), questionId: z.string().uuid() }),
  z.object({
    action: z.literal("schedule"),
    questionId: z.string().uuid(),
    releaseAt: z.string().min(4),
  }),
  z.object({
    action: z.literal("mark"),
    attemptId: z.string().uuid(),
    result: z.enum(["correct", "incorrect", "clear"]),
  }),
]);

const MAX_QUESTIONS = 60;
const ATTEMPTS_PER_QUESTION = 12;

export interface MarkingAttempt {
  id: string;
  student: string;
  selected: string;
  autoCorrect: boolean | null;
  markedResult: string | null;
  createdAt: string;
}

export interface MarkingQuestion {
  id: string;
  stem: string;
  topicTitle: string | null;
  type: string;
  answersHidden: boolean;
  answersReleaseAt: string | null;
  attemptCount: number;
  attempts: MarkingAttempt[];
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("publish_content");
    if (!auth.ok) return auth.response;

    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);

    const isAdmin = auth.ctx.role === "admin";
    let query = rls
      .from("questions")
      .select(
        "id, stem_md, type, answers_hidden, answers_release_at, created_at, topic:topics!questions_topic_id_fkey (title)",
      )
      .order("created_at", { ascending: false })
      .limit(MAX_QUESTIONS);
    if (!isAdmin) query = query.eq("created_by", auth.ctx.userId);

    const { data: questionRows, error } = await query;
    if (error) return jsonError(error.message, 500);
    const questions = questionRows ?? [];
    if (questions.length === 0) {
      return jsonOk({ questions: [] as MarkingQuestion[] });
    }

    const ids = questions.map((question) => question.id);
    const { data: attemptRows, error: attemptError } = await rls
      .from("question_attempts")
      .select(
        "id, question_id, selected, auto_correct, marked_result, created_at, profiles!question_attempts_user_id_fkey (full_name)",
      )
      .in("question_id", ids)
      .order("created_at", { ascending: false })
      .limit(MAX_QUESTIONS * ATTEMPTS_PER_QUESTION);
    if (attemptError) return jsonError(attemptError.message, 500);

    const attemptsByQuestion = new Map<string, MarkingAttempt[]>();
    for (const row of attemptRows ?? []) {
      const list = attemptsByQuestion.get(row.question_id) ?? [];
      if (list.length >= ATTEMPTS_PER_QUESTION) continue;
      list.push({
        id: row.id,
        student: (row.profiles as { full_name?: string } | null)?.full_name ?? "Student",
        selected: row.selected,
        autoCorrect: row.auto_correct,
        markedResult: row.marked_result,
        createdAt: row.created_at,
      });
      attemptsByQuestion.set(row.question_id, list);
    }

    type QuestionRow = {
      id: string;
      stem_md: string;
      type: string;
      answers_hidden: boolean;
      answers_release_at: string | null;
      topic: { title: string } | null;
    };

    const payload: MarkingQuestion[] = (questions as unknown as QuestionRow[]).map((question) => {
      const attempts = attemptsByQuestion.get(question.id) ?? [];
      return {
        id: question.id,
        stem: question.stem_md.replace(/[#*_>`$]/g, "").replace(/\s+/g, " ").trim().slice(0, 160),
        topicTitle: question.topic?.title ?? null,
        type: question.type,
        answersHidden: question.answers_hidden,
        answersReleaseAt: question.answers_release_at,
        attemptCount: attempts.length,
        attempts,
      };
    });

    // Questions with the most recent activity first.
    payload.sort(
      (a, b) =>
        Number(b.attempts.length > 0) - Number(a.attempts.length > 0) ||
        Number(b.answersHidden) - Number(a.answersHidden),
    );

    return jsonOk({ questions: payload });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("publish_content");
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }
    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);
    const isAdmin = auth.ctx.role === "admin";

    const body = parsed.data;
    if (body.action === "mark") {
      const { error } = await rls
        .from("question_attempts")
        .update({
          marked_result: body.result === "clear" ? null : body.result,
          marked_by: body.result === "clear" ? null : auth.ctx.userId,
          marked_at: body.result === "clear" ? null : new Date().toISOString(),
        })
        .eq("id", body.attemptId);
      if (error) return jsonError(error.message, 500);
      return jsonOk({ ok: true });
    }

    // Question-level actions: lecturers may only touch their own questions.
    let questionQuery = rls.from("questions").select("id").eq("id", body.questionId).limit(1);
    if (!isAdmin) questionQuery = questionQuery.eq("created_by", auth.ctx.userId);
    const { data: owned, error: ownError } = await questionQuery;
    if (ownError) return jsonError(ownError.message, 500);
    if (!owned || owned.length === 0) {
      return jsonError("That question isn't yours to manage", 403);
    }

    if (body.action === "release") {
      const { error } = await rls
        .from("questions")
        .update({ answers_hidden: false, answers_release_at: null })
        .eq("id", body.questionId);
      if (error) return jsonError(error.message, 500);
      return jsonOk({ ok: true });
    }
    if (body.action === "hide") {
      const { error } = await rls
        .from("questions")
        .update({ answers_hidden: true, answers_release_at: null })
        .eq("id", body.questionId);
      if (error) return jsonError(error.message, 500);
      return jsonOk({ ok: true });
    }
    // schedule
    const release = new Date(body.releaseAt);
    if (Number.isNaN(release.getTime())) return jsonError("That release date isn't valid", 400);
    const { error } = await rls
      .from("questions")
      .update({ answers_hidden: true, answers_release_at: release.toISOString() })
      .eq("id", body.questionId);
    if (error) return jsonError(error.message, 500);
    return jsonOk({ ok: true });
  });
}
