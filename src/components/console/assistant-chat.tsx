"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Loader2,
  SearchCheck,
  Send,
  ShieldAlert,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";
import { cn } from "@/lib/utils";

/**
 * Nova — the console AI assistant chat.
 *
 * Read actions run live and are shown as activity steps. Every write comes
 * back as a PROPOSAL card that must be approved here before the assistant
 * route executes it for real. Nothing is simulated: approvals hit the
 * production database through the same service-role client as the console.
 */

interface Proposal {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
  status: "pending" | "approved" | "dismissed" | "done" | "failed";
  outcome?: string;
}

interface Step {
  tool: string;
  summary: string;
  ok: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps?: Step[];
  proposals?: Proposal[];
}

interface ChatResponse {
  ok?: boolean;
  reply?: string;
  steps?: Step[];
  proposals?: { id: string; name: string; args: Record<string, unknown>; summary: string }[];
  results?: { name: string; ok: boolean; summary: string }[];
  error?: string;
}

const SUGGESTIONS = [
  "Give me a snapshot of the whole platform",
  "Find topics about enzymes and show their zones",
  "Move the Main-zone photosynthesis topics to CAT 1",
  "Which notes are still drafts?",
  "Hide answers for the hardest CAT 2 questions",
];

const WRITE_TOOL_LABELS: Record<string, string> = {
  update_topics: "Change topics",
  create_topic: "Create topic",
  update_notes: "Change notes",
  update_questions: "Change questions",
  delete_content: "Delete content",
  update_news: "Change news article",
  create_news: "Create news article",
  update_user: "Moderate user",
};

let localId = 0;
function nextId(): string {
  localId += 1;
  return `m${localId}`;
}

export function AssistantChat() {
  const base = useConsoleBase();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nextId(),
      role: "assistant",
      text:
        "Hi — I'm Nova, your console assistant. I can look anything up on the platform right now, and when I change something you'll see exactly what it is and approve it first. Try one of the suggestions, or just tell me what you need.",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [executing, setExecuting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || thinking) return;
      setInput("");
      setThinking(true);
      setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
      try {
        const response = await fetch(consoleUrl(base, "api/assistant"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "chat", message: text, history: historyRef.current.slice(-12) }),
        });
        const payload = (await response.json().catch(() => null)) as ChatResponse | null;
        if (!response.ok || !payload) {
          toast.error(payload?.error ?? "Nova could not respond — try again in a moment.");
          return;
        }
        const proposals: Proposal[] = (payload.proposals ?? []).map((proposal) => ({
          ...proposal,
          status: "pending" as const,
        }));
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: payload.reply ?? "", steps: payload.steps ?? [], proposals },
        ]);
        historyRef.current = [
          ...historyRef.current,
          { role: "user" as const, content: text },
          { role: "assistant" as const, content: payload.reply ?? "" },
        ].slice(-12);
      } catch {
        toast.error("Network error — Nova could not be reached.");
      } finally {
        setThinking(false);
      }
    },
    [base, thinking],
  );

  const executeProposals = useCallback(
    async (messageId: string, approved: Proposal[]) => {
      if (approved.length === 0 || executing) return;
      setExecuting(true);
      try {
        const response = await fetch(consoleUrl(base, "api/assistant"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "execute",
            actions: approved.map((proposal) => ({ name: proposal.name, args: proposal.args })),
          }),
        });
        const payload = (await response.json().catch(() => null)) as ChatResponse | null;
        if (!response.ok || !payload?.results) {
          toast.error(payload?.error ?? "The approved change could not be executed.");
          return;
        }
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === messageId
              ? {
                  ...entry,
                  proposals: (entry.proposals ?? []).map((proposal) => {
                    const result = payload.results?.find((entry2) => entry2.name === proposal.name);
                    if (result && approved.some((a) => a.id === proposal.id)) {
                      return {
                        ...proposal,
                        status: result.ok ? ("done" as const) : ("failed" as const),
                        outcome: result.summary,
                      };
                    }
                    return proposal;
                  }),
                }
              : entry,
          ),
        );
        const okCount = payload.results.filter((result) => result.ok).length;
        if (okCount === payload.results.length) {
          toast.success(`Done — ${okCount} change${okCount === 1 ? "" : "s"} applied for real.`);
        } else {
          toast.warning(`${okCount}/${payload.results.length} changes applied — see the details.`);
        }
      } catch {
        toast.error("Network error — the change was not executed.");
      } finally {
        setExecuting(false);
      }
    },
    [base, executing],
  );

  const approve = (messageId: string, proposalId: string) => {
    setMessages((prev) =>
      prev.map((entry) => {
        if (entry.id !== messageId) return entry;
        const proposals = (entry.proposals ?? []).map((proposal) =>
          proposal.id === proposalId ? { ...proposal, status: "approved" as const } : proposal,
        );
        const approved = proposals.filter((proposal) => proposal.status === "approved");
        if (approved.length > 0) void executeProposals(messageId, approved);
        return { ...entry, proposals };
      }),
    );
  };

  const dismiss = (messageId: string, proposalId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              proposals: (entry.proposals ?? []).map((proposal) =>
                proposal.id === proposalId ? { ...proposal, status: "dismissed" as const } : proposal,
              ),
            }
          : entry,
      ),
    );
  };

  const reset = () => {
    if (thinking || executing) return;
    setMessages([
      {
        id: nextId(),
        role: "assistant",
        text: "Fresh start — what should we look at?",
      },
    ]);
    historyRef.current = [];
  };

  return (
    <div className="glass-card flex h-[calc(100vh-13rem)] min-h-[28rem] flex-col overflow-hidden">
      {/* ---------- Header ---------- */}
      <div className="border-border/60 flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Bot className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Nova — operations assistant</p>
            <p className="text-muted-foreground truncate text-xs">
              Reads live · changes only with your approval
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="focus-ring gap-1.5" onClick={reset} disabled={thinking || executing}>
          <Trash2 className="size-3.5" aria-hidden />
          New chat
        </Button>
      </div>

      {/* ---------- Messages ---------- */}
      <div className="scrollbar-slim flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((entry) => (
          <div key={entry.id} className={cn("flex gap-2.5", entry.role === "user" && "justify-end")}>
            {entry.role === "assistant" ? (
              <span className="bg-primary/10 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
                <Bot className="size-4" aria-hidden />
              </span>
            ) : null}
            <div className={cn("min-w-0 max-w-[85%] space-y-2", entry.role === "user" && "items-end")}>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-6",
                  entry.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "border-border/60 bg-background/70 rounded-bl-md border",
                )}
              >
                {entry.text || <span className="text-muted-foreground italic">…</span>}
              </div>

              {entry.steps && entry.steps.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {entry.steps.map((step, index) => (
                    <span
                      key={`${step.tool}-${index}`}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        step.ok
                          ? "border-border/60 bg-muted/40 text-muted-foreground"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      <SearchCheck className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{step.summary}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              {(entry.proposals ?? []).map((proposal) => (
                <div
                  key={proposal.id}
                  className={cn(
                    "space-y-2 rounded-xl border p-3",
                    proposal.status === "pending" && "border-primary/40 bg-primary/5",
                    proposal.status === "done" && "border-emerald-500/40 bg-emerald-500/5",
                    proposal.status === "failed" && "border-rose-500/40 bg-rose-500/5",
                    (proposal.status === "dismissed" || proposal.status === "approved") &&
                      "border-border/60 bg-muted/20 opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                      {proposal.name === "delete_content" ? (
                        <ShieldAlert className="text-destructive size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <ChevronRight className="text-primary size-3.5 shrink-0" aria-hidden />
                      )}
                      {WRITE_TOOL_LABELS[proposal.name] ?? proposal.name}
                    </p>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {proposal.status === "pending" && "Awaiting approval"}
                      {proposal.status === "approved" && "Executing…"}
                      {proposal.status === "dismissed" && "Dismissed"}
                      {proposal.status === "done" && "Applied"}
                      {proposal.status === "failed" && "Failed"}
                    </Badge>
                  </div>
                  <p className="text-sm">{proposal.summary}</p>
                  {proposal.outcome ? (
                    <p
                      className={cn(
                        "text-xs",
                        proposal.status === "done"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive",
                      )}
                    >
                      {proposal.outcome}
                    </p>
                  ) : null}
                  {proposal.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button size="sm" className="focus-ring" onClick={() => approve(entry.id, proposal.id)}>
                        <Check className="size-3.5" aria-hidden />
                        Approve &amp; execute
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="focus-ring"
                        onClick={() => dismiss(entry.id, proposal.id)}
                      >
                        <X className="size-3.5" aria-hidden />
                        Dismiss
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {entry.role === "user" ? (
              <span className="bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
                <User className="text-muted-foreground size-4" aria-hidden />
              </span>
            ) : null}
          </div>
        ))}

        {thinking ? (
          <div className="flex items-center gap-2.5">
            <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
              <Bot className="size-4" aria-hidden />
            </span>
            <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Nova is working — searching, checking, planning…
            </span>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* ---------- Composer ---------- */}
      <div className="border-border/60 space-y-2 border-t px-4 py-3">
        {messages.length <= 1 ? (
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                disabled={thinking}
                className="border-border/60 hover:border-primary/50 hover:bg-primary/5 shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="Tell Nova what to check or change — e.g. “move these topics from main to CAT 1”"
            className="focus-ring max-h-36 min-h-11 flex-1 resize-none"
            aria-label="Message Nova"
            disabled={thinking}
          />
          <Button
            size="icon"
            className="focus-ring size-11 shrink-0"
            onClick={() => void send(input)}
            disabled={thinking || input.trim().length === 0}
            aria-label="Send"
          >
            {thinking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          </Button>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <AlertTriangle className="size-3 shrink-0" aria-hidden />
          Nova takes real actions on your platform — read-only steps run immediately, every change waits
          for your approval here.
        </p>
      </div>
    </div>
  );
}
