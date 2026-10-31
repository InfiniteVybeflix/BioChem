import Link from "next/link";
import { Clock, Eye, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { zoneLabel } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

/** Serialisable note summary shared between server pages and client browsers. */
export interface NoteSummary {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  readingMinutes: number;
  views: number;
  tags: string[];
  isExamCritical: boolean;
  topic: { title: string; slug: string; zone: ExamZone };
  contributorName: string | null;
}

/**
 * Note card used in the public explore grid and the per-topic zone lists.
 * Renders as a single link to the note viewer.
 */
export function NoteCard({ note }: { note: NoteSummary }) {
  return (
    <Link
      href={`/notes/${note.slug}`}
      className="glass-card group hover:border-primary/40 hover:shadow-primary/10 focus-ring flex flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-heading group-hover:text-primary min-w-0 text-base leading-snug font-semibold transition-colors sm:text-lg">
          {note.title}
        </h3>
        {note.isExamCritical ? (
          <Badge className="shrink-0 gap-1 border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Flame className="size-3" aria-hidden />
            Exam critical
          </Badge>
        ) : null}
      </div>

      {note.summary ? (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm leading-6">{note.summary}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{note.topic.title}</Badge>
        <Badge variant="outline">{zoneLabel(note.topic.zone)}</Badge>
        {note.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-muted-foreground">
            #{tag}
          </Badge>
        ))}
      </div>

      <div className="text-muted-foreground mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs">
        <span className="truncate">
          Contributed by{" "}
          <span className="text-foreground/80 font-medium">
            {note.contributorName ?? "BioChem staff"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            <span className="tabular-nums">{note.readingMinutes} min</span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" aria-hidden />
            <span className="tabular-nums">{note.views}</span>
          </span>
        </span>
      </div>
    </Link>
  );
}
