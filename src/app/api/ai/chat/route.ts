import { jsonOk, jsonError } from "@/lib/api";
import { tutorChatSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { directoryForRole } from "@/lib/ai/nova/directory";
import { detectNavigation } from "@/lib/ai/nova/facts";
import { runNavigationTurn, runNovaTurn } from "@/lib/ai/nova/turn";
import { startNovaStream } from "@/lib/ai/nova/http";

/**
 * POST /api/ai/chat — streaming Nova turn.
 *
 * SSE contract: `data: {"delta":"…"}` chunks, then optional
 * `data: {"actions":[…]}` (real, validated page actions the browser
 * executes) and `data: {"media":{…}}` payloads, terminated by
 * `data: [DONE]`. The new conversation id travels in the
 * `X-Conversation-Id` response header.
 *
 * Direct navigation commands ("open the mock zone") never touch the
 * gateway — the platform performs the action immediately.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const parsed = tutorChatSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }
    const { conversationId, message, noteIds } = parsed.data;

    // Direct navigation turns skip the gateway entirely, so the guard must
    // not demand a configured gateway up front.
    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "tutor",
      capability: "take_assessments",
      skipGatewayCheck: true,
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    // 1. Resolve the conversation (create or verify ownership).
    //    The user-scoped write is tried first; if RLS/policy drift on the
    //    deployment blocks it (e.g. migrations not yet applied) the row is
    //    written through the service role instead — the caller is already
    //    authenticated and authorised by the guard above, so starting a
    //    conversation must never fail on storage policy drift.
    const admin = getSupabaseAdminClient();
    let activeConversationId = conversationId ?? null;
    if (activeConversationId) {
      const { data: existing } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", activeConversationId)
        .maybeSingle();
      if (!existing && admin) {
        // Maybe the user-scoped select was blocked too — verify via admin.
        const { data: existingAdmin } = await admin
          .from("ai_conversations")
          .select("id, user_id")
          .eq("id", activeConversationId)
          .maybeSingle();
        if (!existingAdmin || existingAdmin.user_id !== userId) {
          return jsonError("Conversation not found", 404);
        }
      } else if (!existing) {
        return jsonError("Conversation not found", 404);
      }
    } else {
      const conversationRow = { user_id: userId, title: message.slice(0, 60) };
      let created: { id: string } | null = null;
      let createError: { message: string } | null = null;
      const owned = await supabase
        .from("ai_conversations")
        .insert(conversationRow)
        .select("id")
        .single();
      created = owned.data;
      createError = owned.error;
      if ((createError || !created) && admin) {
        console.warn("[api:ai/chat] user-scoped conversation insert failed, using service role:", createError?.message);
        const elevated = await admin
          .from("ai_conversations")
          .insert(conversationRow)
          .select("id")
          .single();
        created = elevated.data;
        createError = elevated.error;
      }
      if (createError || !created) {
        return jsonError(
          `Could not create the conversation: ${createError?.message ?? "unknown error"}`,
          500,
        );
      }
      activeConversationId = created.id;
    }
    const conversationIdFinal: string = activeConversationId;

    // 2. Role-scoped directory + direct navigation detection.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const pages = directoryForRole(profile?.role ?? "student");
    const navigation = detectNavigation(message, pages);

    // 3. Persist the user's message before contacting the gateway (the
    //    direct-navigation turn persists its own copy).
    if (!navigation.pure) {
      const messageRow = {
        conversation_id: conversationIdFinal,
        role: "user" as const,
        content: message,
      };
      const { error: insertError } = await supabase.from("ai_messages").insert(messageRow);
      if (insertError) {
        if (admin) {
          console.warn("[api:ai/chat] user-scoped message insert failed, using service role:", insertError.message);
          const { error: elevatedError } = await admin.from("ai_messages").insert(messageRow);
          if (elevatedError) {
            return jsonError(`Could not save your message: ${elevatedError.message}`, 500);
          }
        } else {
          return jsonError(`Could not save your message: ${insertError.message}`, 500);
        }
      }
      await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationIdFinal);
    }

    const isDirectNav = navigation.pure && navigation.pages.length > 0;
    if (!isDirectNav && !gatewayConfigured()) {
      return jsonError("Aevibron gateway is not configured on this deployment", 503);
    }

    // 4. Establish the stream; gateway failures fall back to the durable queue.
    const turn = isDirectNav
      ? runNavigationTurn({
          db: supabase,
          conversationId: conversationIdFinal,
          message,
          page: navigation.pages[0],
          noteIds,
        })
      : runNovaTurn({
          db: supabase,
          userId,
          conversationId: conversationIdFinal,
          message,
          noteIds,
        });

    return await startNovaStream(
      turn,
      conversationIdFinal,
      async () => {
        const queueId = await enqueueAiTask(
          "tutor",
          { userId, conversationId: conversationIdFinal, message, noteIds },
          userId,
        );
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "tutor", modelForTask("tutor"), "queued");
        return jsonOk({ queued: true, conversationId: conversationIdFinal }, { status: 202 });
      },
    );
  } catch (error) {
    console.error("[api:ai/chat]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}
