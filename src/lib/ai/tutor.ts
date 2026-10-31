import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gatewayChat, type GatewayMessage } from "@/lib/ai/gateway";
import { TUTOR_SYSTEM_PROMPT, buildTutorContext } from "@/lib/ai/prompts";
import { notifyUsers } from "@/lib/push";
import type { Database } from "@/types/domain";

/**
 * AI tutor reply generation.
 *
 * The chat route streams the reply directly; when the gateway is unreachable
 * the request is queued and this module regenerates the answer later
 * (non-streaming) via the queue processor. Both paths share
 * `buildTutorMessages` so the model sees exactly the same context.
 */

type AiMessageRow = Database["public"]["Tables"]["ai_messages"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

export interface TutorHistoryMessage {
  role: string;
  content: string;
}

export interface TutorNote {
  id: string;
  title: string;
  content_md: string;
}

/**
 * Builds the gateway message list: tutor system prompt, optional grounding
 * context from the caller's notes, the recent conversation history, and the
 * new user message.
 */
export function buildTutorMessages(
  history: TutorHistoryMessage[],
  message: string,
  notes: Pick<NoteRow, "title" | "content_md">[],
): GatewayMessage[] {
  const messages: GatewayMessage[] = [{ role: "system", content: TUTOR_SYSTEM_PROMPT }];

  const context = buildTutorContext(notes);
  if (context) messages.push({ role: "system", content: context });

  for (const entry of history) {
    if (entry.role !== "user" && entry.role !== "assistant") continue;
    if (entry.content.trim().length === 0) continue;
    messages.push({ role: entry.role, content: entry.content });
  }

  messages.push({ role: "user", content: message });
  return messages;
}

/** Last `limit` messages of a conversation, oldest first. */
export async function loadTutorHistory(
  conversationId: string,
  limit = 20,
): Promise<TutorHistoryMessage[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  const { data } = await admin
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).reverse();
}

async function loadGroundingNotes(noteIds: string[]): Promise<TutorNote[]> {
  if (noteIds.length === 0) return [];
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  const { data } = await admin
    .from("notes")
    .select("id, title, content_md")
    .eq("status", "published")
    .in("id", noteIds);
  return data ?? [];
}

/**
 * Regenerates a tutor answer for a queued chat turn: ensures the user's
 * message exists, calls the gateway (non-streaming), persists the assistant
 * message, and notifies the user that the tutor replied.
 */
export async function generateTutorReply(
  userId: string,
  conversationId: string,
  message: string,
  noteIds: string[],
): Promise<{ reply: string; model: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  // The chat route normally persists the user's message before the gateway
  // call; insert it defensively when it is missing so the answer lands in a
  // coherent thread.
  const { data: recent } = await admin
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = recent?.[0];
  if (!last || last.role !== "user" || last.content !== message) {
    const { error } = await admin
      .from("ai_messages")
      .insert({ conversation_id: conversationId, role: "user", content: message });
    if (error) throw new Error(`Failed to persist tutor message: ${error.message}`);
  }

  const history = await loadTutorHistory(conversationId, 20);
  // Drop the trailing user turn so it is not sent to the model twice.
  const trimmed =
    history.length > 0 &&
    history[history.length - 1].role === "user" &&
    history[history.length - 1].content === message
      ? history.slice(0, -1)
      : history;

  const notes = await loadGroundingNotes(noteIds);
  const messages = buildTutorMessages(trimmed, message, notes);

  const result = await gatewayChat("tutor", messages);
  if (result.content.trim().length === 0) {
    throw new Error("The tutor returned an empty reply");
  }

  const { error } = await admin.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: result.content,
    grounding_note_ids: noteIds,
    model: result.model,
  });
  if (error) throw new Error(`Failed to persist tutor reply: ${error.message}`);

  await admin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  await notifyUsers([userId], "system", {
    title: "AI tutor replied",
    body: message.slice(0, 80),
    link: "/ai/tutor",
  });

  return { reply: result.content, model: result.model };
}

/** Row shape helper for consumers that list tutor threads. */
export type AiMessageListRow = AiMessageRow;
