"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Briefcase, Loader2, MessageSquareReply, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — job board: live postings (close/reopen) and the student
 * enquiry inbox with one-tap replies (delivered in-app + push).
 */

export interface ConsoleJob {
  id: string;
  title: string;
  org: string;
  location: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface ConsoleEnquiry {
  id: string;
  studentName: string;
  jobTitle: string;
  message: string;
  status: string;
  createdAt: string;
}

const JOB_STATUS_STYLES: Record<string, string> = {
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  closed: "border-border bg-muted text-foreground",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
};

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export function JobsConsole({
  initialJobs,
  initialEnquiries,
}: {
  initialJobs: ConsoleJob[];
  initialEnquiries: ConsoleEnquiry[];
}) {
  const base = useConsoleBase();
  const [jobs, setJobs] = useState<ConsoleJob[]>(initialJobs);
  const [enquiries, setEnquiries] = useState<ConsoleEnquiry[]>(initialEnquiries);
  const [busy, setBusy] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const post = async (body: Record<string, unknown>, key: string): Promise<boolean> => {
    setBusy(key);
    try {
      const response = await fetch(consoleUrl(base, "api/jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Action failed"));
        return false;
      }
      return true;
    } catch {
      toast.error("Network error — try again");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggleJob = async (job: ConsoleJob) => {
    const action = job.status === "closed" ? "reopen" : "close";
    const ok = await post({ action, id: job.id }, job.id);
    if (ok) {
      setJobs((prev) =>
        prev.map((row) =>
          row.id === job.id ? { ...row, status: action === "close" ? "closed" : "approved" } : row,
        ),
      );
      toast.success(action === "close" ? "Posting closed" : "Posting reopened");
    }
  };

  const sendEnquiryReply = async (enquiry: ConsoleEnquiry) => {
    if (reply.trim().length < 2) return;
    const ok = await post(
      { action: "enquiry_reply", id: enquiry.id, body: reply.trim() },
      enquiry.id,
    );
    if (!ok) return;
    setEnquiries((prev) =>
      prev.map((row) => (row.id === enquiry.id ? { ...row, status: "replied" } : row)),
    );
    setReply("");
    setReplyFor(null);
    toast.success("Reply sent — the student is notified");
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageSquareReply className="size-4" aria-hidden /> Student enquiries
        </h2>
        {enquiries.length === 0 ? (
          <EmptyState
            title="No enquiries yet"
            description="When a student taps Enquire on a posting, their prefilled message lands here."
          />
        ) : (
          <ul className="space-y-3">
            {enquiries.map((enquiry) => (
              <li key={enquiry.id} className="glass-card space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{enquiry.jobTitle}</p>
                    <p className="text-muted-foreground text-xs">
                      {enquiry.studentName} ·{" "}
                      {formatDistanceToNow(new Date(enquiry.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      enquiry.status === "replied"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    }
                  >
                    {enquiry.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground bg-muted/30 rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap">
                  {enquiry.message}
                </p>
                {replyFor === enquiry.id ? (
                  <div className="space-y-2">
                    <Label htmlFor={`enquiry-reply-${enquiry.id}`}>Your reply</Label>
                    <Textarea
                      id={`enquiry-reply-${enquiry.id}`}
                      rows={3}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Hi — thanks for your interest. Next steps: …"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busy === enquiry.id}
                        onClick={() => void sendEnquiryReply(enquiry)}
                      >
                        {busy === enquiry.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Send className="size-4" aria-hidden />
                        )}
                        Send reply
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>
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
                      setReplyFor(enquiry.id);
                    }}
                  >
                    <MessageSquareReply className="size-4" aria-hidden />
                    Reply
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Briefcase className="size-4" aria-hidden /> Postings
        </h2>
        {jobs.length === 0 ? (
          <EmptyState
            title="No postings yet"
            description="Staff submit postings from the job board; they appear in moderation for approval."
          />
        ) : (
          <ul className="glass-card divide-border/60 divide-y p-0">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {job.org} · {job.location} · {job.type}
                  </p>
                </div>
                <Badge variant="outline" className={JOB_STATUS_STYLES[job.status] ?? ""}>
                  {job.status}
                </Badge>
                {job.status !== "pending" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === job.id}
                    onClick={() => void toggleJob(job)}
                  >
                    {busy === job.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : job.status === "closed" ? (
                      "Reopen"
                    ) : (
                      "Close"
                    )}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
