"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ClipboardCheck, Inbox, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/ui-bits";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import type { ContentStatus, SubmissionType } from "@/types/domain";

/** Serialisable own-submission row shared between the server page and this list. */
export interface SubmissionLite {
  id: string;
  type: SubmissionType;
  title: string;
  status: ContentStatus;
  reviewNotes: string | null;
  createdAt: string;
}

const TYPE_META: Record<SubmissionType, { label: string; icon: typeof BookOpen }> = {
  note: { label: "Note", icon: BookOpen },
  question: { label: "Question", icon: ClipboardCheck },
  past_paper: { label: "Past paper", icon: ClipboardCheck },
  flashcard_set: { label: "Flashcard set", icon: Sparkles },
};

const STATUS_STYLES: Record<ContentStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-border bg-muted text-muted-foreground" },
  pending: {
    label: "Awaiting review",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  published: {
    label: "Published",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  rejected: {
    label: "Changes requested",
    className: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
  archived: { label: "Archived", className: "border-border bg-muted text-muted-foreground" },
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * "Your submissions" list on /submit: shows the signed-in user's submissions
 * with status badges and reviewer feedback. Stays live via a realtime channel
 * on `submissions` (filtered to the user) and a window event the forms fire
 * after a successful insert.
 */
export function SubmissionsList({ initialSubmissions }: { initialSubmissions: SubmissionLite[] }) {
  const { supabase, userId } = useUser();
  const [submissions, setSubmissions] = useState<SubmissionLite[]>(initialSubmissions);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    setRefreshing(true);
    const { data } = await supabase
      .from("submissions")
      .select("id, type, title, status, review_notes, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (data) {
      setSubmissions(
        data.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          status: row.status,
          reviewNotes: row.review_notes,
          createdAt: row.created_at,
        })),
      );
    }
    setRefreshing(false);
  }, [supabase, userId]);

  // Initial sync + refresh when either form submits successfully.
  useEffect(() => {
    void load();
    const handler = () => {
      void load();
    };
    window.addEventListener("biochem:submissions-changed", handler);
    return () => window.removeEventListener("biochem:submissions-changed", handler);
  }, [load]);

  // Realtime: reviewer decisions (approve/reject/notes) appear instantly.
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`submissions-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", filter: `user_id=eq.${userId}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  if (!userId) {
    return (
      <EmptyState
        icon={<Inbox className="size-6" aria-hidden />}
        title="Sign in to see your submissions"
        description="Your contribution history and reviewer feedback live here once you're signed in."
      />
    );
  }

  if (submissions.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-6" aria-hidden />}
        title="No submissions yet"
        description="Notes or questions you submit for review appear here, with live status and any reviewer feedback."
      />
    );
  }

  return (
    <div
      className={cn(
        "glass-card divide-border/60 divide-y",
        refreshing && "opacity-70 transition-opacity",
      )}
    >
      {submissions.map((submission) => {
        const typeMeta = TYPE_META[submission.type] ?? TYPE_META.note;
        const statusMeta = STATUS_STYLES[submission.status] ?? STATUS_STYLES.pending;
        const Icon = typeMeta.icon;
        return (
          <article key={submission.id} className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
            <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 truncate font-medium">{submission.title}</p>
                <Badge variant="outline" className="text-muted-foreground shrink-0">
                  {typeMeta.label}
                </Badge>
                <Badge variant="outline" className={cn("shrink-0 border", statusMeta.className)}>
                  {statusMeta.label}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Submitted {formatWhen(submission.createdAt)}
              </p>
              {submission.reviewNotes ? (
                <p className="border-border/70 bg-muted/40 text-muted-foreground mt-2 rounded-lg border px-3 py-2 text-sm leading-6">
                  <span className="text-foreground/80 font-semibold">Reviewer feedback: </span>
                  {submission.reviewNotes}
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
      {refreshing ? (
        <p className="sr-only" role="status" aria-live="polite">
          Refreshing your submissions
        </p>
      ) : null}
    </div>
  );
}
