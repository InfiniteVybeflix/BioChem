"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  ChatWindow,
  type ChatMemberInfo,
  type ChatMessage,
} from "@/components/messages/chat-window";
import { decryptText } from "@/lib/chat/crypto";
import { chatAttachment, isChatMessageKind, type Json } from "@/types/domain";

/**
 * Bridges the server-rendered ciphertext rows into the realtime
 * ChatWindow: the initial batch is decrypted in the browser (the key
 * never leaves the client side of the equation), then the window
 * takes over with realtime inserts.
 */

export interface RawMessage {
  id: string;
  senderId: string;
  kind: string;
  cipherB64: string;
  iv: string;
  attachment: Json | null;
  createdAt: string;
  deletedAt: string | null;
}

export function ConversationView({
  conversationId,
  kind,
  title,
  subtitle,
  me,
  members,
  rawMessages,
  keyB64,
}: {
  conversationId: string;
  kind: "direct" | "group" | "lounge";
  title: string;
  subtitle: string;
  me: string;
  members: ChatMemberInfo[];
  rawMessages: RawMessage[];
  keyB64: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const decrypted: ChatMessage[] = [];
      for (const row of rawMessages) {
        const text =
          row.kind === "text" && keyB64 ? await decryptText(keyB64, row.cipherB64, row.iv) : null;
        if (cancelled) return;
        decrypted.push({
          id: row.id,
          senderId: row.senderId,
          kind: isChatMessageKind(row.kind) ? row.kind : "text",
          text,
          attachment: chatAttachment(row.attachment),
          createdAt: row.createdAt,
          deleted: Boolean(row.deletedAt),
          readBy: new Set<string>([row.senderId]),
        });
      }
      if (!cancelled) setMessages(decrypted);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawMessages, keyB64]);

  if (messages === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2
          className="text-muted-foreground size-6 animate-spin"
          aria-label="Decrypting conversation"
        />
      </div>
    );
  }

  return (
    <ChatWindow
      conversationId={conversationId}
      kind={kind}
      title={title}
      subtitle={subtitle}
      me={me}
      members={members}
      initialMessages={messages}
      initialKey={keyB64}
      onBack={() => router.push("/messages")}
    />
  );
}
