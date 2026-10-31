"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bug, Inbox, Loader2, MessageSquareReply, Send, Siren } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/ui-bits";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — the support inbox. Tickets arrive from the public /support
 * page (and Settings → Support), optionally ping the ops webhook, and
 * are answered here. Replies notify the user in-app and via push.
 */

export interface ConsoleTicket {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  email: string;
  from: string;
  page: string | null;
  createdAt: string;
  replies: { body: string; createdAt: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const CATEGORY_ICONS: Record<string, typeof Bug> = {
  bug: Bug,
  complaint: Siren,
  question: Inbox,
  feedback: Send,
};

export function SupportInbox({ initialTickets }: { initialTickets: ConsoleTicket[] }) {
  const base = useConsoleBase();
  const [tickets, setTickets] = useState<ConsoleTicket[]>(initialTickets);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => (filter === "all" ? tickets : tickets.filter((ticket) => ticket.status === filter)),
    [tickets, filter],
  );

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/support"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        toast.error(
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Action failed",
        );
        return false;
      }
      return true;
    } catch {
      toast.error("Network error — try again");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async (ticket: ConsoleTicket) => {
    if (reply.trim().length < 2) return;
    const ok = await post({ action: "reply", ticketId: ticket.id, body: reply.trim() });
    if (!ok) return;
    setTickets((prev) =>
      prev.map((row) =>
        row.id === ticket.id
          ? {
              ...row,
              status: row.status === "resolved" ? "resolved" : "in_progress",
              replies: [
                ...row.replies,
                { body: reply.trim(), createdAt: new Date().toISOString() },
              ],
            }
          : row,
      ),
    );
    setReply("");
    setReplyFor(null);
    toast.success("Reply sent — the user is notified");
  };

  const setStatus = async (ticket: ConsoleTicket, status: string) => {
    const ok = await post({ action: "status", ticketId: ticket.id, status });
    if (!ok) return;
    setTickets((prev) => prev.map((row) => (row.id === ticket.id ? { ...row, status } : row)));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Inbox className="size-4" aria-hidden /> Support inbox
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Bugs, complaints, questions and feedback from students and staff.
          </p>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <SelectTrigger className="w-40" aria-label="Filter tickets">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({tickets.length})</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Inbox zero"
          description="No tickets match this filter. New messages from /support land here instantly."
          icon={<Inbox className="size-8" aria-hidden />}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((ticket) => {
            const CategoryIcon = CATEGORY_ICONS[ticket.category] ?? Inbox;
            return (
              <li key={ticket.id} className="glass-card space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="bg-primary/10 text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <CategoryIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{ticket.subject}</p>
                      <p className="text-muted-foreground text-xs">
                        {ticket.from} ·{" "}
                        {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        {ticket.page ? ` · from ${new URL(ticket.page).pathname}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open}
                    >
                      {ticket.status.replace("_", " ")}
                    </Badge>
                    {ticket.status !== "resolved" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void setStatus(ticket, "resolved")}
                      >
                        Mark resolved
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void setStatus(ticket, "open")}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                <p className="text-muted-foreground bg-muted/30 rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {ticket.message}
                </p>

                {ticket.replies.length > 0 ? (
                  <ul className="space-y-2">
                    {ticket.replies.map((replyItem) => (
                      <li
                        key={replyItem.createdAt}
                        className="bg-primary/5 border-primary/20 flex items-start gap-2 rounded-xl border p-3"
                      >
                        <MessageSquareReply
                          className="text-primary mt-0.5 size-4 shrink-0"
                          aria-hidden
                        />
                        <div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {replyItem.body}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            You ·{" "}
                            {formatDistanceToNow(new Date(replyItem.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {replyFor === ticket.id ? (
                  <div className="space-y-2">
                    <Label htmlFor={`reply-${ticket.id}`}>Your reply (sent in-app + push)</Label>
                    <Textarea
                      id={`reply-${ticket.id}`}
                      rows={3}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Hi — thanks for flagging this…"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busy} onClick={() => void sendReply(ticket)}>
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Send className="size-4" aria-hidden />
                        )}
                        Send reply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReplyFor(null)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setReply("");
                      setReplyFor(ticket.id);
                    }}
                  >
                    <MessageSquareReply className="size-4" aria-hidden />
                    Reply
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
