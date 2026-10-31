"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/markdown";
import { cn } from "@/lib/utils";
import type { JobStatus, JobType } from "@/types/domain";

/** Serialisable board job row shared by the server page, board and API. */
export interface BoardJob {
  id: string;
  title: string;
  org: string;
  location: string;
  type: JobType;
  descriptionMd: string;
  contact: string;
  status: JobStatus;
  closesAt: string | null;
  isSponsored: boolean;
  createdAt: string;
  postedByName: string;
}

export const JOB_TYPE_META: Record<JobType, { label: string; badgeClass: string }> = {
  internship: {
    label: "Internship",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  entry: {
    label: "Entry-level",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  full_time: {
    label: "Full-time",
    badgeClass: "border-primary/40 bg-primary/12 text-primary",
  },
};

function formatCloses(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * One job posting card: title, org, location, type badge, markdown description
 * (2-line excerpt with "Show more"), poster + relative time, closing date,
 * sponsored accent and the enquiry action.
 */
export function JobCard({
  job,
  showEnquire,
  enquirySent,
  onEnquire,
  sponsored = false,
}: {
  job: BoardJob;
  showEnquire: boolean;
  enquirySent: boolean;
  onEnquire?: (job: BoardJob) => void;
  sponsored?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeMeta = JOB_TYPE_META[job.type];
  const closed = job.status === "closed";

  return (
    <article
      className={cn(
        "glass-card flex h-full flex-col p-4 transition-all hover:-translate-y-0.5 sm:p-5",
        sponsored && "border-amber-500/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-base leading-snug font-semibold sm:text-lg">
            {job.title}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">{job.org}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {sponsored ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
              <Sparkles className="size-3" aria-hidden />
              Sponsored
            </span>
          ) : null}
          <Badge variant="outline" className={cn("border", typeMeta.badgeClass)}>
            {typeMeta.label}
          </Badge>
          {closed ? (
            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
              Closed
            </Badge>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        {job.location}
      </p>

      <div className="mt-3 min-h-10 flex-1">
        {expanded ? (
          <div className="text-foreground/90 text-sm leading-6">
            <Markdown>{job.descriptionMd}</Markdown>
          </div>
        ) : (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-6 whitespace-pre-line">
            {job.descriptionMd}
          </p>
        )}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="focus-ring text-primary mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium hover:underline"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="size-3" aria-hidden />
            </>
          ) : (
            <>
              Show more <ChevronDown className="size-3" aria-hidden />
            </>
          )}
        </button>
      </div>

      <div className="border-border/60 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <div className="text-muted-foreground min-w-0 text-xs">
          <p className="truncate">
            <span className="text-foreground/80 font-medium">{job.postedByName}</span> ·{" "}
            {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
          </p>
          {job.closesAt ? (
            <p className="mt-0.5 flex items-center gap-1">
              <CalendarClock className="size-3 shrink-0" aria-hidden />
              Closes {formatCloses(job.closesAt)}
            </p>
          ) : null}
        </div>

        {showEnquire ? (
          enquirySent ? (
            <Badge variant="outline" className="border-border bg-muted text-muted-foreground gap-1">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Enquiry sent
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={closed}
              onClick={() => onEnquire?.(job)}
              className="focus-ring"
            >
              <Briefcase className="size-4" aria-hidden />
              Enquire
            </Button>
          )
        ) : null}
      </div>
    </article>
  );
}
