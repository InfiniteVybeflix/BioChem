import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { RunnerPayload, RunnerQuestion } from "@/components/mocks/types";
import type { Database } from "@/types/domain";
import { questionOptions, attemptConfig, attemptAnswers, isAttemptMode } from "@/types/domain";

/**
 * Shared helpers for the /api/mocks* route handlers. Colocated under
 * `api/mocks/` as a private (non-route) module.
 */

type AttemptRow = Database["public"]["Tables"]["exam_attempts"]["Row"];
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];

export type ServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads the attempt's questions (snapshot order) and builds the API payload.
 * While the attempt is in progress, answer keys + explanations are stripped. */
export async function buildPayload(
  supabase: ServerClient,
  attempt: AttemptRow & { exams: { title: string } | null },
): Promise<RunnerPayload> {
  const questionIds = attempt.question_ids ?? [];
  const questionRows = await loadOrderedQuestions(supabase, questionIds, attempt.exam_id);
  const inProgress = attempt.status === "in_progress";

  const questions: RunnerQuestion[] = questionRows.map((question) => ({
    id: question.id,
    type: question.type,
    stemMd: question.stem_md,
    options: question.type === "mcq" || !inProgress ? questionOptions(question.options) : [],
    marks: question.marks,
    difficulty: question.difficulty,
    zone: question.zone,
    ...(inProgress
      ? {}
      : { answerKey: question.answer_key, explanationMd: question.explanation_md }),
  }));

  return {
    attempt: {
      id: attempt.id,
      zone: attempt.zone,
      mode: isAttemptMode(attempt.mode) ? attempt.mode : "mock",
      status: attempt.status,
      config: attemptConfig(attempt.config),
      score: attempt.score,
      maxScore: attempt.max_score,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      durationSeconds: attempt.duration_seconds,
      answers: attemptAnswers(attempt.answers),
      examTitle: attempt.exams?.title ?? null,
    },
    questions,
  };
}

/** Fetches questions by id, restores the snapshot order and applies per-exam
 * mark allocations (past papers define their own marks per question). */
export async function loadOrderedQuestions(
  supabase: ServerClient,
  questionIds: string[],
  examId: string | null,
): Promise<QuestionRow[]> {
  if (questionIds.length === 0) return [];

  const { data: rows } = await supabase.from("questions").select("*").in("id", questionIds);
  const byId = new Map<string, QuestionRow>((rows ?? []).map((row) => [row.id, row]));

  let marksByQuestion: Map<string, number> | null = null;
  if (examId) {
    const { data: examQuestions } = await supabase
      .from("exam_questions")
      .select("question_id, marks")
      .eq("exam_id", examId);
    marksByQuestion = new Map((examQuestions ?? []).map((row) => [row.question_id, row.marks]));
  }

  return questionIds
    .map((questionId) => byId.get(questionId))
    .filter((question): question is QuestionRow => Boolean(question))
    .map((question) =>
      marksByQuestion && marksByQuestion.has(question.id)
        ? { ...question, marks: marksByQuestion.get(question.id) ?? question.marks }
        : question,
    );
}
