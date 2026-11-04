"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Loader2, Send, SquarePen, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConversationList, type ConversationSummary } from "@/components/ai/conversation-list";
import {
  MessageBubble,
  StreamingBubble,
  type ChatMessage,
} from "@/components/ai/message-bubble";
import { NovaMark } from "@/components/ai/nova-mark";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

/**
 * Floating AI tutor — a launcher pinned to the bottom-right of every
 * authenticated page (hidden on the full /ai/tutor page) that opens a
 * compact chat panel. Same backend as the tutor page: streamed SSE
 * replies, persisted conversations with rename/delete/archive, message
 * editing + regeneration, reply modes and quick-start prompts.
 */

type TutorMode = "normal" | "exam" | "eli5" | "steps";

const MODE_LABELS: Record<TutorMode, string> = {
  normal: "Normal",
  exam: "Exam answer",
  eli5: "ELI5",
  steps: "Step-by-step",
};

const QUICK_PROMPTS = [
  "Explain the Krebs cycle step by step",
  "Give me 5 exam-style questions on glycolysis",
  "Summarise enzyme kinetics in simple terms",
  "Difference between DNA replication and transcription?",
];

const MAX_COMPOSER_HEIGHT = 96;

export function FloatingTutor() {
  const pathname = usePathname();
  const { supabase } = useUser();

  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [mode, setMode] = useState<TutorMode>("normal");
  const [ready, setReady] = useState<boolean | null>(null); // null = checking
  const [flagOff, setFlagOff] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const onTutorPage = pathname === "/ai/tutor";

  // Gateway configuration (public status endpoint).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/status")
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { configured?: boolean }
          | null;
        if (!cancelled) setReady(data?.configured === true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Feature flag (public read via RLS).
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "ai_tutor")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data && data.enabled === false) setFlagOff(true);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const refreshConversations = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at, archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations(data ?? []);
    setConversationsLoaded(true);
  }, [supabase]);

  // Load history lazily on first open.
  useEffect(() => {
    if (open && !conversationsLoaded) void refreshConversations();
  }, [open, conversationsLoaded, refreshConversations]);

  // Keep the thread pinned to the latest content.
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streamingText, pending]);

  // Auto-grow the composer.
  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  // Escape closes the panel; abort refreshes on unmount.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadConversation = useCallback(
    async (id: string) => {
      if (!supabase) return;
      setActiveId(id);
      setHistoryOpen(false);
      try {
        const { data } = await supabase
          .from("ai_messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true })
          .limit(200);
        setMessages(data ?? []);
      } catch {
        toast.error("Could not load this conversation");
      }
    },
    [supabase],
  );

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!supabase) return;
      const { error } = await supabase.from("ai_conversations").delete().eq("id", id);
      if (error) {
        toast.error(`Could not delete the conversation: ${error.message}`);
        return;
      }
      setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    },
    [supabase, activeId],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (!supabase) return;
      const { error } = await supabase.from("ai_conversations").update({ title }).eq("id", id);
      if (error) {
        toast.error(`Could not rename the conversation: ${error.message}`);
        return;
      }
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, title } : conversation,
        ),
      );
      toast.success("Conversation renamed");
    },
    [supabase],
  );

  const archiveConversation = useCallback(
    async (id: string, archived: boolean) => {
      if (!supabase) return;
      const { error } = await supabase
        .from("ai_conversations")
        .update({ archived })
        .eq("id", id);
      if (error) {
        toast.error(`Could not ${archived ? "archive" : "restore"} the conversation: ${error.message}`);
        return;
      }
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, archived } : conversation,
        ),
      );
      toast.success(archived ? "Conversation archived" : "Conversation restored");
    },
    [supabase],
  );

  /**
   * Reads the platform's SSE protocol off a response and renders the
   * growing answer live. Returns the full cleaned reply text.
   */
  const readSse = useCallback(
    async (response: Response, signal: AbortSignal): Promise<string> => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let sawDone = false;
      setStreamingText("");

      const handleData = (payload: string) => {
        if (payload === "[DONE]") {
          sawDone = true;
          return;
        }
        try {
          const parsed: unknown = JSON.parse(payload);
          if (parsed && typeof parsed === "object") {
            const record = parsed as Record<string, unknown>;
            if (typeof record.error === "string") {
              toast.error(record.error);
              return;
            }
            if (typeof record.delta === "string" && record.delta.length > 0) {
              full += record.delta;
              setStreamingText(full);
            }
          }
        } catch {
          // Non-JSON data line — ignore.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          handleData(line.slice(5).trim());
          if (sawDone) break;
        }
        if (sawDone || signal.aborted) break;
      }

      return full.replace(/\[\[(?:MEDIA|LINKS):[^\]]*\]\]/g, "").trimEnd();
    },
    [],
  );

  const sendMessage = useCallback(
    async (raw?: string) => {
      const trimmed = (raw ?? draft).trim();
      if (!trimmed || pending || !ready || flagOff) return;

      const message = mode === "normal" ? trimmed : `Explain in ${MODE_LABELS[mode]} mode: ${trimmed}`;
      setDraft("");
      setPending(true);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          role: "user",
          content: message,
          created_at: new Date().toISOString(),
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(activeId ? { conversationId: activeId } : {}),
            message,
            noteIds: [],
          }),
          signal: controller.signal,
        });

        if (response.status === 202) {
          toast.info("Gateway busy — your question was queued; you'll be notified when it's answered.");
          const data = (await response.json().catch(() => ({}))) as { conversationId?: string };
          if (data.conversationId && !activeId) setActiveId(data.conversationId);
          await refreshConversations();
          return;
        }

        if (response.status === 429) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            retryAfterMinutes?: number;
          };
          toast.error(
            `${data.error ?? "Rate limit reached"} — try again in ${data.retryAfterMinutes ?? 60} minutes.`,
          );
          setDraft(trimmed);
          return;
        }

        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? "The tutor could not be reached — please try again.");
          setDraft(trimmed);
          return;
        }

        const conversationId = response.headers.get("X-Conversation-Id");
        if (conversationId && !activeId) setActiveId(conversationId);

        const full = await readSse(response, controller.signal);
        if (full.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: full,
              created_at: new Date().toISOString(),
            },
          ]);
        }
        await refreshConversations();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[floating-tutor] send failed:", error);
          toast.error("The tutor could not be reached — please try again.");
          setDraft(trimmed);
        }
      } finally {
        abortRef.current = null;
        setStreamingText(null);
        setPending(false);
      }
    },
    [draft, pending, ready, flagOff, mode, activeId, refreshConversations, readSse],
  );

  /** Edit an earlier user message — the thread is rewritten after it. */
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!activeId || pending) return;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      setPending(true);

      // Optimistic: keep everything before the edit, apply the new content.
      const kept = messages.slice(0, index);
      setMessages([...kept, { ...messages[index], content }]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch("/api/ai/chat/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeId, messageId, content }),
          signal: controller.signal,
        });
        if (response.status === 202) {
          toast.info("Gateway busy — your edit was saved and queued; you'll be notified when it's answered.");
          await refreshConversations();
          return;
        }
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? "Could not rewrite the thread — reloading.");
          await loadConversation(activeId);
          return;
        }
        const full = await readSse(response, controller.signal);
        if (full.trim().length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: full,
              created_at: new Date().toISOString(),
            },
          ]);
        }
        await refreshConversations();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[floating-tutor] edit failed:", error);
          toast.error("The edit could not be completed — reloading the thread.");
          await loadConversation(activeId);
        }
      } finally {
        abortRef.current = null;
        setStreamingText(null);
        setPending(false);
      }
    },
    [activeId, pending, messages, refreshConversations, loadConversation, readSse],
  );

  /** Regenerate the latest assistant reply. */
  const regenerate = useCallback(async () => {
    if (!activeId || pending) return;
    setPending(true);

    // Drop the last assistant reply optimistically.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last && last.role === "assistant" ? prev.slice(0, -1) : prev;
    });

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/ai/chat/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId }),
        signal: controller.signal,
      });
      if (response.status === 202) {
        toast.info("Gateway busy — a fresh answer was queued for this question.");
        await refreshConversations();
        return;
      }
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not regenerate — reloading.");
        await loadConversation(activeId);
        return;
      }
      const full = await readSse(response, controller.signal);
      if (full.trim().length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: full,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      await refreshConversations();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("[floating-tutor] regenerate failed:", error);
        toast.error("The answer could not be regenerated — reloading the thread.");
        await loadConversation(activeId);
      }
    } finally {
      abortRef.current = null;
      setStreamingText(null);
      setPending(false);
    }
  }, [activeId, pending, refreshConversations, loadConversation, readSse]);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  // Edit / regenerate affordances, mirroring the full tutor page.
  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);
  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return null;
  }, [messages]);

  if (onTutorPage) return null;

  const composerDisabled = !ready || flagOff || pending;
  const activeTitle =
    conversations.find((conversation) => conversation.id === activeId)?.title ?? "New conversation";

  return (
    <>
      {/* Floating window */}
      {open ? (
        <div
          role="dialog"
          aria-label="AI tutor chat"
          className="glass-card fixed inset-x-3 bottom-24 z-50 flex h-[min(68dvh,560px)] flex-col overflow-hidden sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[400px]"
        >
          {/* Header */}
          <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5">
            <span className="from-primary to-primary/70 text-primary-foreground flex size-8 items-center justify-center rounded-lg bg-gradient-to-br">
              <NovaMark className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {historyOpen ? "Conversations" : activeTitle}
              </p>
              <p className="text-muted-foreground text-[11px] leading-none">Nova · BioChem AI tutor</p>
            </div>
            <Button
              variant={historyOpen ? "secondary" : "ghost"}
              size="sm"
              className="focus-ring h-8 gap-1.5 px-2 text-xs"
              aria-label={historyOpen ? "Back to chat" : "Conversation history"}
              aria-pressed={historyOpen}
              onClick={() => setHistoryOpen((prev) => !prev)}
            >
              <History className="size-3.5" aria-hidden />
              <span>History</span>
              {!historyOpen && conversations.length > 0 ? (
                <span className="bg-primary/15 text-primary rounded-full px-1.5 text-[10px] font-semibold tabular-nums">
                  {conversations.length}
                </span>
              ) : null}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="focus-ring size-8"
              aria-label="New conversation"
              onClick={startNewConversation}
            >
              <SquarePen className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="focus-ring size-8"
              aria-label="Close AI tutor"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>

          {historyOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <ConversationList
                conversations={conversations}
                activeId={activeId}
                onSelect={(id) => void loadConversation(id)}
                onNew={startNewConversation}
                onDelete={deleteConversation}
                onRename={renameConversation}
                onArchive={archiveConversation}
              />
            </div>
          ) : (
            <>
              {/* Thread */}
              <div
                ref={threadRef}
                className="scrollbar-slim min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4"
                role="log"
                aria-label="Tutor conversation"
              >
                {!ready ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    Checking the tutor…
                  </p>
                ) : flagOff ? (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    The AI tutor is temporarily disabled by the administrator.
                  </p>
                ) : ready && messages.length === 0 && streamingText === null ? (
                  <div className="space-y-3">
                    <p className="text-foreground text-sm font-medium">
                      Ask anything biochemistry ⚡
                    </p>
                    <div className="flex flex-col gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void sendMessage(prompt)}
                          disabled={pending}
                          className="focus-ring border-border/70 hover:border-primary/40 hover:bg-muted/50 rounded-xl border px-3 py-2 text-left text-xs transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <p className="text-muted-foreground pt-1 text-xs">
                      Need notes grounding and full history?{" "}
                      <Link href="/ai/tutor" className="text-primary underline underline-offset-2">
                        Open the full tutor
                      </Link>
                    </p>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        showEdit={message.id === lastUserId && !pending}
                        showRegenerate={message.id === lastAssistantId && !pending}
                        onEdit={(id, content) => void editMessage(id, content)}
                        onRegenerate={() => void regenerate()}
                        busy={pending}
                      />
                    ))}
                    {streamingText !== null ? <StreamingBubble text={streamingText} /> : null}
                  </>
                )}
              </div>

              {/* Composer */}
              <div className="border-border/60 border-t p-2.5">
                <div className="flex items-end gap-2">
                  <Select value={mode} onValueChange={(value) => setMode(value as TutorMode)}>
                    <SelectTrigger
                      className="focus-ring h-10 w-24 shrink-0 text-xs sm:w-28"
                      aria-label="Reply mode"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODE_LABELS) as TutorMode[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {MODE_LABELS[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Ask anything…"
                    className="focus-ring max-h-24 min-h-10 flex-1 resize-none py-2"
                    disabled={composerDisabled}
                    aria-label="Message the AI tutor"
                  />
                  {pending ? (
                    <Button
                      onClick={stopGenerating}
                      variant="outline"
                      className="focus-ring size-10 shrink-0 p-0"
                      aria-label="Stop generating"
                    >
                      <span className="bg-foreground block size-2.5 rounded-[2px]" aria-hidden />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void sendMessage()}
                      disabled={composerDisabled || draft.trim().length === 0}
                      className="focus-ring size-10 shrink-0 p-0"
                      aria-label="Send message"
                    >
                      <Send className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={open ? "Close AI tutor" : "Open AI tutor"}
        className={cn(
          "focus-ring fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 sm:right-5 sm:bottom-5",
          "from-primary to-primary/80 bg-gradient-to-br",
        )}
      >
        {pending ? (
          <Loader2 className="size-6 animate-spin" aria-hidden />
        ) : (
          <NovaMark className="size-6" />
        )}
      </button>
    </>
  );
}
