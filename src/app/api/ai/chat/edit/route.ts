import { jsonError } from "@/lib/api";
import { tutorEditSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";
import { modelForTask } from "@/lib/ai/models";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import { runNovaTurn } from "@/lib/ai/nova/turn";
import { startNovaStream } from "@/lib/ai/nova/http";

/**
 * POST /api/ai/chat/edit — edit a previously sent user message.
 *
 * Everything after the edited message is removed (including the old
 * assistant reply), the message content is updated, and a fresh Nova turn
 * streams in over the same SSE contract as /api/ai/chat. The user message
 * is already persisted, so the turn runs with `skipUserInsert`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const parsed = tutorEditSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }
    const { conversationId, messageId, content } = parsed.data;

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "tutor",
      capability: "take_assessments",
      skipGatewayCheck: true,
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    // Ownership: the conversation must belong to the caller (RLS also
    // enforces this — double-check for a clean error message).
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conversation) return jsonError("Conversation not found", 404);

    // The edited message must be an existing user message in that thread.
    const { data: target } = await supabase
      .from("ai_messages")
      .select("id, role, created_at, grounding_note_ids")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (!target || target.role !== "user") {
      return jsonError("Message not found — only your own messages can be edited", 404);
    }

    // Collect everything at or after the edited message's timestamp so the
    // stale tail (including the old assistant reply) can be removed.
    const { data: thread } = await supabase
      .from("ai_messages")
      .select("id, created_at")
      .eq("conversation_id", conversationId)
      .gte("created_at", target.created_at)
      .order("created_at", { ascending: false });
    const staleIds = (thread ?? [])
      .filter((row) => row.id !== target.id)
      .map((row) => row.id);

    if (staleIds.length > 0) {
      const { data: deleted, error: deleteError } = await supabase
        .from("ai_messages")
        .delete()
        .in("id", staleIds)
        .select("id");
      if (deleteError) {
        return jsonError(`Could not trim the thread: ${deleteError.message}`, 500);
      }
      if (!deleted || deleted.length !== staleIds.length) {
        // RLS blocked the delete — the deployment is missing the
        // 00017 Nova chat-history policies.
        return jsonError(
          "The thread could not be rewritten (missing database policies). Ask the administrator to apply migration 00017_nova_chat_history.sql.",
          500,
        );
      }
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("ai_messages")
      .update({ content })
      .eq("id", target.id)
      .select("id");
    if (updateError) {
      return jsonError(`Could not update your message: ${updateError.message}`, 500);
    }
    if (!updatedRows || updatedRows.length === 0) {
      return jsonError(
        "Your message could not be updated (missing database policies). Ask the administrator to apply migration 00017_nova_chat_history.sql.",
        500,
      );
    }

    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const noteIds = target.grounding_note_ids ?? [];
    const turn = runNovaTurn({
      db: supabase,
      userId,
      conversationId,
      message: content,
      noteIds,
      skipUserInsert: true,
    });

    return await startNovaStream(
      turn,
      conversationId,
      async () => {
        const queueId = await enqueueAiTask(
          "tutor",
          { userId, conversationId, message: content, noteIds },
          userId,
        );
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "tutor", modelForTask("tutor"), "queued");
        return jsonError(
          "The AI gateway is unreachable — your edit was saved and queued for an answer.",
          202,
        );
      },
    );
  } catch (error) {
    console.error("[api:ai/chat/edit]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}
