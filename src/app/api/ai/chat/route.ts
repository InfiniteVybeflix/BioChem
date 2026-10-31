import { jsonOk, jsonError } from "@/lib/api";
import { tutorChatSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";
import { GatewayError, gatewayChatStream, gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { buildTutorMessages } from "@/lib/ai/tutor";
import {
  extractMediaMarkers,
  searchCommonsImage,
  searchWikipediaLinks,
  type ResolvedImage,
  type ResolvedLink,
} from "@/lib/ai/media";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import type { Database } from "@/types/domain";
import type { GatewayMessage } from "@/lib/ai/gateway";

/**
 * POST /api/ai/chat — streaming AI tutor turn.
 *
 * SSE contract: `data: {"delta":"…"}\n\n` chunks, terminated by
 * `data: [DONE]\n\n`. The new conversation id travels in the
 * `X-Conversation-Id` response header.
 */

type HistoryRow = Pick<Database["public"]["Tables"]["ai_messages"]["Row"], "role" | "content">;

function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body: unknown = await req.json().catch(() => null);
    const parsed = tutorChatSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body", 400);
    }
    const { conversationId, message, noteIds } = parsed.data;

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "tutor",
      capability: "take_assessments",
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    // 1. Resolve the conversation (create or verify ownership).
    let activeConversationId = conversationId ?? null;
    if (activeConversationId) {
      const { data: existing } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", activeConversationId)
        .maybeSingle();
      if (!existing) return jsonError("Conversation not found", 404);
    } else {
      const { data: created, error } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: userId,
          title: message.slice(0, 60),
        })
        .select("id")
        .single();
      if (error || !created) {
        return jsonError(
          `Could not create the conversation: ${error?.message ?? "unknown error"}`,
          500,
        );
      }
      activeConversationId = created.id;
    }
    const conversationIdFinal: string = activeConversationId;

    // 2. Load recent history for memory.
    const { data: historyRows } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationIdFinal)
      .order("created_at", { ascending: false })
      .limit(20);
    const history: HistoryRow[] = (historyRows ?? []).reverse();

    // 3. Grounding notes.
    let notes: { title: string; content_md: string }[] = [];
    if (noteIds.length > 0) {
      const { data: noteRows } = await supabase
        .from("notes")
        .select("id, title, content_md")
        .eq("status", "published")
        .in("id", noteIds);
      notes = noteRows ?? [];
    }

    // 4. Persist the user's message before contacting the gateway.
    const { error: insertError } = await supabase.from("ai_messages").insert({
      conversation_id: conversationIdFinal,
      role: "user",
      content: message,
    });
    if (insertError) {
      return jsonError(`Could not save your message: ${insertError.message}`, 500);
    }
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationIdFinal);

    const messages: GatewayMessage[] = buildTutorMessages(history, message, notes);

    // 5. Establish the stream BEFORE committing to a 200 response so gateway
    // failures can still fall back to the durable queue.
    const generator = gatewayChatStream("tutor", messages);
    let firstDelta: string | null = null;
    try {
      const first = await generator.next();
      if (!first.done) firstDelta = first.value;
    } catch (error) {
      if (error instanceof GatewayError) {
        if (!gatewayConfigured()) {
          return jsonError("Aevibron gateway is not configured on this deployment", 503);
        }
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
      }
      throw error;
    }

    // 6. Stream the reply to the client while persisting it on flush.
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const model = modelForTask("tutor");
    const startedAt = Date.now();

    void (async () => {
      let full = "";
      try {
        if (firstDelta !== null) {
          full = firstDelta;
          await writer.write(encoder.encode(sseData({ delta: firstDelta })));
        }
        while (true) {
          const next = await generator.next();
          if (next.done) break;
          full += next.value;
          await writer.write(encoder.encode(sseData({ delta: next.value })));
        }

        if (full.trim().length > 0) {
          // Resolve [[MEDIA:…]] / [[LINKS:…]] markers into real, attributed
          // resources (images never stream — they ship as a final payload).
          const markers = extractMediaMarkers(full);
          const images: ResolvedImage[] = [];
          const links: ResolvedLink[] = [];
          if (markers.imageQueries.length > 0) {
            const found = await Promise.all(
              markers.imageQueries.map((query) => searchCommonsImage(query)),
            );
            for (const image of found) if (image) images.push(image);
          }
          if (markers.linkQueries.length > 0) {
            const found = await Promise.all(
              markers.linkQueries.map((query) => searchWikipediaLinks(query, 1)),
            );
            for (const group of found) links.push(...group);
          }

          const mediaFooter =
            images.length > 0 || links.length > 0
              ? `\n\n<!--BCMEDIA:${JSON.stringify({ images, links }).replace(/-->/g, "-- >")}-->`
              : "";
          const savedContent = markers.cleanText + mediaFooter;

          const { error: replyError } = await supabase.from("ai_messages").insert({
            conversation_id: conversationIdFinal,
            role: "assistant",
            content: savedContent,
            grounding_note_ids: noteIds,
            model,
          });
          if (replyError) throw new Error(`Could not save the reply: ${replyError.message}`);
          await supabase
            .from("ai_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationIdFinal);
          await recordAiUsage(userId, "tutor", model, "ok", Date.now() - startedAt);
          if (images.length > 0 || links.length > 0) {
            await writer.write(encoder.encode(sseData({ media: { images, links } })));
          }
        } else {
          await recordAiUsage(userId, "tutor", model, "failed", Date.now() - startedAt);
          await writer.write(
            encoder.encode(
              sseData({
                error: "The tutor returned an empty response — please resend your question.",
              }),
            ),
          );
        }
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("[api:ai/chat] stream failed:", error);
        try {
          await recordAiUsage(userId, "tutor", model, "failed", Date.now() - startedAt);
          await writer.write(
            encoder.encode(
              sseData({
                error: "The tutor stream ended unexpectedly — please resend your question.",
              }),
            ),
          );
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        } catch {
          // The client already disconnected — nothing left to deliver.
        }
      } finally {
        void writer.close().catch(() => undefined);
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Conversation-Id": conversationIdFinal,
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[api:ai/chat]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}
