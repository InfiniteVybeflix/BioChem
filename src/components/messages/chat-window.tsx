"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  File as FileIcon,
  Flag,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { decryptText, encryptText, encryptFile, decryptFile } from "@/lib/chat/crypto";
import { uploadEncryptedAttachment, downloadEncryptedAttachment } from "@/lib/chat/conversations";
import {
  chatAttachment,
  isChatMessageKind,
  type ChatAttachment,
  type ChatMessageKind,
} from "@/types/domain";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * The realtime conversation window.
 *
 * - Message bodies are AES-256-GCM encrypted in the browser; the DB
 *   stores only ciphertext + IV.
 * - Attachments (images / video / voice notes / files) are encrypted
 *   before upload and streamed back in the correct format.
 * - Realtime: new messages arrive over the Supabase channel; typing
 *   indicators and presence (who's online) ride on the same channel.
 */

export interface ChatMessage {
  id: string;
  senderId: string;
  kind: ChatMessageKind;
  text: string | null;
  attachment: ChatAttachment | null;
  createdAt: string;
  deleted: boolean;
  readBy: Set<string>;
  pending?: boolean;
}

export interface ChatMemberInfo {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE d MMM");
}

function timeLabel(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

export function ChatWindow({
  conversationId,
  kind,
  title,
  subtitle,
  me,
  members,
  initialMessages,
  initialKey,
  onBack,
}: {
  conversationId: string;
  kind: "direct" | "group" | "lounge";
  title: string;
  subtitle: string;
  me: string;
  members: ChatMemberInfo[];
  initialMessages: ChatMessage[];
  initialKey: string | null;
  onBack?: () => void;
}) {
  const supabase = getSupabaseBrowserClient();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [keyB64] = useState<string | null>(initialKey);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastReadMarked = useRef<string | null>(null);

  const nameById = useMemo(
    () => new Map(members.map((member) => [member.userId, member.name])),
    [members],
  );

  // ------------------------------------------------------------------
  // Realtime: incoming messages, typing, presence
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel(`conv:${conversationId}`, { config: { presence: { key: me } } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            sender_id: string;
            kind: string;
            cipher_b64: string;
            iv: string;
            attachment: unknown;
            created_at: string;
            deleted_at: string | null;
          };
          if (row.sender_id === me) return; // own messages are added on send
          void (async () => {
            const text =
              row.kind === "text" && keyB64
                ? await decryptText(keyB64, row.cipher_b64, row.iv)
                : null;
            setMessages((prev) =>
              prev.some((message) => message.id === row.id)
                ? prev
                : [
                    ...prev,
                    {
                      id: row.id,
                      senderId: row.sender_id,
                      kind: isChatMessageKind(row.kind) ? row.kind : "text",
                      text,
                      attachment: chatAttachment(row.attachment),
                      createdAt: row.created_at,
                      deleted: Boolean(row.deleted_at),
                      readBy: new Set<string>(),
                    },
                  ],
            );
          })();
        },
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as { userId: string; name: string; active: boolean };
        if (!data || data.userId === me) return;
        setTypingNames((prev) =>
          data.active
            ? prev.includes(data.name)
              ? prev
              : [...prev, data.name]
            : prev.filter((name) => name !== data.name),
        );
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const online = new Set<string>();
        for (const [presenceKey] of Object.entries(state)) online.add(presenceKey);
        setOnlineIds(online);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online_at: new Date().toISOString() });
      });

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [supabase, conversationId, me, keyB64]);

  // Typing indicator auto-clear
  useEffect(() => {
    if (typingNames.length === 0) return;
    const timer = setTimeout(() => setTypingNames([]), 4000);
    return () => clearTimeout(timer);
  }, [typingNames]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typingNames.length]);

  // Mark read
  const markRead = useCallback(async () => {
    if (!supabase) return;
    const latest = messages[messages.length - 1];
    if (!latest || latest.senderId === me) return;
    if (lastReadMarked.current === latest.id) return;
    lastReadMarked.current = latest.id;
    await supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", me);
  }, [supabase, conversationId, me, messages]);

  useEffect(() => {
    void markRead();
  }, [markRead]);

  // ------------------------------------------------------------------
  // Sending
  // ------------------------------------------------------------------
  const broadcastTyping = (active: boolean) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me, name: nameById.get(me) ?? "Someone", active },
    });
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!supabase || !keyB64 || (!text && !recording) || sending) return;
    setSending(true);
    setDraft("");
    broadcastTyping(false);
    try {
      const { cipherB64, iv } = await encryptText(keyB64, text);
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: me,
          kind: "text",
          cipher_b64: cipherB64,
          iv,
        })
        .select("id, created_at")
        .single();
      if (error || !data) throw new Error("send failed");
      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          senderId: me,
          kind: "text",
          text,
          attachment: null,
          createdAt: data.created_at,
          deleted: false,
          readBy: new Set([me]),
        },
      ]);
    } catch {
      toast.error("Message not sent — check your connection");
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (file: File, kind: ChatMessageKind) => {
    if (!supabase || !keyB64) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Files are capped at 25 MB in chats");
      return;
    }
    setUploading(true);
    try {
      const attachment = await uploadEncryptedAttachment(supabase, keyB64, conversationId, file);
      if (!attachment) throw new Error("upload failed");

      // The attachment IV is needed to decrypt; store it inside the
      // encrypted envelope: we re-use cipher_b64 for the caption and
      // keep the file IV in the attachment metadata's `iv` field via
      // the message row. Simplest robust scheme: encrypt the *file
      // IV* is unnecessary — the blob embeds its IV. Metadata is safe
      // (name/mime/size are not sensitive).
      const { data, error } = await supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: me,
          kind,
          cipher_b64: "",
          iv: "",
          attachment: {
            path: attachment.path,
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size,
          },
        })
        .select("id, created_at")
        .single();
      if (error || !data) throw new Error("insert failed");
      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          senderId: me,
          kind,
          text: null,
          attachment,
          createdAt: data.created_at,
          deleted: false,
          readBy: new Set([me]),
        },
      ]);
    } catch {
      toast.error("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = (accept: string, kind: ChatMessageKind) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) void sendAttachment(file, kind);
    };
    input.click();
  };

  // ------------------------------------------------------------------
  // Voice notes
  // ------------------------------------------------------------------
  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size > 0) {
          void sendAttachment(
            new File([blob], `voice-note-${Date.now()}.webm`, { type: mime }),
            "voice",
          );
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Microphone unavailable — check browser permissions");
    }
  };

  // ------------------------------------------------------------------
  // Media loading (images / videos / audio / files)
  // ------------------------------------------------------------------
  const loadMedia = useCallback(
    async (message: ChatMessage) => {
      if (!supabase || !keyB64 || !message.attachment || mediaUrls[message.id]) return;
      const url = await downloadEncryptedAttachment(supabase, keyB64, message.attachment);
      if (url) setMediaUrls((prev) => ({ ...prev, [message.id]: url }));
    },
    [supabase, keyB64, mediaUrls],
  );

  useEffect(() => {
    for (const message of messages) {
      if (message.attachment && !mediaUrls[message.id] && !message.deleted) {
        void loadMedia(message);
      }
    }
  }, [messages, mediaUrls, loadMedia]);

  const reportMessage = async (messageId: string) => {
    if (!supabase) return;
    const reason = window.prompt(
      "Why are you reporting this message? (The platform team can remove it without reading its content.)",
    );
    if (!reason || reason.trim().length < 3) return;
    const { error } = await supabase.from("chat_reports").insert({
      reporter_id: me,
      message_id: messageId,
      reason: reason.trim().slice(0, 500),
    });
    if (error) {
      toast.error("Could not send the report");
      return;
    }
    toast.success("Reported — the platform team has been notified");
  };

  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length > 1
        ? "several people are typing…"
        : null;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  let lastDay = "";

  return (
    <div className="glass-card flex h-[calc(100dvh-11rem)] min-h-96 flex-col overflow-hidden p-0">
      {/* Header */}
      <header className="border-border/60 flex items-center gap-3 border-b p-3 sm:p-4">
        {onBack ? (
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={onBack}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-semibold">
            {kind === "lounge" ? <Users className="size-4 shrink-0" aria-hidden /> : null}
            {title}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {subtitle}
            {onlineIds.size > 1 ? ` · ${onlineIds.size} online` : ""}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-muted-foreground/70 text-sm">No messages yet — say hello 👋</p>
            <p className="text-muted-foreground/50 mt-1 text-xs">
              Everything you send here is encrypted.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const mine = message.senderId === me;
          const day = dayLabel(message.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mediaUrl = mediaUrls[message.id];

          return (
            <div key={message.id}>
              {showDay ? (
                <p className="text-muted-foreground/70 my-3 text-center text-[11px] font-medium tracking-wide uppercase">
                  {day}
                </p>
              ) : null}
              <div className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "group max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                    mine
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted/60 rounded-bl-sm",
                    message.deleted && "italic opacity-50",
                  )}
                >
                  {!mine && kind !== "direct" ? (
                    <p className="text-muted-foreground mb-0.5 text-[11px] font-semibold">
                      {nameById.get(message.senderId) ?? "Student"}
                    </p>
                  ) : null}

                  {message.deleted ? (
                    <p className="text-muted-foreground">Message removed</p>
                  ) : message.kind === "text" ? (
                    <p className="leading-relaxed break-words whitespace-pre-wrap">
                      {message.text ?? "🔒 Encrypted message"}
                    </p>
                  ) : message.attachment ? (
                    <div className="space-y-1">
                      {message.kind === "image" ? (
                        mediaUrl ? (
                          <img
                            src={mediaUrl}
                            alt={message.attachment.name}
                            className="max-h-72 w-full rounded-xl object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <ImageIcon className="size-4" aria-hidden /> Decrypting photo…
                          </span>
                        )
                      ) : message.kind === "video" ? (
                        mediaUrl ? (
                          <video src={mediaUrl} controls className="max-h-72 w-full rounded-xl" />
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Video className="size-4" aria-hidden /> Decrypting video…
                          </span>
                        )
                      ) : message.kind === "voice" || message.kind === "audio" ? (
                        mediaUrl ? (
                          <audio src={mediaUrl} controls className="w-56 max-w-full" />
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Mic className="size-4" aria-hidden /> Decrypting voice note…
                          </span>
                        )
                      ) : mediaUrl ? (
                        <a
                          href={mediaUrl}
                          download={message.attachment.name}
                          className="flex items-center gap-2 underline underline-offset-2"
                        >
                          <Download className="size-4" aria-hidden />
                          {message.attachment.name}
                        </a>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-2">
                          <FileIcon className="size-4" aria-hidden /> Decrypting file…
                        </span>
                      )}
                      {message.kind !== "image" && message.kind !== "video" ? (
                        <p className="text-muted-foreground text-[11px]">
                          {message.attachment.name} · {Math.round(message.attachment.size / 1024)}{" "}
                          KB
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <p
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[10px]",
                      mine ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {timeLabel(message.createdAt)}
                    {mine ? (
                      message.readBy.size > 1 ? (
                        <CheckCheck className="size-3" aria-label="Read" />
                      ) : (
                        <Check className="size-3" aria-label="Sent" />
                      )
                    ) : null}
                  </p>
                </div>

                {!mine ? (
                  <button
                    type="button"
                    className="text-muted-foreground/40 hover:text-destructive mt-auto ml-1 self-end opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label="Report message"
                    onClick={() => void reportMessage(message.id)}
                  >
                    <Flag className="size-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {typingLabel ? (
          <p className="text-muted-foreground animate-pulse px-1 text-xs">{typingLabel}</p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={send} className="border-border/60 flex items-end gap-2 border-t p-2 sm:p-3">
        <input ref={fileInputRef} type="file" hidden aria-hidden tabIndex={-1} />
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Send an image"
            disabled={uploading || !keyB64}
            onClick={() => onPickFile("image/*", "image")}
          >
            <ImageIcon className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Send a video"
            disabled={uploading || !keyB64}
            onClick={() => onPickFile("video/*", "video")}
          >
            <Video className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach a file"
            disabled={uploading || !keyB64}
            onClick={() => onPickFile("*/*", "file")}
          >
            <Paperclip className="size-4" aria-hidden />
          </Button>
        </div>

        <Textarea
          value={draft}
          rows={1}
          maxLength={4000}
          placeholder={keyB64 ? "Write a message… (encrypted)" : "Loading encryption key…"}
          disabled={!keyB64}
          className="max-h-32 min-h-9 flex-1 resize-none"
          onChange={(event) => {
            setDraft(event.target.value);
            broadcastTyping(event.target.value.length > 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />

        <Button
          type="button"
          variant={recording ? "destructive" : "ghost"}
          size="icon"
          aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
          disabled={uploading || !keyB64}
          onClick={() => void toggleRecording()}
        >
          {recording ? (
            <Square className="size-4 animate-pulse" aria-hidden />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
        </Button>

        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={sending || !draft.trim()}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
        </Button>
      </form>
      {uploading ? (
        <p className="text-muted-foreground border-border/60 border-t px-3 py-1.5 text-center text-xs">
          <Loader2 className="mr-1 inline size-3 animate-spin" aria-hidden />
          Encrypting and uploading…
        </p>
      ) : null}
    </div>
  );
}
