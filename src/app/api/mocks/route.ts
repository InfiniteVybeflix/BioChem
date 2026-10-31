import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { mockConfigSchema } from "@/lib/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AttemptConfig, Database, Difficulty, ExamZone } from "@/types/domain";
import { attemptConfig, toJson } from "@/types/domain";

type DatabaseClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
type QuestionLite = Pick<Database["public"]["Tables"]["questions"]["Row"], "id" | "marks">;

/**
 * POST /api/mocks — start a new attempt.
 *
 * Two flows:
 * 1. `examId` given → sit a published exam / past paper. The question set and
 *    marks allocation are snapshotted from `exam_questions` (ordered), and the
 *    duration comes from the exam itself.
 * 2. Otherwise → build a random mock from published questions in the zone,
 *    honouring optional topic + difficulty filters (with a zone-wide fallback
 *    when the filters are too narrow).
 */

// mockConfigSchema + examId. `count` is relaxed past 60 because the past
// papers page sends a sentinel count (the exam flow ignores it server-side).
const startMockSchema = mockConfigSchema.extend({
  examId: z.string().uuid().optional(),
  count: z.number().int().min(5).max(999),
});

export async function POST(req: Request) {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const { userId } = auth.ctx;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const parsed = startMockSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid mock configuration", 400);
    const { zone, topicIds, difficulty, count, durationMinutes, examId } = parsed.data;

    // ---------- Flow 1: sit a published exam / past paper ----------
    if (examId) {
      const { data: exam } = await supabase
        .from("exams")
        .select("id, title, zone, duration_minutes, is_past_paper, published")
        .eq("id", examId)
        .eq("published", true)
        .maybeSingle();

      if (!exam) return jsonError("Exam not found", 404);

      const { data: examQuestions } = await supabase
        .from("exam_questions")
        .select("question_id, marks")
        .eq("exam_id", examId)
        .order("order_index");

      const rows = examQuestions ?? [];
      if (rows.length === 0) return jsonError("This exam has no questions yet", 400);

      const questionIds = rows.map((row) => row.question_id);
      const maxScore = rows.reduce((sum, row) => sum + row.marks, 0);
      const config: AttemptConfig = {
        title: exam.title,
        count: questionIds.length,
        durationMinutes: exam.duration_minutes,
      };

      const { data: attempt, error } = await supabase
        .from("exam_attempts")
        .insert({
          user_id: userId,
          exam_id: exam.id,
          zone: exam.zone,
          mode: exam.is_past_paper ? "past_paper" : "custom",
          config: toJson(config),
          question_ids: questionIds,
          answers: {},
          max_score: maxScore,
        })
        .select("id")
        .single();

      if (error || !attempt) return jsonError("Could not start this exam", 500);
      return jsonOk({ attemptId: attempt.id }, { status: 201 });
    }

    // ---------- Flow 2: random mock ----------
    const candidates = await selectMockQuestions(supabase, {
      zone,
      topicIds,
      difficulty,
    });
    if (candidates.length === 0) {
      return jsonError("No published questions in this zone yet — try another zone", 400);
    }

    // Fisher–Yates shuffle so mock order is random per attempt.
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    const takeCount = Math.min(count, 60, candidates.length);
    const chosen = candidates.slice(0, takeCount);
    const maxScore = chosen.reduce((sum, question) => sum + question.marks, 0);
    const config: AttemptConfig = { topicIds, difficulty, count: takeCount, durationMinutes };

    const { data: attempt, error } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: userId,
        zone,
        mode: "mock",
        config: toJson(config),
        question_ids: chosen.map((question) => question.id),
        answers: {},
        max_score: maxScore,
      })
      .select("id")
      .single();

    if (error || !attempt) return jsonError("Could not start this mock", 500);
    return jsonOk({ attemptId: attempt.id }, { status: 201 });
  });
}

/**
 * Published questions for a mock, honouring the optional filters. When the
 * filters yield fewer than 5 questions the query falls back to the whole zone
 * so a mock can always be started.
 */
async function selectMockQuestions(
  supabase: DatabaseClient,
  filters: { zone: ExamZone; topicIds: string[]; difficulty: Difficulty | "all" },
): Promise<QuestionLite[]> {
  let query = supabase
    .from("questions")
    .select("id, marks")
    .eq("zone", filters.zone)
    .eq("status", "published");
  if (filters.topicIds.length > 0) query = query.in("topic_id", filters.topicIds);
  if (filters.difficulty !== "all") query = query.eq("difficulty", filters.difficulty);

  const { data: matched } = await query;
  if ((matched ?? []).length >= 5) return matched ?? [];

  const { data: zoneWide } = await supabase
    .from("questions")
    .select("id, marks")
    .eq("zone", filters.zone)
    .eq("status", "published");
  return zoneWide ?? [];
}

/** GET /api/mocks — the signed-in user's attempts, newest first. */
export async function GET() {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { data } = await supabase
      .from("exam_attempts")
      .select(
        "id, zone, mode, status, score, max_score, config, started_at, submitted_at, duration_seconds, exams(title)",
      )
      .eq("user_id", auth.ctx.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const attempts = (data ?? []).map((row) => ({
      id: row.id,
      zone: row.zone,
      mode: row.mode,
      status: row.status,
      score: row.score,
      maxScore: row.max_score,
      config: attemptConfig(row.config),
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      durationSeconds: row.duration_seconds,
      examTitle: row.exams?.title ?? null,
    }));

    return jsonOk({ attempts });
  });
}
