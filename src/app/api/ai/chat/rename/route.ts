import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { tutorRenameSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";

const renameBodySchema = z.object({
  conversationId: z.string().uuid(),
  title: tutorRenameSchema.shape.title,
});

/**
 * PATCH /api/ai/chat/rename — rename one of the caller's conversations.
 * Body: { conversationId, title }.
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const parsed = renameBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }
    const { conversationId, title } = parsed.data;

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "tutor",
      skipGatewayCheck: true,
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    const { data: updated, error } = await supabase
      .from("ai_conversations")
      .update({ title })
      .eq("id", conversationId)
      .eq("user_id", userId)
      .select("id, title")
      .maybeSingle();
    if (error) return jsonError(`Could not rename the conversation: ${error.message}`, 500);
    if (!updated) return jsonError("Conversation not found", 404);

    return jsonOk({ id: updated.id, title: updated.title });
  } catch (error) {
    console.error("[api:ai/chat/rename]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}
