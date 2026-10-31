import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/push";
import { gradeAttempt, type GradableQuestion } from "@/lib/grading";
import { buildPayload, loadOrderedQuestions, UUID_RE } from "@/app/api/mocks/_shared";
import { questionOptions, attemptAnswers, toJson } from "@/types/domain";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/mocks/[id]/submit — grade and close an in-progress attempt.
 *
 * - Grades every question against the stored answers (per-question results are
 *   written back into `exam_attempts.answers`).
 * - Records score, max score, duration and `submitted_at`.
 * - Awards XP for submitting and sends a `mock_results` notification.
 * - Idempotent: submitting an already-graded attempt returns it unchanged.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const { userId } = auth.ctx;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError("Attempt not found", 404);

    const { data: attempt } = await supabase
      .from("exam_attempts")
      .select("*, exams(title)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!attempt) return jsonError("Attempt not found", 404);

    // Already graded (e.g. auto-submit racing a manual submit) — return it.
    if (attempt.status === "submitted") {
      const payload = await buildPayload(supabase, attempt);
      return jsonOk(payload);
    }
    if (attempt.status !== "in_progress") {
      return jsonError("This attempt is no longer in progress", 409);
    }

    const questions = await loadOrderedQuestions(
      supabase,
      attempt.question_ids ?? [],
      attempt.exam_id,
    );
    const gradable: GradableQuestion[] = questions.map((question) => ({
      id: question.id,
      type: question.type,
      options: questionOptions(question.options),
      answer_key: question.answer_key,
      marks: question.marks,
    }));

    const graded = gradeAttempt(gradable, attemptAnswers(attempt.answers));
    const durationSeconds = Math.max(
      0,
      Math.round((Date.now() - new Date(attempt.started_at).getTime()) / 1000),
    );
    const submittedAt = new Date().toISOString();

    const { error } = await supabase
      .from("exam_attempts")
      .update({
        answers: toJson(graded.answers),
        score: graded.score,
        max_score: graded.maxScore,
        status: "submitted",
        submitted_at: submittedAt,
        duration_seconds: durationSeconds,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "in_progress");

    if (error) return jsonError("Could not save your submission", 500);

    // XP for finishing a mock — best effort, never blocks grading.
    try {
      await supabase.rpc("award_xp", { p_amount: 10, p_reason: "mock_submitted" });
    } catch (xpError) {
      console.error("[mocks] award_xp failed", xpError);
    }

    // In-app + push notification (service-role, honours prefs + quiet hours).
    try {
      await notifyUsers([userId], "mock_results", {
        title: "Mock exam graded",
        body: `You scored ${graded.score}/${graded.maxScore} (${graded.percentage}%) — review your answers`,
        link: `/mocks/${id}`,
      });
    } catch (notifyError) {
      console.error("[mocks] mock_results notification failed", notifyError);
    }

    const payload = await buildPayload(supabase, {
      ...attempt,
      answers: toJson(graded.answers),
      score: graded.score,
      max_score: graded.maxScore,
      status: "submitted",
      submitted_at: submittedAt,
      duration_seconds: durationSeconds,
    });

    return jsonOk(payload);
  });
}
