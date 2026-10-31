"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bug, ChevronDown, LifeBuoy, Loader2, MessageSquareReply, Send, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Support center — send a message to the platform team and follow the
 * conversation in-app. Used both on the public /support page and under
 * Settings → Support.
 */

interface TicketRow {
  id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
}

interface ReplyRow {
  ticket_id: string;
  body: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "bug", label: "Bug report", icon: Bug, hint: "Something is broken or behaving oddly" },
  {
    value: "complaint",
    label: "Complaint",
    icon: Siren,
    hint: "Content, conduct or anything else",
  },
  { value: "question", label: "Question", icon: LifeBuoy, hint: "How does … work?" },
  { value: "feedback", label: "Feedback", icon: Send, hint: "Ideas to make BioChem better" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  in_progress: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SupportCenter({
  signedIn = true,
  contactNote,
}: {
  signedIn?: boolean;
  contactNote?: string;
}) {
  const [category, setCategory] = useState<string>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(signedIn);

  const loadTickets = useCallback(async () => {
    if (!signedIn) return;
    try {
      const response = await fetch("/api/support");
      if (!response.ok) return;
      const data: { tickets?: TicketRow[]; replies?: ReplyRow[] } = await response.json();
      setTickets(data.tickets ?? []);
      setReplies(data.replies ?? []);
    } finally {
      setLoadingTickets(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          email: signedIn ? "" : email,
          company: "", // honeypot
        }),
      });
      const data: { error?: string; message?: string } = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "Could not send your message");
        return;
      }
      toast.success(data.message ?? "Message received");
      setSubject("");
      setMessage("");
      setEmail("");
      await loadTickets();
    } catch {
      toast.error("Network problem — please try again");
    } finally {
      setPending(false);
    }
  };

  const activeCategory = CATEGORIES.find((entry) => entry.value === category);

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="glass-card space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <LifeBuoy className="text-primary size-4" aria-hidden />
            Contact the platform team
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {contactNote ??
              "Bugs, complaints, questions and ideas all land with the team — replies arrive right here in the app."}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-category">What is this about?</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="support-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  <span className="flex items-center gap-2">
                    <entry.icon className="size-4" aria-hidden />
                    {entry.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeCategory ? (
            <p className="text-muted-foreground text-xs">{activeCategory.hint}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-subject">Subject</Label>
          <Input
            id="support-subject"
            required
            minLength={4}
            maxLength={120}
            placeholder="e.g. Mock exam timer keeps resetting"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="support-message">Message</Label>
          <Textarea
            id="support-message"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            placeholder="Describe what happened, what you expected, and where you were in the app…"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>

        {!signedIn ? (
          <div className="space-y-2">
            <Label htmlFor="support-email">Your email (so the team can reach you)</Label>
            <Input
              id="support-email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        ) : null}

        {/* Honeypot — invisible to humans, irresistible to bots. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="pointer-events-none absolute -left-[9999px] size-0 opacity-0"
          value=""
          readOnly
        />

        <Button type="submit" className="gap-2" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {pending ? "Sending…" : "Send message"}
        </Button>
      </form>

      {signedIn ? (
        <section className="glass-card p-4 sm:p-6">
          <h2 className="font-semibold">Your conversations</h2>
          {loadingTickets ? (
            <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : tickets.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              No messages yet — when you send one, you can follow the conversation here.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {tickets.map((ticket) => {
                const ticketReplies = replies.filter((reply) => reply.ticket_id === ticket.id);
                const isOpen = openTicket === ticket.id;
                return (
                  <li key={ticket.id} className="border-border/60 rounded-xl border">
                    <button
                      type="button"
                      onClick={() => setOpenTicket(isOpen ? null : ticket.id)}
                      className="flex w-full items-center gap-3 p-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
                          STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open
                        }`}
                      >
                        {ticket.status.replace("_", " ")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatDate(ticket.created_at)} ·{" "}
                          {CATEGORIES.find((entry) => entry.value === ticket.category)?.label ??
                            ticket.category}
                        </span>
                      </span>
                      <ChevronDown
                        className={`text-muted-foreground size-4 shrink-0 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                    {isOpen ? (
                      <div className="border-border/60 border-t p-3">
                        {ticketReplies.length === 0 ? (
                          <p className="text-muted-foreground text-sm">
                            The team is on it — you'll see their reply here.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {ticketReplies.map((reply) => (
                              <li
                                key={`${reply.ticket_id}-${reply.created_at}`}
                                className="bg-muted/40 flex items-start gap-2 rounded-lg p-3"
                              >
                                <MessageSquareReply
                                  className="text-primary mt-0.5 size-4 shrink-0"
                                  aria-hidden
                                />
                                <div className="min-w-0">
                                  <p className="text-sm leading-relaxed">{reply.body}</p>
                                  <p className="text-muted-foreground mt-1 text-xs">
                                    Platform team · {formatDate(reply.created_at)}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
