import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildPayload, UUID_RE } from "@/app/api/mocks/_shared";
import type { Database } from "@/types/domain";

/** Autosave body: either fresh answers or an abandon request. */
const patchSchema = z.union([
  z.object({
    answers: z.record(
      z.string(),
      z.object({
        selected: z.string().max(40).nullable().optional(),
        text: z.string().max(20_000).nullable().optional(),
      }),
    ),
  }),
  z.object({ status: z.literal("abandoned") }),
]);

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/mocks/[id] — own attempt + its questions.
 * While `status = in_progress` the questions are stripped of `answer_key`
 * and `explanation_md` (and non-MCQ option lists) so answers cannot leak.
 */
export async function GET(_req: Request, { params }: RouteParams) {
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

    const payload = await buildPayload(supabase, attempt);
    return jsonOk(payload);
  });
}

/**
 * PATCH /api/mocks/[id] — autosave answers or abandon the attempt.
 * Only touches the user's own in-progress attempts; silently no-ops once an
 * attempt has been submitted (late autosaves must not resurrect it).
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const { userId } = auth.ctx;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError("Attempt not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid autosave payload", 400);

    const update: Database["public"]["Tables"]["exam_attempts"]["Update"] =
      "answers" in parsed.data ? { answers: parsed.data.answers } : { status: "abandoned" };

    const { data } = await supabase
      .from("exam_attempts")
      .update(update)
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "in_progress")
      .select("id")
      .maybeSingle();

    return jsonOk({ saved: data !== null });
  });
}
