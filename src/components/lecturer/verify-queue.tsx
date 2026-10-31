"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowBigUp, BadgeCheck, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/markdown";
import { AuthorChip } from "@/components/community/author-chip";
import { EmptyState } from "@/components/common/ui-bits";
import type { ProfileLite } from "@/components/community/types";

/** A pending answer as rendered in the verification queue. */
export interface PendingAnswer {
  replyId: string;
  discussionId: string;
  threadTitle: string;
  bodyMd: string;
  upvotes: number;
  createdAt: string;
  author: ProfileLite | null;
}

/**
 * Verification queue — unverified community answers ordered by upvotes. The
 * Verify button optimistically marks the answer and toasts the XP award;
 * failures roll the row back to pending.
 */
export function VerifyQueue({ answers }: { answers: PendingAnswer[] }) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());

  const visible = answers.filter((answer) => !verifiedIds.has(answer.replyId));

  const verify = async (answer: PendingAnswer) => {
    setPendingIds((prev) => new Set(prev).add(answer.replyId));
    try {
      const response = await fetch("/api/lecturer/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId: answer.replyId }),
        credentials: "include",
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Verification failed";
        toast.error("Could not verify that answer", { description: message });
        return;
      }
      setVerifiedIds((prev) => new Set(prev).add(answer.replyId));
      toast.success(`${answer.author?.full_name ?? "That student"} earned 15 XP`, {
        description: "The answer now carries the verified badge.",
      });
    } catch {
      toast.error("Could not verify that answer", {
        description: "Network error — please try again.",
      });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(answer.replyId);
        return next;
      });
    }
  };

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<BadgeCheck className="size-5" aria-hidden />}
        title="No answers waiting for verification"
        description="Verified answers earn students 15 XP — check back after community activity picks up."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {visible.map((answer) => {
        const pending = pendingIds.has(answer.replyId);
        return (
          <li key={answer.replyId} className="glass-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/community/${answer.discussionId}`}
                className="focus-ring group hover:text-primary flex min-w-0 items-center gap-1.5 rounded text-sm font-medium transition-colors"
              >
                <MessageSquare className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{answer.threadTitle}</span>
              </Link>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <ArrowBigUp className="size-3.5" aria-hidden />
                {answer.upvotes}
              </span>
            </div>

            <div className="scrollbar-slim mt-3 max-h-64 overflow-y-auto pr-1">
              <Markdown>{answer.bodyMd}</Markdown>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <AuthorChip author={answer.author} />
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs">
                  {format(parseISO(answer.createdAt), "d MMM yyyy, HH:mm")}
                </span>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void verify(answer)}
                  className="focus-ring"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <BadgeCheck className="size-4" aria-hidden />
                  )}
                  {pending ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
