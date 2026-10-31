import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConversationView } from "@/components/messages/conversation-view";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

/**
 * One realtime conversation (direct chat, study group or lounge).
 * Membership is enforced by RLS — a conversation you're not in simply
 * doesn't resolve, and the page 404s. The key + ciphertext rows are
 * handed to the client, which decrypts and renders.
 */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const auth = supabase ? await getAuthContext() : null;
  if (!supabase || !auth) redirect(`/login?next=/messages/${id}`);

  const [{ data: conversation }, { data: keyRow }, { data: memberRows }] = await Promise.all([
    supabase.from("chat_conversations").select("*").eq("id", id).maybeSingle(),
    supabase.from("chat_keys").select("key_b64").eq("conversation_id", id).maybeSingle(),
    supabase
      .from("chat_members")
      .select("user_id, role, profiles(full_name, avatar_url)")
      .eq("conversation_id", id)
      .limit(100),
  ]);

  if (!conversation) notFound();

  const { data: messageRows } = await supabase
    .from("chat_messages")
    .select("id, sender_id, kind, cipher_b64, iv, attachment, created_at, deleted_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(150);

  const members = (memberRows ?? []).map((row) => ({
    userId: row.user_id,
    name: row.profiles?.full_name ?? "Student",
    avatarUrl: row.profiles?.avatar_url ?? null,
    role: row.role,
  }));

  const other = members.find((member) => member.userId !== auth.user.id);
  const title =
    conversation.kind === "direct"
      ? (other?.name ?? "Direct chat")
      : (conversation.name ??
        (conversation.kind === "lounge" ? "Community Lounge" : "Study group"));
  const subtitle =
    conversation.kind === "direct"
      ? other
        ? "Direct · encrypted"
        : "Direct chat"
      : `${members.length} member${members.length === 1 ? "" : "s"} · encrypted`;

  return (
    <ConversationView
      conversationId={id}
      kind={
        conversation.kind === "direct"
          ? "direct"
          : conversation.kind === "lounge"
            ? "lounge"
            : "group"
      }
      title={title}
      subtitle={subtitle}
      me={auth.user.id}
      members={members.map(({ userId, name, avatarUrl }) => ({ userId, name, avatarUrl }))}
      rawMessages={(messageRows ?? []).map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        kind: row.kind,
        cipherB64: row.cipher_b64,
        iv: row.iv,
        attachment: row.attachment,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
      }))}
      keyB64={keyRow?.key_b64 ?? null}
    />
  );
}
