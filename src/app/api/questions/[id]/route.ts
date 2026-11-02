import { z } from "zod";
import type { NextResponse } from "next/server";
import { handleRoute, jsonError, jsonOk } from "@/lib/api";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import type { QuestionOption } from "@/types/domain";

/**
 * POST /api/questions/[id] — attempt & answer-reveal endpoint.
 *
 * The question bank ships WITHOUT answer keys, so this route is the one
 * place answers cross the wire — and the lecturer's visibility rule is
 * enforced here, server-side:
 *
 *   { action: "attempt", selected: "B" }   (signed-in)
 *     Records the attempt, scores MCQs on the server and returns
 *     { correct: true|false } — never the full key/explanation.
 *
 *   { action: "reveal" }                   (guests allowed)
 *     Returns { answerKey, explanationMd } when the lecturer's rule
 *     allows it, or { locked: true, releaseAt } when the answers are
 *     hidden (until `answers_release_at` if one is set).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  action: z.enum(["attempt", "reveal"]),
  selected: z.string().max(2000).optional(),
});

/** A question is locked while answers_hidden is on and the release moment hasn't passed. */
function lockedAt(
  hidden: boolean | null,
  releaseAt: string | null,
): { locked: boolean; releaseAt: string | null } {
  if (!hidden) return { locked: false, releaseAt: null };
  if (releaseAt) {
    const release = new Date(releaseAt);
    if (!Number.isNaN(release.getTime()) && release.getTime() <= Date.now()) {
      return { locked: false, releaseAt: null };
    }
  }
  return { locked: true, releaseAt };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError("Invalid question id", 400);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid request", 400);
    const { action, selected } = parsed.data;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { data: question } = await supabase
      .from("questions")
      .select(
        "id, type, stem_md, options, answer_key, explanation_md, answers_hidden, answers_release_at, status",
      )
      .eq("id", id)
      .eq("status", "published")
      .single();
    if (!question) return jsonError("Question not found", 404);

    const state = lockedAt(question.answers_hidden, question.answers_release_at);

    if (action === "reveal") {
      if (state.locked) {
        return jsonOk({ locked: true, releaseAt: state.releaseAt });
      }
      return jsonOk({
        locked: false,
        answerKey: question.answer_key,
        explanationMd: question.explanation_md ?? "",
      });
    }

    // ---- action === "attempt" — needs a signed-in user ----
    const auth = await getAuthContext();
    if (!auth) {
      return jsonError("Sign in to record your answers", 401);
    }

    const picked = (selected ?? "").trim();
    if (!picked) return jsonError("Nothing was selected", 400);

    let autoCorrect: boolean | null = null;
    if (question.type === "mcq") {
      const options = (question.options ?? []) as unknown as QuestionOption[];
      const isValidKey = options.some((option) => option.key === picked);
      if (!isValidKey) return jsonError("That option does not belong to this question", 400);
      // Score on the server — the key itself never leaves for locked questions.
      autoCorrect = picked.toUpperCase() === question.answer_key.trim().toUpperCase();
    }

    const { error } = await supabase.from("question_attempts").insert({
      question_id: question.id,
      user_id: auth.user.id,
      selected: picked,
      auto_correct: autoCorrect,
    });
    if (error) return jsonError(error.message, 500);

    if (question.type === "mcq" && autoCorrect !== null) {
      return jsonOk({ recorded: true, correct: autoCorrect });
    }
    // Written types: attempt recorded; the model answer only via reveal.
    return jsonOk({
      recorded: true,
      correct: null,
      locked: state.locked,
      releaseAt: state.releaseAt,
    });
  });
}
