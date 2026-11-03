import { jsonError } from "@/lib/api";
import { tutorRegenerateSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";
import { modelForTask } from "@/lib/ai/models";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import { runNovaTurn } from "@/lib/ai/nova/turn";
import { startNovaStream } from "@/lib/ai/nova/http";

/**
 * POST /api/ai/chat/regenerate — replace the latest assistant reply.
 *
 * The last assistant message is deleted and a fresh Nova turn is streamed
 * for the last user message (grounding note ids are carried over from the
 * removed reply). The user message is already persisted, so the turn runs
 * with `skipUserInsert`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const parsed = tutorRegenerateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }
    const { conversationId } = parsed.data;

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "tutor",
      capability: "take_assessments",
      skipGatewayCheck: true,
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conversation) return jsonError("Conversation not found", 404);

    // Last assistant reply + the user message it answered.
    const { data: recent } = await supabase
      .from("ai_messages")
      .select("id, role, content, grounding_note_ids")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(2);

    const lastAssistant = (recent ?? []).find((row) => row.role === "assistant");
    const lastUser = (recent ?? []).find((row) => row.role === "user");
    if (!lastUser) {
      return jsonError("There is no question to regenerate an answer for", 400);
    }

    if (lastAssistant) {
      const { data: deletedRows, error: deleteError } = await supabase
        .from("ai_messages")
        .delete()
        .eq("id", lastAssistant.id)
        .select("id");
      if (deleteError) {
        return jsonError(`Could not remove the old reply: ${deleteError.message}`, 500);
      }
      if (!deletedRows || deletedRows.length === 0) {
        return jsonError(
          "The old reply could not be removed (missing database policies). Ask the administrator to apply migration 00017_nova_chat_history.sql.",
          500,
        );
      }
    }

    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const noteIds =
      lastAssistant?.grounding_note_ids ?? lastUser.grounding_note_ids ?? [];
    const turn = runNovaTurn({
      db: supabase,
      userId,
      conversationId,
      message: lastUser.content,
      noteIds,
      skipUserInsert: true,
    });

    return await startNovaStream(
      turn,
      conversationId,
      async () => {
        const queueId = await enqueueAiTask(
          "tutor",
          { userId, conversationId, message: lastUser.content, noteIds },
          userId,
        );
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "tutor", modelForTask("tutor"), "queued");
        return jsonError(
          "The AI gateway is unreachable — a fresh answer was queued for this question.",
          202,
        );
      },
    );
  } catch (error) {
    console.error("[api:ai/chat/regenerate]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}
