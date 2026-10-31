"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/ui-bits";
import { NoteCard, type NoteSummary } from "@/components/exam/note-card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { ZONES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ExamZone } from "@/types/domain";

export interface TopicLite {
  id: string;
  title: string;
  slug: string;
  zone: ExamZone;
}

type ZoneFilter = "all" | ExamZone;

const NOTE_SELECT =
  "id, title, slug, summary, reading_minutes, views, tags, is_exam_critical, " +
  "topic:topics!notes_topic_id_fkey (title, slug, zone), " +
  "contributor:profiles!notes_contributed_by_fkey (full_name)";

interface RawNoteRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  reading_minutes: number;
  views: number;
  tags: string[];
  is_exam_critical: boolean;
  topic: { title: string; slug: string; zone: ExamZone } | null;
  contributor: { full_name: string } | null;
}

/**
 * Interactive browser for public published notes: zone chips, topic select and
 * a debounced title/summary search. Re-queries Supabase client-side (anon
 * access is enough — the data is public); the server page seeds round one.
 */
export function ExploreBrowser({
  initialNotes,
  topics,
}: {
  initialNotes: NoteSummary[];
  topics: TopicLite[];
}) {
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [topicSlug, setTopicSlug] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>(initialNotes);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const skipInitialFetch = useRef(true);

  // Keep the topic filter coherent when the zone changes.
  useEffect(() => {
    if (zone === "all") return;
    const stillValid = topics.some((topic) => topic.slug === topicSlug && topic.zone === zone);
    if (!stillValid) setTopicSlug("all");
  }, [zone, topicSlug, topics]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    setLoading(true);

    const fetchNotes = async () => {
      let request = supabase
        .from("notes")
        .select(NOTE_SELECT)
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(48);

      const zoneTopicIds =
        zone === "all"
          ? topics.map((topic) => topic.id)
          : topics.filter((topic) => topic.zone === zone).map((topic) => topic.id);
      if (zoneTopicIds.length > 0) {
        request = request.in("topic_id", zoneTopicIds);
      } else if (zone !== "all") {
        // Zone exists but has no topics → no notes either.
        if (!cancelled) {
          setNotes([]);
          setLoading(false);
        }
        return;
      }

      if (topicSlug !== "all") {
        const topic = topics.find((item) => item.slug === topicSlug);
        request = request.eq("topic_id", topic ? topic.id : "00000000-0000-0000-0000-000000000000");
      }

      const trimmed = debouncedQuery.trim().replace(/[,()\\]/g, " ");
      if (trimmed.length > 0) {
        request = request.or(`title.ilike.%${trimmed}%,summary.ilike.%${trimmed}%`);
      }

      const { data, error } = await request;
      if (cancelled) return;
      if (error) {
        setNotes([]);
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as unknown as RawNoteRow[];
      setNotes(
        rows
          .filter((row) => row.topic !== null)
          .map((row) => ({
            id: row.id,
            title: row.title,
            slug: row.slug,
            summary: row.summary,
            readingMinutes: row.reading_minutes,
            views: row.views,
            tags: row.tags,
            isExamCritical: row.is_exam_critical,
            topic: {
              title: row.topic?.title ?? "",
              slug: row.topic?.slug ?? "",
              zone: row.topic?.zone ?? "cat1",
            },
            contributorName: row.contributor?.full_name ?? null,
          })),
      );
      setLoading(false);
    };

    void fetchNotes();
    return () => {
      cancelled = true;
    };
  }, [zone, topicSlug, debouncedQuery, topics]);

  const visibleTopics = zone === "all" ? topics : topics.filter((topic) => topic.zone === zone);

  return (
    <section aria-label="Note browser">
      {/* Filter bar */}
      <div className="glass-panel flex flex-col gap-3 p-4">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by exam zone"
        >
          <button
            type="button"
            onClick={() => setZone("all")}
            aria-pressed={zone === "all"}
            className={cn(
              "focus-ring rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
              zone === "all"
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/70 bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            All zones
          </button>
          {ZONES.map((zoneOption) => (
            <button
              key={zoneOption.id}
              type="button"
              onClick={() => setZone(zoneOption.id)}
              aria-pressed={zone === zoneOption.id}
              className={cn(
                "focus-ring rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
                zone === zoneOption.id
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/70 bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {zoneOption.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and summaries…"
              aria-label="Search notes"
              className="pl-9"
            />
          </div>
          <Select value={topicSlug} onValueChange={setTopicSlug}>
            <SelectTrigger className="w-full sm:w-60" aria-label="Filter by topic">
              <SelectValue placeholder="All topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {(zone === "all" ? ZONES : [ZONES.find((item) => item.id === zone)]).map(
                (zoneOption) =>
                  zoneOption ? (
                    <SelectGroup key={zoneOption.id}>
                      <SelectLabel>{zoneOption.label}</SelectLabel>
                      {visibleTopics
                        .filter((topic) => topic.zone === zoneOption.id)
                        .map((topic) => (
                          <SelectItem key={topic.id} value={topic.slug}>
                            {topic.title}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ) : null,
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div
          className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading notes"
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-card space-y-3 p-5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-12 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<SearchX className="size-6" aria-hidden />}
            title="No notes match your filters"
            description="Try a different zone or search term — or be the first to publish notes on this topic and earn XP."
            action={
              <Button asChild className="focus-ring">
                <Link href="/signup">Start contributing</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mt-6 text-sm" aria-live="polite">
            {loading
              ? "Searching…"
              : `${notes.length} published note${notes.length === 1 ? "" : "s"}`}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
