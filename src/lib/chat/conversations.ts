"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ChatAttachment } from "@/types/domain";
import { toJson } from "@/types/domain";
import { generateConversationKey } from "@/lib/chat/crypto";

/**
 * Conversation plumbing on top of the RLS-secured tables:
 * creating direct chats (deduplicated), study groups and the shared
 * community lounge, plus encrypted-attachment upload/download.
 */

type Client = SupabaseClient<Database>;
type ConversationRow = Database["public"]["Tables"]["chat_conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];

export interface ConversationSummary {
  conversation: ConversationRow;
  memberCount: number;
  otherName: string | null;
  lastPreview: string | null;
  lastAt: string;
  unread: boolean;
}

/** Creates a direct conversation with `otherUserId` (idempotent). */
export async function createDirectConversation(
  client: Client,
  me: string,
  otherUserId: string,
): Promise<ConversationRow | null> {
  // Existing? (Both members present on a direct conversation of mine.)
  const { data: myDirects } = await client
    .from("chat_members")
    .select("conversation_id, chat_conversations!inner(kind)")
    .eq("user_id", me)
    .eq("chat_conversations.kind", "direct")
    .limit(100);
  if (myDirects && myDirects.length > 0) {
    const ids = myDirects.map((row) => row.conversation_id);
    const { data: theirs } = await client
      .from("chat_members")
      .select("conversation_id")
      .in("conversation_id", ids)
      .eq("user_id", otherUserId)
      .limit(1);
    if (theirs && theirs.length > 0) {
      const { data: existing } = await client
        .from("chat_conversations")
        .select("*")
        .eq("id", theirs[0].conversation_id)
        .maybeSingle();
      if (existing) return existing;
    }
  }

  const keyB64 = generateConversationKey();
  const { data: conversation, error } = await client
    .from("chat_conversations")
    .insert({ kind: "direct", created_by: me })
    .select("*")
    .single();
  if (error || !conversation) return null;

  const { error: memberError } = await client.from("chat_members").insert([
    { conversation_id: conversation.id, user_id: me, role: "owner" },
    { conversation_id: conversation.id, user_id: otherUserId, role: "member" },
  ]);
  if (memberError) return null;

  await client.from("chat_keys").insert({ conversation_id: conversation.id, key_b64: keyB64 });
  return conversation;
}

/** Creates a study group with the given members. */
export async function createGroupConversation(
  client: Client,
  me: string,
  name: string,
  memberIds: string[],
): Promise<ConversationRow | null> {
  const keyB64 = generateConversationKey();
  const { data: conversation, error } = await client
    .from("chat_conversations")
    .insert({ kind: "group", name: name.trim().slice(0, 80), created_by: me })
    .select("*")
    .single();
  if (error || !conversation) return null;

  const rows = [
    { conversation_id: conversation.id, user_id: me, role: "owner" },
    ...memberIds
      .filter((id) => id !== me)
      .map((id) => ({ conversation_id: conversation.id, user_id: id, role: "member" })),
  ];
  const { error: memberError } = await client.from("chat_members").insert(rows);
  if (memberError) return null;

  await client.from("chat_keys").insert({ conversation_id: conversation.id, key_b64: keyB64 });
  return conversation;
}

/**
 * Joins (or creates) the shared community lounge — an open room anyone
 * can enter. Key note: when the lounge already exists the joiner
 * simply adds their own member row; the key is readable via RLS.
 */
export async function joinLounge(client: Client, me: string): Promise<ConversationRow | null> {
  const { data: existing } = await client
    .from("chat_conversations")
    .select("*")
    .eq("kind", "lounge")
    .limit(1)
    .maybeSingle();

  if (existing) {
    await client
      .from("chat_members")
      .upsert(
        { conversation_id: existing.id, user_id: me, role: "member" },
        { onConflict: "conversation_id,user_id" },
      );
    return existing;
  }

  const keyB64 = generateConversationKey();
  const { data: lounge, error } = await client
    .from("chat_conversations")
    .insert({ kind: "lounge", name: "Community Lounge", created_by: me })
    .select("*")
    .single();
  if (error || !lounge) return null;
  await client.from("chat_members").insert({
    conversation_id: lounge.id,
    user_id: me,
    role: "owner",
  });
  await client.from("chat_keys").insert({ conversation_id: lounge.id, key_b64: keyB64 });
  return lounge;
}

/** Loads all conversations of the signed-in user with display metadata. */
export async function loadConversations(
  client: Client,
  me: string,
): Promise<ConversationSummary[]> {
  const { data: memberships } = await client
    .from("chat_members")
    .select("conversation_id, last_read_at, chat_conversations(*)")
    .order("last_read_at", { ascending: false })
    .limit(100);
  if (!memberships) return [];

  const ids = memberships.map((row) => row.conversation_id);
  const [{ data: allMembers }, { data: profiles }] = await Promise.all([
    client.from("chat_members").select("conversation_id, user_id").in("conversation_id", ids),
    client.from("profiles").select("id, full_name").limit(2000),
  ]);
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const summaries: ConversationSummary[] = [];
  for (const membership of memberships) {
    const conversation = membership.chat_conversations;
    if (!conversation) continue;
    const members = (allMembers ?? []).filter(
      (member) => member.conversation_id === conversation.id,
    );
    const other = members.find((member) => member.user_id !== me);
    const lastRead = membership.last_read_at ? new Date(membership.last_read_at).getTime() : 0;
    summaries.push({
      conversation,
      memberCount: members.length,
      otherName:
        conversation.kind === "direct"
          ? other
            ? (nameById.get(other.user_id) ?? "Student")
            : "Direct chat"
          : null,
      lastPreview: null,
      lastAt: conversation.last_message_at,
      unread: lastRead < new Date(conversation.last_message_at).getTime() - 2000,
    });
  }
  summaries.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return summaries;
}

/** Uploads an encrypted attachment and returns its metadata. */
export async function uploadEncryptedAttachment(
  client: Client,
  keyB64: string,
  conversationId: string,
  file: File,
): Promise<ChatAttachment | null> {
  const { encryptFile } = await import("@/lib/chat/crypto");
  const { blob } = await encryptFile(keyB64, file);
  const path = `${conversationId}/${crypto.randomUUID()}.${file.name.split(".").pop() ?? "bin"}`;
  const { error } = await client.storage.from("chat-files").upload(path, blob, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (error) return null;
  return { path, name: file.name, mime: file.type || "application/octet-stream", size: blob.size };
}

/** Downloads + decrypts an attachment into an object URL. */
export async function downloadEncryptedAttachment(
  client: Client,
  keyB64: string,
  attachment: ChatAttachment,
): Promise<string | null> {
  const { decryptFile } = await import("@/lib/chat/crypto");
  const { data, error } = await client.storage.from("chat-files").download(attachment.path);
  if (error || !data) return null;
  try {
    const blob = await decryptFile(keyB64, await data.arrayBuffer());
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export { toJson };
export type { MessageRow };
