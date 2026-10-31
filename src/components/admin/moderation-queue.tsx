"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { z } from "zod";
import {
  BadgeCheck,
  Briefcase,
  ChevronDown,
  FileText,
  Flag,
  Inbox,
  Loader2,
  ShieldCheck,
  Trash2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { Markdown } from "@/components/markdown/markdown";
import type { SubmissionType } from "@/types/domain";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

export interface ModerationSubmission {
  id: string;
  type: SubmissionType;
  title: string;
  contentMd: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  authorName: string;
  topicTitle: string | null;
}

export interface ModerationJob {
  id: string;
  title: string;
  org: string;
  location: string;
  createdAt: string;
  postedByName: string;
}

export interface ModerationReport {
  id: string;
  reason: string;
  createdAt: string;
  reporterName: string;
  messageBody: string | null;
  messageDeleted: boolean;
  messageAuthorName: string;
  messageCreatedAt: string;
}

/** Question payload shape (mirrors the submit-question form). */
const questionPayloadSchema = z.object({
  zone: z.string(),
  difficulty: z.string(),
  type: z.string(),
  stem_md: z.string(),
  options: z.array(z.object({ key: z.string(), text: z.string() })).default([]),
  answer_key: z.string(),
  explanation_md: z.string().default(""),
  marks: z.number().default(1),
  tags: z.array(z.string()).default([]),
});

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

/**
 * The three moderation queues: student submissions, job postings and chat
 * reports. Every action POSTs to /api/admin/moderation and removes the row
 * optimistically once the API confirms.
 */
export function ModerationQueue({
  initialSubmissions,
  initialJobs,
  initialReports,
}: {
  initialSubmissions: ModerationSubmission[];
  initialJobs: ModerationJob[];
  initialReports: ModerationReport[];
}) {
  const base = useConsoleBase();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [jobs, setJobs] = useState(initialJobs);
  const [reports, setReports] = useState(initialReports);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ModerationSubmission | ModerationJob | null>(null);
  const [deletingReport, setDeletingReport] = useState<ModerationReport | null>(null);
  const [notes, setNotes] = useState("");

  const post = async (body: Record<string, unknown>, key: string): Promise<boolean> => {
    setBusyKey(key);
    try {
      const response = await fetch(consoleUrl(base, "api/moderation"), {
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
      setBusyKey(null);
    }
  };

  const decideSubmission = async (
    submission: ModerationSubmission,
    action: "approve" | "reject",
    reviewNotes?: string,
  ) => {
    const ok = await post(
      { submissionId: submission.id, action, reviewNotes },
      `sub-${submission.id}`,
    );
    if (!ok) return;
    setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
    toast.success(
      action === "approve"
        ? "Submission published — the author earned 25 XP"
        : "Submission rejected — the author has been notified",
    );
  };

  const decideJob = async (job: ModerationJob, action: "approve" | "reject", reason?: string) => {
    const ok = await post({ jobId: job.id, action, reviewNotes: reason }, `job-${job.id}`);
    if (!ok) return;
    setJobs((prev) => prev.filter((item) => item.id !== job.id));
    toast.success(
      action === "approve"
        ? "Job approved — it's live on the board"
        : "Job rejected — poster notified",
    );
  };

  const resolveReport = async (
    report: ModerationReport,
    action: "resolve" | "dismiss" | "delete_message",
  ) => {
    const ok = await post({ reportId: report.id, action }, `report-${report.id}`);
    if (!ok) return;
    setReports((prev) => prev.filter((item) => item.id !== report.id));
    toast.success(
      action === "delete_message"
        ? "Message deleted and report resolved"
        : action === "resolve"
          ? "Report resolved"
          : "Report dismissed",
    );
  };

  const typeBadge = (type: SubmissionType) => {
    const classes: Record<SubmissionType, string> = {
      note: "border-primary/40 bg-primary/10 text-primary",
      question: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      past_paper: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      flashcard_set: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    };
    return (
      <Badge variant="outline" className={classes[type]}>
        {type.replace("_", " ")}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="submissions">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="submissions" className="flex-1 gap-1.5 sm:flex-none">
            <Inbox className="size-4" aria-hidden />
            Submissions
            {submissions.length > 0 ? (
              <Badge variant="secondary">{submissions.length}</Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex-1 gap-1.5 sm:flex-none">
            <Briefcase className="size-4" aria-hidden />
            Jobs
            {jobs.length > 0 ? <Badge variant="secondary">{jobs.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex-1 gap-1.5 sm:flex-none">
            <Flag className="size-4" aria-hidden />
            Reports
            {reports.length > 0 ? <Badge variant="secondary">{reports.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        {/* ---------- Submissions ---------- */}
        <TabsContent value="submissions" className="mt-4 space-y-4">
          {submissions.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" aria-hidden />}
              title="Nothing waiting for review"
              description="Student notes and questions submitted from the Contribute page land here."
            />
          ) : (
            submissions.map((submission) => (
              <SubmissionCard
                key={submission.id}
                submission={submission}
                busy={busyKey === `sub-${submission.id}`}
                onApprove={() => void decideSubmission(submission, "approve")}
                onReject={() => {
                  setNotes("");
                  setRejecting(submission);
                }}
                typeBadge={typeBadge}
              />
            ))
          )}
        </TabsContent>

        {/* ---------- Jobs ---------- */}
        <TabsContent value="jobs" className="mt-4 space-y-4">
          {jobs.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="size-6" aria-hidden />}
              title="No postings pending"
              description="Staff job postings awaiting approval appear here."
            />
          ) : (
            jobs.map((job) => (
              <article key={job.id} className="glass-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold">{job.title}</h3>
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {job.org} · {job.location}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  >
                    Pending
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  Posted by {job.postedByName} ·{" "}
                  {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyKey === `job-${job.id}`}
                    onClick={() => void decideJob(job, "approve")}
                    className="focus-ring"
                  >
                    {busyKey === `job-${job.id}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <ThumbsUp className="size-4" aria-hidden />
                    )}
                    Approve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyKey === `job-${job.id}`}
                    onClick={() => {
                      setNotes("");
                      setRejecting(job);
                    }}
                    className="focus-ring"
                  >
                    <ThumbsDown className="size-4" aria-hidden />
                    Reject
                  </Button>
                </div>
              </article>
            ))
          )}
        </TabsContent>

        {/* ---------- Reports ---------- */}
        <TabsContent value="reports" className="mt-4 space-y-4">
          {reports.length === 0 ? (
            <EmptyState
              icon={<Flag className="size-6" aria-hidden />}
              title="No open reports"
              description="Flagged chat messages appear here for review."
            />
          ) : (
            reports.map((report) => (
              <article key={report.id} className="glass-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Flag className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
                      Reported by {report.reporterName}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })} ·
                      Reason: {report.reason}
                    </p>
                  </div>
                  {report.messageDeleted ? (
                    <Badge
                      variant="outline"
                      className="border-destructive/40 bg-destructive/10 text-destructive"
                    >
                      Message deleted
                    </Badge>
                  ) : null}
                </div>
                <blockquote className="border-border bg-muted/40 mt-3 rounded-xl border px-4 py-3 text-sm">
                  {report.messageBody ? (
                    <p className="line-clamp-4 italic">“{report.messageBody}”</p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      Message content is encrypted — moderation removes it from the conversation
                      without reading it.
                    </p>
                  )}
                  <footer className="text-muted-foreground mt-1.5 text-xs">
                    — {report.messageAuthorName},{" "}
                    {formatDistanceToNow(new Date(report.messageCreatedAt), { addSuffix: true })}
                  </footer>
                </blockquote>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyKey === `report-${report.id}`}
                    onClick={() => void resolveReport(report, "resolve")}
                    className="focus-ring"
                  >
                    {busyKey === `report-${report.id}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <BadgeCheck className="size-4" aria-hidden />
                    )}
                    Resolve
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyKey === `report-${report.id}`}
                    onClick={() => void resolveReport(report, "dismiss")}
                    className="focus-ring"
                  >
                    Dismiss
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyKey === `report-${report.id}`}
                    onClick={() => setDeletingReport(report)}
                    className="focus-ring"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Delete message
                  </Button>
                </div>
              </article>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Reject dialog (submissions + jobs share it) */}
      <Dialog open={rejecting !== null} onOpenChange={(open) => (open ? null : setRejecting(null))}>
        <DialogContent>
          {rejecting ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Reject {"contentMd" in rejecting ? "submission" : "job posting"}
                </DialogTitle>
                <DialogDescription>
                  {rejecting.title} — the author will be notified with your feedback.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="reject-notes">
                  Feedback (optional for jobs, recommended for students)
                </Label>
                <Textarea
                  id="reject-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What should they change?"
                  className="min-h-24"
                  maxLength={1000}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRejecting(null)}
                  disabled={busyKey !== null}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busyKey !== null}
                  className="focus-ring"
                  onClick={() => {
                    const target = rejecting;
                    setRejecting(null);
                    if ("contentMd" in target) {
                      void decideSubmission(target, "reject", notes.trim() || undefined);
                    } else {
                      void decideJob(target, "reject", notes.trim() || undefined);
                    }
                  }}
                >
                  {busyKey ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Reject
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete-message confirm dialog */}
      <Dialog
        open={deletingReport !== null}
        onOpenChange={(open) => (open ? null : setDeletingReport(null))}
      >
        <DialogContent>
          {deletingReport ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete the reported message?</DialogTitle>
                <DialogDescription>
                  The message is hidden from the chat (marked deleted with your name) and the report
                  is marked resolved. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeletingReport(null)}
                  disabled={busyKey !== null}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busyKey !== null}
                  className="focus-ring"
                  onClick={() => {
                    const target = deletingReport;
                    setDeletingReport(null);
                    void resolveReport(target, "delete_message");
                  }}
                >
                  {busyKey ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-4" aria-hidden />
                  )}
                  Delete message
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One pending submission with an expandable content preview. */
function SubmissionCard({
  submission,
  busy,
  onApprove,
  onReject,
  typeBadge,
}: {
  submission: ModerationSubmission;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  typeBadge: (type: SubmissionType) => ReactNode;
}) {
  const question = useMemo(
    () =>
      submission.type === "question" ? questionPayloadSchema.safeParse(submission.payload) : null,
    [submission],
  );

  return (
    <article className="glass-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading leading-snug font-semibold">{submission.title}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {submission.type === "note" ? (
              <FileText className="mr-1 inline size-3" aria-hidden />
            ) : null}
            Submitted by {submission.authorName}
            {submission.topicTitle ? ` · ${submission.topicTitle}` : ""} ·{" "}
            {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
          </p>
        </div>
        {typeBadge(submission.type)}
      </div>

      <Collapsible className="mt-3">
        <CollapsibleTrigger className="focus-ring text-primary flex min-h-9 items-center gap-1.5 rounded-md text-sm font-medium hover:underline">
          Preview content
          <ChevronDown
            className="size-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="scrollbar-slim border-border bg-muted/30 mt-3 max-h-96 overflow-y-auto rounded-xl border p-4">
            {submission.type === "note" && submission.contentMd ? (
              <Markdown>{submission.contentMd}</Markdown>
            ) : question && question.success ? (
              <div className="space-y-3 text-sm">
                <p className="leading-6 font-medium">{question.data.stem_md}</p>
                {question.data.options.length > 0 ? (
                  <ul className="space-y-1.5">
                    {question.data.options.map((option) => (
                      <li key={option.key} className="flex gap-2">
                        <span className="border-border bg-card flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold">
                          {option.key}
                        </span>
                        <span className="leading-6">{option.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                    Answer
                  </p>
                  <p className="mt-1 leading-6">{question.data.answer_key}</p>
                </div>
                {question.data.explanation_md ? (
                  <div>
                    <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                      Explanation
                    </p>
                    <p className="mt-1 leading-6">{question.data.explanation_md}</p>
                  </div>
                ) : null}
                <p className="text-muted-foreground text-xs">
                  {question.data.zone} · {question.data.difficulty} · {question.data.type} ·{" "}
                  {question.data.marks} mark{question.data.marks === 1 ? "" : "s"}
                  {question.data.tags.length > 0
                    ? ` · ${question.data.tags.map((t) => `#${t}`).join(" ")}`
                    : ""}
                </p>
              </div>
            ) : (
              <pre className="scrollbar-slim text-muted-foreground max-h-72 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                {JSON.stringify(submission.payload, null, 2)}
              </pre>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onApprove} className="focus-ring">
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ShieldCheck className="size-4" aria-hidden />
          )}
          {busy ? "Publishing…" : "Approve & publish"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onReject}
          className="focus-ring"
        >
          <ThumbsDown className="size-4" aria-hidden />
          Reject
        </Button>
      </div>
    </article>
  );
}
