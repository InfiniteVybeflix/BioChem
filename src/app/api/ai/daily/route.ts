import { z } from "zod";
import { handleRoute, jsonOk, jsonError, requireUser } from "@/lib/api";
import { dailySettingsSchema } from "@/lib/validation";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { generateDailyQuestions, zonedToday, normalizeDailySettings } from "@/lib/ai/daily";
import { consumeRateLimit, recordAiUsage } from "@/lib/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { xpFor } from "@/lib/xp";
import type { NextResponse } from "next/server";
import type { Database, DailyQuestionPayload, Difficulty } from "@/types/domain";
import { dailyQuestionPayload } from "@/types/domain";

/**
 * /api/ai/daily — Question of the Day.
 *
 * GET  → today's questions + settings (generates on first visit when the
 *        feature is enabled, the flag is on and the gateway is reachable).
 * PUT  → upsert the user's daily question settings.
 * POST → submit an answer (grades, records and awards XP).
 */

type DailyQuestionRow = Database["public"]["Tables"]["daily_questions"]["Row"];

export interface DailyQuestionItem {
  id: string;
  for_date: string;
  topic_id: string | null;
  topicTitle: string | null;
  difficulty: Difficulty;
  payload: DailyQuestionPayload;
  selected_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
}

async function fetchTodayWithTopics(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
  today: string,
): Promise<DailyQuestionItem[]> {
  const { data: rows } = await supabase
    .from("daily_questions")
    .select("*")
    .eq("for_date", today)
    .order("created_at", { ascending: true });

  const topicIds = [
    ...new Set((rows ?? []).map((row) => row.topic_id).filter((id): id is string => id !== null)),
  ];
  const titlesById = new Map<string, string>();
  if (topicIds.length > 0) {
    const { data: topics } = await supabase.from("topics").select("id, title").in("id", topicIds);
    for (const topic of topics ?? []) titlesById.set(topic.id, topic.title);
  }

  return (rows ?? []).flatMap((row) => {
    const parsed = dailyQuestionPayload(row.payload);
    if (!parsed) return [];
    return [
      {
        id: row.id,
        for_date: row.for_date,
        topic_id: row.topic_id,
        topicTitle: row.topic_id ? (titlesById.get(row.topic_id) ?? null) : null,
        difficulty: row.difficulty,
        payload: parsed,
        selected_answer: row.selected_answer,
        is_correct: row.is_correct,
        answered_at: row.answered_at,
      },
    ];
  });
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);
    const userId = auth.ctx.userId;

    const { data: settingsRow } = await supabase
      .from("daily_question_settings")
      .select("*")
      .maybeSingle();
    const settings = normalizeDailySettings(settingsRow);
    const today = zonedToday(settings.timezone);

    let questions = await fetchTodayWithTopics(supabase, today);
    let generated = false;
    let rateLimited = false;

    if (questions.length === 0 && settings.enabled) {
      const { data: flag } = await supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "question_of_the_day")
        .maybeSingle();
      const flagOn = !flag || flag.enabled !== false;

      if (flagOn && gatewayConfigured()) {
        const rate = await consumeRateLimit(supabase, userId, "daily_questions");
        if (rate.allowed) {
          try {
            const inserted: DailyQuestionRow[] = await generateDailyQuestions(userId);
            if (inserted.length > 0) {
              generated = true;
              questions = await fetchTodayWithTopics(supabase, today);
            }
            await recordAiUsage(userId, "daily_questions", modelForTask("daily_questions"), "ok");
          } catch (error) {
            console.error("[api:ai/daily] generation failed:", error);
            await recordAiUsage(
              userId,
              "daily_questions",
              modelForTask("daily_questions"),
              "failed",
            );
            return jsonError(
              error instanceof Error ? error.message : "Could not generate today's questions",
              502,
            );
          }
        } else {
          rateLimited = true;
        }
      }
    }

    return jsonOk({ questions, settings: settingsRow, generated, rateLimited });
  });
}

export async function PUT(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = dailySettingsSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);

    const { error } = await supabase.from("daily_question_settings").upsert(
      {
        user_id: auth.ctx.userId,
        topic_ids: parsed.data.topicIds,
        difficulty: parsed.data.difficulty,
        count: parsed.data.count,
        delivery_time: parsed.data.deliveryTime,
        timezone: parsed.data.timezone,
        enabled: parsed.data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return jsonError(`Could not save settings: ${error.message}`, 500);

    return jsonOk({ saved: true });
  });
}

const answerSchema = z.object({
  questionId: z.string().uuid(),
  selected: z.string().min(1).max(10),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = answerSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);
    const { questionId, selected } = parsed.data;

    const { data: row } = await supabase
      .from("daily_questions")
      .select("*")
      .eq("id", questionId)
      .maybeSingle();
    if (!row) return jsonError("Question not found", 404);

    const payload = dailyQuestionPayload(row.payload);
    if (!payload) return jsonError("This question could not be loaded", 422);
    const answer = payload.answer;

    // Already answered → return the recorded outcome (no double XP).
    if (row.answered_at) {
      return jsonOk({
        isCorrect: row.is_correct === true,
        answer,
        explanation: payload.explanation,
        alreadyAnswered: true,
      });
    }

    const isCorrect = selected === answer;
    const { error } = await supabase
      .from("daily_questions")
      .update({
        selected_answer: selected,
        is_correct: isCorrect,
        answered_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) return jsonError(`Could not record your answer: ${error.message}`, 500);

    if (isCorrect) {
      const { error: xpError } = await supabase.rpc("award_xp", {
        p_amount: xpFor("daily_question_correct"),
        p_reason: "daily_question_correct",
      });
      if (xpError) console.error("[api:ai/daily] award_xp failed:", xpError.message);
    }

    return jsonOk({ isCorrect, answer, explanation: payload.explanation });
  });
}
