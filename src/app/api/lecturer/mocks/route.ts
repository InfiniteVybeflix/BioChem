import type { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { zoneSchema } from "@/lib/validation";

/**
 * POST /api/lecturer/mocks — create a custom mock (publish_content).
 * Body: { title, zone, description?, durationMinutes, questionIds[5..100] }.
 * Creates a published exam plus its exam_questions links (order_index 0..n,
 * marks taken from each question), all through the RLS-scoped client.
 */

const bodySchema = z.object({
  title: z.string().min(3, "Give the mock a title").max(160),
  zone: zoneSchema,
  description: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(5).max(300),
  questionIds: z
    .array(z.string().uuid())
    .min(5, "Pick at least 5 questions")
    .max(100, "A mock can hold at most 100 questions"),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("publish_content");
    if (!auth.ok) return auth.response;

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }

    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);

    const uniqueIds = [...new Set(parsed.data.questionIds)];
    const { data: questionRows } = await rls
      .from("questions")
      .select("id, marks")
      .in("id", uniqueIds);
    if ((questionRows ?? []).length !== uniqueIds.length) {
      return jsonError("Some of the selected questions no longer exist", 400);
    }

    const marksById = new Map((questionRows ?? []).map((row) => [row.id, row.marks]));
    const totalMarks = uniqueIds.reduce((sum, id) => sum + (marksById.get(id) ?? 0), 0);

    const { data: exam, error: examError } = await rls
      .from("exams")
      .insert({
        title: parsed.data.title,
        zone: parsed.data.zone,
        description: parsed.data.description?.trim() ? parsed.data.description : null,
        duration_minutes: parsed.data.durationMinutes,
        total_marks: totalMarks,
        created_by: auth.ctx.userId,
        is_past_paper: false,
        published: true,
      })
      .select("id")
      .single();

    if (examError || !exam) {
      return jsonError(`Could not create the mock: ${examError?.message ?? "unknown error"}`, 500);
    }

    const { error: linkError } = await rls.from("exam_questions").insert(
      uniqueIds.map((questionId, index) => ({
        exam_id: exam.id,
        question_id: questionId,
        order_index: index,
        marks: marksById.get(questionId) ?? 1,
      })),
    );
    if (linkError) {
      return jsonError(`Could not attach the questions: ${linkError.message}`, 500);
    }

    return jsonOk({ examId: exam.id, totalMarks });
  });
}
