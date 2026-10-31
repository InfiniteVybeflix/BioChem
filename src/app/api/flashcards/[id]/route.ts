import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/flashcards/[id] — remove one of the caller's flashcards.
 *
 * Ownership is verified with the RLS-scoped client first. The actual delete
 * then runs through the service-role client because the `flashcards` table has
 * no `for delete` RLS policy; `flashcard_reviews` rows cascade via their
 * foreign key, so a delete also wipes the caller's review history for the card.
 */
export async function DELETE(_req: Request, { params }: RouteParams) {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const { userId, role } = auth.ctx;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { id } = await params;
    if (!UUID_RE.test(id)) return jsonError("Flashcard not found", 404);

    // RLS-scoped read: students only see public/own cards anyway.
    const { data: card } = await supabase
      .from("flashcards")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!card) return jsonError("Flashcard not found", 404);
    if (card.created_by !== userId && role === "student") {
      return jsonError("You can only delete your own flashcards", 403);
    }

    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError("Deletion is not available on this deployment", 503);

    const { error } = await admin.from("flashcards").delete().eq("id", id);
    if (error) return jsonError("Could not delete this flashcard", 500);

    return jsonOk({ deleted: id });
  });
}
