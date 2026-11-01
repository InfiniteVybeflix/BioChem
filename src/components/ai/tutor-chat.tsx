"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { BookOpenCheck, Loader2, PanelLeft, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SetupNotice } from "@/components/common/setup-notice";
import { EmptyState } from "@/components/common/ui-bits";
import { ConversationList, type ConversationSummary } from "@/components/ai/conversation-list";
import {
  MessageBubble,
  StreamingBubble,
  type ChatMessage,
  type TutorMedia,
} from "@/components/ai/message-bubble";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

/**
 * AI tutor chat: conversation sidebar (lg) / sheet (mobile), streamed SSE
 * replies, note grounding, and explain modes. The server streams
 * `data: {"delta":"…"}` chunks terminated by `data: [DONE]`.
 */

type TutorMode = "normal" | "exam" | "eli5" | "steps";

const MODE_LABELS: Record<TutorMode, string> = {
  normal: "Normal",
  exam: "Exam answer",
  eli5: "ELI5",
  steps: "Step-by-step",
};

const MAX_COMPOSER_HEIGHT = 132; // ≈ 5 rows at text-sm leading
const MAX_GROUNDING_NOTES = 5;

interface GroundingNote {
  id: string;
  title: string;
}

interface StatusResponse {
  configured: boolean;
}

export function TutorChat({
  initialConversations,
  preselectedNote,
}: {
  initialConversations: ConversationSummary[];
  preselectedNote?: { id: string; title: string } | null;
}) {
  const { supabase } = useUser();

  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [mode, setMode] = useState<TutorMode>("normal");

  const [status, setStatus] = useState<"checking" | "ready" | "unconfigured">("checking");
  const [flagOff, setFlagOff] = useState(false);

  // "Ground in notes" state.
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteResults, setNoteResults] = useState<GroundingNote[]>([]);
  const [noteSearching, setNoteSearching] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<GroundingNote[]>(
    preselectedNote ? [preselectedNote] : [],
  );

  const [sheetOpen, setSheetOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Gateway configuration (public status endpoint).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/status")
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as StatusResponse | null;
        if (cancelled) return;
        setStatus(data && data.configured === true ? "ready" : "unconfigured");
      })
      .catch(() => {
        if (!cancelled) setStatus("unconfigured");
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

  // Auto-grow the composer (max ~5 rows).
  const resizeComposer = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  // Keep the thread pinned to the latest content.
  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, streamingText, loadingThread]);

  const refreshConversations = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations(data ?? []);
  }, [supabase]);

  const loadConversation = useCallback(
    async (id: string) => {
      if (!supabase) return;
      setActiveId(id);
      setSheetOpen(false);
      setLoadingThread(true);
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
      } finally {
        setLoadingThread(false);
      }
    },
    [supabase],
  );

  const startNewConversation = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setSheetOpen(false);
    textareaRef.current?.focus();
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
      const { error } = await supabase
        .from("ai_conversations")
        .update({ title })
        .eq("id", id);
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

  const searchNotes = useCallback(
    async (query: string) => {
      if (!supabase || query.trim().length < 2) {
        setNoteResults([]);
        return;
      }
      setNoteSearching(true);
      try {
        const { data } = await supabase
          .from("notes")
          .select("id, title")
          .eq("status", "published")
          .ilike("title", `%${query.trim()}%`)
          .order("title", { ascending: true })
          .limit(10);
        setNoteResults(data ?? []);
      } finally {
        setNoteSearching(false);
      }
    },
    [supabase],
  );

  const toggleNote = useCallback((note: GroundingNote) => {
    setSelectedNotes((prev) => {
      const exists = prev.some((selected) => selected.id === note.id);
      if (exists) return prev.filter((selected) => selected.id !== note.id);
      if (prev.length >= MAX_GROUNDING_NOTES) {
        toast.error(`Ground in at most ${MAX_GROUNDING_NOTES} notes`);
        return prev;
      }
      return [...prev, note];
    });
  }, []);

  const restoreDraft = useCallback((message: string) => {
    setDraft(message);
    textareaRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || pending || status !== "ready" || flagOff) return;

    const message =
      mode === "normal" ? trimmed : `Explain in ${MODE_LABELS[mode]} mode: ${trimmed}`;
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

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(activeId ? { conversationId: activeId } : {}),
          message,
          noteIds: selectedNotes.map((note) => note.id),
        }),
      });

      if (response.status === 202) {
        const data = (await response.json().catch(() => ({}))) as {
          conversationId?: string;
        };
        toast.info(
          "Gateway unreachable — your question was queued; you'll be notified when it's answered.",
        );
        if (data.conversationId) setActiveId(data.conversationId);
        await refreshConversations();
        return;
      }

      if (response.status === 429) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          retryAfterMinutes?: number;
        };
        toast.error(
          `${data.error ?? "Rate limit reached"} — try again in ${
            data.retryAfterMinutes ?? 60
          } minutes.`,
        );
        restoreDraft(message);
        return;
      }

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "The tutor could not be reached — please try again.");
        restoreDraft(message);
        return;
      }

      const conversationId = response.headers.get("X-Conversation-Id");
      if (conversationId && !activeId) setActiveId(conversationId);

      // Read the SSE stream: buffer-split on "\n\n", parse "data: " lines.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let sawDone = false;
      let media: TutorMedia | null = null;
      setStreamingText("");

      const handleData = (raw: string) => {
        if (raw === "[DONE]") {
          sawDone = true;
          return;
        }
        try {
          const payload: unknown = JSON.parse(raw);
          if (payload && typeof payload === "object") {
            const record = payload as Record<string, unknown>;
            if (typeof record.error === "string") {
              toast.error(record.error);
              return;
            }
            if (record.media && typeof record.media === "object") {
              media = record.media as TutorMedia;
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
        if (sawDone) break;
      }

      if (full.trim().length > 0) {
        // Strip any residual [[MEDIA:/[[LINKS: markers and attach the
        // resolved images/links that arrived as the final SSE payload.
        const cleanText = full.replace(/\[\[(?:MEDIA|LINKS):[^\]]*\]\]/g, "").trimEnd();
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: cleanText,
            created_at: new Date().toISOString(),
            media,
          },
        ]);
      }
      await refreshConversations();
    } catch (error) {
      console.error("[tutor-chat] send failed:", error);
      toast.error("The tutor could not be reached — please try again.");
      restoreDraft(message);
    } finally {
      setStreamingText(null);
      setPending(false);
    }
  }, [
    draft,
    pending,
    status,
    flagOff,
    mode,
    activeId,
    selectedNotes,
    refreshConversations,
    restoreDraft,
  ]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const thread = () => {
    if (status === "unconfigured") {
      return <SetupNotice missing="gateway" />;
    }
    if (flagOff) {
      return (
        <Alert>
          <Sparkles className="size-4" aria-hidden />
          <AlertTitle>AI tutor is temporarily disabled</AlertTitle>
          <AlertDescription>
            The AI tutor has been switched off by the administrator. Please check back later.
          </AlertDescription>
        </Alert>
      );
    }
    if (loadingThread) {
      return (
        <div className="space-y-4" aria-label="Loading conversation">
          <div className="glass-card h-16 w-2/3 animate-pulse rounded-2xl" />
          <div className="bg-primary/20 ml-auto h-12 w-1/2 animate-pulse rounded-2xl" />
          <div className="glass-card h-24 w-3/4 animate-pulse rounded-2xl" />
        </div>
      );
    }
    if (messages.length === 0 && streamingText === null) {
      return (
        <EmptyState
          icon={<Sparkles className="size-6" aria-hidden />}
          title="Ask the BioChem tutor"
          description="Questions about pathways, enzymes, mechanisms — anything biochemistry. Ground answers in your course notes for best results."
        />
      );
    }

    return (
      <>
        {preselectedChip}
        <div className="space-y-5">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
        {streamingText !== null ? <StreamingBubble text={streamingText} /> : null}
      </>
    );
  };

  const preselectedChip =
    preselectedNote && selectedNotes.some((note) => note.id === preselectedNote.id) ? (
      <p className="text-muted-foreground glass-card px-4 py-2.5 text-sm">
        Grounded in <strong>{preselectedNote.title}</strong> — ask anything about it (manage sources
        with the Notes button).
      </p>
    ) : null;

  const sidebar = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={(id) => void loadConversation(id)}
      onNew={startNewConversation}
      onDelete={deleteConversation}
      onRename={renameConversation}
    />
  );

  const composerDisabled = status !== "ready" || flagOff || pending;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className="glass-card hidden w-64 shrink-0 flex-col p-4 lg:flex"
        aria-label="Conversations"
      >
        {sidebar}
      </aside>

      {/* Thread + composer */}
      <section className="glass-card flex min-h-[28rem] flex-1 flex-col overflow-hidden">
        <header className="border-border/60 flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Mobile conversations sheet */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="focus-ring size-11 lg:hidden"
                  aria-label="Open conversations"
                >
                  <PanelLeft className="size-4" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-4">
                <SheetHeader className="p-0 text-left">
                  <SheetTitle className="font-heading text-base">Conversations</SheetTitle>
                </SheetHeader>
                <div className="mt-4 min-h-0 flex-1">{sidebar}</div>
              </SheetContent>
            </Sheet>
            <h2 className="font-heading text-sm font-semibold">
              {conversations.find((conversation) => conversation.id === activeId)?.title ??
                "New conversation"}
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="focus-ring gap-1.5"
            onClick={startNewConversation}
          >
            <Sparkles className="size-4" aria-hidden />
            New
          </Button>
        </header>

        <div
          ref={threadRef}
          className="scrollbar-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5"
          role="log"
          aria-label="Tutor conversation"
        >
          {thread()}
        </div>

        {/* Composer */}
        <div className="border-border/60 border-t p-3 sm:p-4">
          {selectedNotes.length > 0 ? (
            <ul className="mb-2.5 flex flex-wrap gap-1.5" aria-label="Grounding notes">
              {selectedNotes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => toggleNote(note)}
                    className="focus-ring border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                    aria-label={`Remove grounding note ${note.title}`}
                  >
                    <BookOpenCheck className="size-3" aria-hidden />
                    <span className="max-w-44 truncate">{note.title}</span>
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-end gap-2">
            <Popover open={notesOpen} onOpenChange={setNotesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="focus-ring size-11 shrink-0"
                  aria-label="Ground in course notes"
                  disabled={status !== "ready" || flagOff}
                >
                  <BookOpenCheck className="size-4" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  Search published notes to ground the tutor&apos;s answers (max{" "}
                  {MAX_GROUNDING_NOTES}).
                </p>
                <Input
                  value={noteQuery}
                  onChange={(event) => {
                    setNoteQuery(event.target.value);
                    void searchNotes(event.target.value);
                  }}
                  placeholder="Search notes by title…"
                  className="focus-ring"
                  aria-label="Search notes by title"
                />
                <ul className="scrollbar-slim mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {noteSearching ? (
                    <li className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
                    </li>
                  ) : noteResults.length === 0 ? (
                    <li className="text-muted-foreground py-4 text-center text-sm">
                      {noteQuery.trim().length < 2
                        ? "Type at least 2 characters."
                        : "No published notes match."}
                    </li>
                  ) : (
                    noteResults.map((note) => {
                      const selected = selectedNotes.some((chosen) => chosen.id === note.id);

                      return (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => toggleNote(note)}
                            aria-pressed={selected}
                            className={cn(
                              "focus-ring w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                              selected
                                ? "bg-primary/15 text-primary font-medium"
                                : "hover:bg-muted/60",
                            )}
                          >
                            <span className="line-clamp-1">{note.title}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </PopoverContent>
            </Popover>

            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask anything biochemistry… (Enter to send, Shift+Enter for a new line)"
              className="focus-ring max-h-33 min-h-11 flex-1 resize-none py-2.5"
              disabled={composerDisabled}
              aria-label="Message the AI tutor"
            />

            <Select
              value={mode}
              onValueChange={(value) => setMode(value as TutorMode)}
              disabled={composerDisabled}
            >
              <SelectTrigger
                className="focus-ring h-10 w-28 shrink-0 sm:w-36"
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

            <Button
              onClick={() => void sendMessage()}
              disabled={composerDisabled || draft.trim().length === 0}
              className="focus-ring size-11 shrink-0 p-0"
              aria-label="Send message"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
