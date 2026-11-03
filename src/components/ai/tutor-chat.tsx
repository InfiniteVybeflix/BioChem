"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpenCheck,
  Download,
  ExternalLink,
  Lightbulb,
  Loader2,
  Navigation,
  PanelLeft,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
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
import type { NovaAction } from "@/lib/ai/nova/facts";

/**
 * Nova — the platform's AI study partner.
 *
 * Conversation sidebar (lg) / sheet (mobile), streamed SSE replies, note
 * grounding, explain modes, real page actions (navigate / open tabs),
 * message edit + regenerate, stop generation, export, rename / archive /
 * search history. The server streams `data: {"delta":"…"}` chunks plus
 * optional `{"actions":[…]}` / `{"media":{…}}` payloads terminated by
 * `data: [DONE]`.
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

const STARTER_PROMPTS: { label: string; prompt: string }[] = [
  { label: "Snapshot of the platform", prompt: "Give me a snapshot of the whole platform." },
  { label: "All topics", prompt: "List all the topics available on the platform." },
  { label: "My progress", prompt: "How am I doing? XP, streak and flashcards due." },
  { label: "Mocks & past papers", prompt: "What mock exams and past papers are available?" },
  { label: "Open the mock zone", prompt: "Open the mock exams page." },
];

const TIPS: { title: string; detail: string }[] = [
  {
    title: "I read real platform data",
    detail:
      "Ask about topics, notes, your progress, planner, mock exams, flashcards, the leaderboard or jobs — I query the live database and quote only what exists. If something isn't there, I say so.",
  },
  {
    title: "I can move you around",
    detail:
      "Say \"open the mock zone\" and this page navigates for you; \"open the job board in a new tab\" opens a real browser tab. Chips under my replies are the same actions, re-clickable any time.",
  },
  {
    title: "Ground me in your notes",
    detail:
      "Click the book icon in the composer to pick up to 5 published notes. I'll cite them as I answer — best accuracy for course-specific questions.",
  },
  {
    title: "Answer formats",
    detail:
      "Use the selector next to the composer: Exam answer (model answer structure), ELI5 (plain language), or Step-by-step (full working).",
  },
  {
    title: "Your history is yours",
    detail:
      "Rename, archive or delete any conversation; search it; edit any of your messages to resend with the full rewrite; regenerate any of my answers; export the thread as Markdown.",
  },
];

interface GroundingNote {
  id: string;
  title: string;
}

interface StatusResponse {
  configured: boolean;
}

/** Reads one Nova SSE response, dispatching deltas and payloads. */
async function readNovaStream(
  response: Response,
  handlers: {
    onDelta: (full: string) => void;
    onMedia: (media: TutorMedia) => void;
    onActions: (actions: NovaAction[]) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal,
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let sawDone = false;

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
          handlers.onError(record.error);
          return;
        }
        if (record.media && typeof record.media === "object") {
          handlers.onMedia(record.media as TutorMedia);
          return;
        }
        if (Array.isArray(record.actions)) {
          handlers.onActions(record.actions as NovaAction[]);
          return;
        }
        if (typeof record.delta === "string" && record.delta.length > 0) {
          full += record.delta;
          handlers.onDelta(full);
        }
      }
    } catch {
      // Non-JSON data line — ignore.
    }
  };

  while (true) {
    if (signal?.aborted) {
      void reader.cancel().catch(() => undefined);
      break;
    }
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

  return full;
}

export function TutorChat({
  initialConversations,
  preselectedNote,
}: {
  initialConversations: ConversationSummary[];
  preselectedNote?: { id: string; title: string } | null;
}) {
  const { supabase } = useUser();
  const router = useRouter();

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
  const [tipsOpen, setTipsOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      .select("id, title, updated_at, archived")
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

  const renameConversation = useCallback(async (id: string, title: string) => {
    try {
      const response = await fetch("/api/ai/chat/rename", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, title }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not rename the conversation");
        return;
      }
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === id ? { ...conversation, title } : conversation,
        ),
      );
      toast.success("Conversation renamed");
    } catch {
      toast.error("Could not rename the conversation");
    }
  }, []);

  const archiveConversation = useCallback(
    async (id: string, archived: boolean) => {
      if (!supabase) return;
      const { error } = await supabase
        .from("ai_conversations")
        .update({ archived })
        .eq("id", id);
      if (error) {
        toast.error(`Could not ${archived ? "archive" : "unarchive"} the conversation: ${error.message}`);
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

  /** Executes validated actions for real: navigation and new tabs. */
  const executeActions = useCallback(
    (actions: NovaAction[]) => {
      for (const action of actions) {
        if (action.kind === "open_tab") {
          const opened = window.open(action.path, "_blank", "noopener,noreferrer");
          if (opened) {
            toast.success(`Opened ${action.title} in a new tab`);
          } else {
            toast.warning(
              `Pop-up blocked — use the "${action.title}" chip to open it in a new tab.`,
            );
          }
        } else {
          router.push(action.path);
          toast.success(`Opened ${action.title}`);
        }
      }
    },
    [router],
  );

  const appendAssistantMessage = useCallback((full: string, media: TutorMedia | null) => {
    if (full.trim().length === 0) return;
    const cleanText = full.replace(/\[\[(?:MEDIA|LINKS|ACTION):[^\]]*\]\]/g, "").trimEnd();
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
  }, []);

  const streamInto = useCallback(
    async (response: Response, signal?: AbortSignal) => {
      setStreamingText("");
      let media: TutorMedia | null = null;
      const full = await readNovaStream(
        response,
        {
          onDelta: (text) => setStreamingText(text),
          onMedia: (resolved) => {
            media = resolved;
          },
          onActions: (actions) => executeActions(actions),
          onError: (message) => toast.error(message),
        },
        signal,
      );
      appendAssistantMessage(full, media);
    },
    [appendAssistantMessage, executeActions],
  );

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(activeId ? { conversationId: activeId } : {}),
          message,
          noteIds: selectedNotes.map((note) => note.id),
        }),
        signal: controller.signal,
      });

      if (response.status === 202) {
        const data = (await response.json().catch(() => ({}))) as {
          conversationId?: string;
        };
        toast.info(
          "The gateway is unreachable — your question was queued; you'll be notified when it's answered.",
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
        toast.error(data.error ?? "Nova could not be reached — please try again.");
        restoreDraft(message);
        return;
      }

      const conversationId = response.headers.get("X-Conversation-Id");
      if (conversationId && !activeId) setActiveId(conversationId);

      await streamInto(response, controller.signal);
      await refreshConversations();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        toast.info("Stopped — Nova keeps the partial answer in the thread.");
      } else {
        console.error("[nova-chat] send failed:", error);
        toast.error("Nova could not be reached — please try again.");
        restoreDraft(message);
      }
    } finally {
      abortRef.current = null;
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
    streamInto,
  ]);

  /** Edit a previously sent message: the server trims + rewrites the thread. */
  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!activeId || pending) return;
      const index = messages.findIndex((message) => message.id === messageId);
      if (index < 0) return;
      setPending(true);

      // Optimistic: replace the edited message and drop everything after it.
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
          toast.info(
            "The gateway is unreachable — your edit was saved and queued; you'll be notified when it's answered.",
          );
          await refreshConversations();
          return;
        }
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          toast.error(data.error ?? "Could not rewrite the thread — reloading.");
          await loadConversation(activeId);
          return;
        }
        await streamInto(response, controller.signal);
        await refreshConversations();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[nova-chat] edit failed:", error);
          toast.error("The edit could not be completed — reloading the thread.");
          await loadConversation(activeId);
        }
      } finally {
        abortRef.current = null;
        setStreamingText(null);
        setPending(false);
      }
    },
    [activeId, pending, messages, streamInto, refreshConversations, loadConversation],
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
        toast.info(
          "The gateway is unreachable — a fresh answer was queued for this question.",
        );
        await refreshConversations();
        return;
      }
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Could not regenerate — reloading.");
        await loadConversation(activeId);
        return;
      }
      await streamInto(response, controller.signal);
      await refreshConversations();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("[nova-chat] regenerate failed:", error);
        toast.error("The answer could not be regenerated — reloading the thread.");
        await loadConversation(activeId);
      }
    } finally {
      abortRef.current = null;
      setStreamingText(null);
      setPending(false);
    }
  }, [activeId, pending, streamInto, refreshConversations, loadConversation]);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Export the active thread as a real Markdown download. */
  const exportConversation = useCallback(() => {
    if (messages.length === 0) {
      toast.error("Nothing to export yet");
      return;
    }
    const title = conversations.find((conversation) => conversation.id === activeId)?.title;
    const header = `# ${title ?? "Nova conversation"}\n\n_Exported ${new Date().toLocaleString("en-GB")}_\n\n---\n\n`;
    const body = messages
      .map(
        (message) =>
          `**${message.role === "user" ? "You" : "Nova"}** · ${new Date(
            message.created_at,
          ).toLocaleString("en-GB")}\n\n${message.content.replace(/<!--BC[A-Z]*:.*?-->/gs, "").trim()}`,
      )
      .join("\n\n---\n\n");
    const blob = new Blob([header + body + "\n"], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const slug =
      (title ?? "conversation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "conversation";
    anchor.href = url;
    anchor.download = `nova-${slug}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation exported as Markdown");
  }, [messages, conversations, activeId]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].id;
    }
    return null;
  }, [messages]);

  const thread = () => {
    if (status === "unconfigured") {
      return <SetupNotice missing="gateway" />;
    }
    if (flagOff) {
      return (
        <Alert>
          <Sparkles className="size-4" aria-hidden />
          <AlertTitle>Nova is temporarily disabled</AlertTitle>
          <AlertDescription>
            Nova has been switched off by the administrator. Please check back later.
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
        <div className="space-y-5">
          <EmptyState
            icon={<Sparkles className="size-6" aria-hidden />}
            title="Ask Nova anything"
            description="Biochemistry questions, your platform data, or “open the mock zone” — Nova reads the live database, grounds answers in your notes and can move you around the platform."
          />
          <div className="flex flex-wrap justify-center gap-2" aria-label="Starter prompts">
            {STARTER_PROMPTS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                onClick={() => {
                  setDraft(starter.prompt);
                  textareaRef.current?.focus();
                }}
                className="focus-ring border-border/70 hover:border-primary/50 hover:bg-primary/5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <>
        {preselectedChip}
        <div className="space-y-5">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              busy={pending}
              showEdit={message.id === lastUserId && !pending}
              showRegenerate={message.id === lastAssistantId && !pending}
              onEdit={(id, content) => void editMessage(id, content)}
              onRegenerate={() => void regenerate()}
            />
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
      onArchive={archiveConversation}
    />
  );

  const composerDisabled = status !== "ready" || flagOff || pending;
  const activeTitle = conversations.find((conversation) => conversation.id === activeId)?.title;

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
          <div className="flex min-w-0 items-center gap-2">
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
            <div className="min-w-0">
              <h2 className="font-heading truncate text-sm font-semibold">
                {activeTitle ?? "New conversation"}
              </h2>
              {activeTitle ? (
                <p className="text-muted-foreground truncate text-xs">
                  updated{" "}
                  {(() => {
                    const conversation = conversations.find(
                      (entry) => entry.id === activeId,
                    );
                    try {
                      return conversation
                        ? formatDistanceToNow(new Date(conversation.updated_at), {
                            addSuffix: true,
                          })
                        : "";
                    } catch {
                      return "";
                    }
                  })()}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Tips */}
            <Popover open={tipsOpen} onOpenChange={setTipsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="focus-ring text-muted-foreground hover:text-foreground size-8"
                  aria-label="Tips for using Nova"
                >
                  <Lightbulb className="size-4" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-0">
                <div className="text-primary flex items-center gap-2 border-b px-4 py-3">
                  <Lightbulb className="size-4" aria-hidden />
                  <p className="text-sm font-semibold">How to get the best out of Nova</p>
                </div>
                <ul className="scrollbar-slim max-h-80 space-y-3 overflow-y-auto p-4">
                  {TIPS.map((tip) => (
                    <li key={tip.title} className="space-y-0.5">
                      <p className="text-sm font-medium">{tip.title}</p>
                      <p className="text-muted-foreground text-xs leading-relaxed">{tip.detail}</p>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              className="focus-ring text-muted-foreground hover:text-foreground size-8"
              onClick={exportConversation}
              disabled={messages.length === 0}
              aria-label="Export conversation as Markdown"
              title="Export as Markdown"
            >
              <Download className="size-4" aria-hidden />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="focus-ring gap-1.5"
              onClick={startNewConversation}
            >
              <Sparkles className="size-4" aria-hidden />
              New
            </Button>
          </div>
        </header>

        <div
          ref={threadRef}
          className="scrollbar-slim min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5"
          role="log"
          aria-label="Nova conversation"
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
                  Search published notes to ground Nova&apos;s answers (max{" "}
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
              placeholder="Ask Nova anything… (Enter to send, Shift+Enter for a new line)"
              className="focus-ring max-h-33 min-h-11 flex-1 resize-none py-2.5"
              disabled={composerDisabled}
              aria-label="Message Nova"
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

            {pending ? (
              <Button
                onClick={stopGenerating}
                variant="outline"
                className="focus-ring size-11 shrink-0 p-0"
                aria-label="Stop generating"
                title="Stop generating"
              >
                <Square className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                onClick={() => void sendMessage()}
                disabled={composerDisabled || draft.trim().length === 0}
                className="focus-ring size-11 shrink-0 p-0"
                aria-label="Send message"
              >
                <Send className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[11px]">
            <Navigation className="size-3" aria-hidden />
            Try “open the flashcards” — Nova can navigate the platform for you.
            <ExternalLink className="size-3" aria-hidden />
            …or “open the job board in a new tab”.
          </p>
        </div>
      </section>
    </div>
  );
}
