"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, SearchX, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { QuestionCard, type QuestionData } from "@/components/exam/question-card";
import type { TopicLite } from "@/components/exam/explore-browser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { ZONES } from "@/lib/constants";
import type { Difficulty, ExamZone, QuestionOption, QuestionType } from "@/types/domain";

const PAGE_SIZE = 20;

const QUESTION_SELECT =
  "id, zone, difficulty, type, stem_md, options, answers_hidden, answers_release_at, marks, source, " +
  "topic:topics!questions_topic_id_fkey (title, slug)";

interface RawQuestionRow {
  id: string;
  zone: ExamZone;
  difficulty: Difficulty;
  type: QuestionType;
  stem_md: string;
  options: QuestionOption[];
  answers_hidden: boolean;
  answers_release_at: string | null;
  marks: number;
  source: string;
  topic: { title: string; slug: string } | null;
}

type ZoneFilter = "all" | ExamZone;
type DifficultyFilter = "all" | Difficulty;
type TypeFilter = "all" | QuestionType;

export interface QuestionFilters {
  zone: ZoneFilter;
  topicSlug: string;
  difficulty: DifficultyFilter;
  type: TypeFilter;
  query: string;
}

function toQuestionData(row: RawQuestionRow): QuestionData {
  return {
    id: row.id,
    zone: row.zone,
    difficulty: row.difficulty,
    type: row.type,
    stemMd: row.stem_md,
    options: row.options,
    answersHidden: row.answers_hidden,
    answersReleaseAt: row.answers_release_at,
    marks: row.marks,
    source: row.source,
    topicTitle: row.topic?.title ?? null,
  };
}

function shuffleIds(ids: string[]): string[] {
  const copy = [...ids];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swap];
    copy[swap] = temp;
  }
  return copy;
}

/**
 * Interactive question bank: sticky filter bar (zone / topic / difficulty /
 * type / search + "surprise me" shuffle) with paginated loading. Re-queries
 * Supabase client-side — questions are published and publicly readable.
 */
export function QuestionBank({
  initialQuestions,
  initialTotal,
  topics,
  initialFilters,
}: {
  initialQuestions: QuestionData[];
  initialTotal: number;
  topics: TopicLite[];
  initialFilters: QuestionFilters;
}) {
  const [zone, setZone] = useState<ZoneFilter>(initialFilters.zone);
  const [topicSlug, setTopicSlug] = useState(initialFilters.topicSlug);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>(initialFilters.difficulty);
  const [qtype, setQtype] = useState<TypeFilter>(initialFilters.type);
  const [query, setQuery] = useState(initialFilters.query);
  const debouncedQuery = useDebounce(query, 300);

  const [questions, setQuestions] = useState<QuestionData[]>(initialQuestions);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialQuestions.length === PAGE_SIZE);
  const [surpriseMode, setSurpriseMode] = useState(false);
  const skipInitialFetch = useRef(true);

  // Keep the topic filter coherent when the zone changes.
  useEffect(() => {
    if (zone === "all") return;
    const stillValid = topics.some((topic) => topic.slug === topicSlug && topic.zone === zone);
    if (!stillValid) setTopicSlug("all");
  }, [zone, topicSlug, topics]);

  const activeTopic = topics.find((topic) => topic.slug === topicSlug) ?? null;
  const visibleTopics = zone === "all" ? topics : topics.filter((topic) => topic.zone === zone);
  const trimmedQuery = debouncedQuery.trim();

  const fetchPage = useCallback(
    async (
      offset: number,
    ): Promise<{ rows: QuestionData[]; count: number; hasMore: boolean } | null> => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return null;

      let request = supabase
        .from("questions")
        .select(QUESTION_SELECT, { count: "exact" })
        .eq("status", "published");

      if (zone !== "all") request = request.eq("zone", zone);
      if (activeTopic) request = request.eq("topic_id", activeTopic.id);
      if (difficulty !== "all") request = request.eq("difficulty", difficulty);
      if (qtype !== "all") request = request.eq("type", qtype);
      if (trimmedQuery.length > 0) {
        const safe = trimmedQuery.replace(/[,()%\\]/g, " ");
        request = request.ilike("stem_md", `%${safe}%`);
      }

      const { data, error, count } = await request
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return null;

      const rows = ((data ?? []) as unknown as RawQuestionRow[]).map(toQuestionData);
      const totalCount = count ?? 0;
      return {
        rows,
        count: totalCount,
        hasMore: rows.length === PAGE_SIZE && offset + rows.length < totalCount,
      };
    },
    [zone, activeTopic, difficulty, qtype, trimmedQuery],
  );

  // Refetch from the top whenever a filter changes.
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      const result = await fetchPage(0);
      if (cancelled) return;
      if (result) {
        setQuestions(result.rows);
        setTotal(result.count);
        setHasMore(result.hasMore);
      } else {
        setQuestions([]);
        setTotal(0);
        setHasMore(false);
      }
      setSurpriseMode(false);
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await fetchPage(questions.length);
    if (result) {
      setQuestions((current) => [...current, ...result.rows]);
      setHasMore(result.hasMore);
    }
    setLoadingMore(false);
  };

  const handleSurprise = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let idRequest = supabase.from("questions").select("id").eq("status", "published").limit(500);
    if (zone !== "all") idRequest = idRequest.eq("zone", zone);
    if (activeTopic) idRequest = idRequest.eq("topic_id", activeTopic.id);
    if (difficulty !== "all") idRequest = idRequest.eq("difficulty", difficulty);
    if (qtype !== "all") idRequest = idRequest.eq("type", qtype);
    if (trimmedQuery.length > 0) {
      const safe = trimmedQuery.replace(/[,()%\\]/g, " ");
      idRequest = idRequest.ilike("stem_md", `%${safe}%`);
    }

    setLoading(true);
    const { data: idRows, error } = await idRequest;
    if (error || !idRows || idRows.length === 0) {
      setLoading(false);
      return;
    }

    const picked = shuffleIds(idRows.map((row) => row.id)).slice(0, PAGE_SIZE);
    const { data: fullRows } = await supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .eq("status", "published")
      .in("id", picked);
    if (fullRows) {
      const byId = new Map(
        (fullRows as unknown as RawQuestionRow[]).map((row) => [row.id, toQuestionData(row)]),
      );
      setQuestions(
        picked.map((id) => byId.get(id)).filter((item): item is QuestionData => item !== null),
      );
      setTotal(idRows.length);
      setHasMore(false);
      setSurpriseMode(true);
    }
    setLoading(false);
  };

  const zoneSelectValue = zone === "all" ? "all" : zone;

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="border-border/60 bg-background/85 sticky top-16 z-30 -mx-4 mb-6 border-b px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search questions…"
              aria-label="Search questions"
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:items-center">
            <Select value={zoneSelectValue} onValueChange={(value) => setZone(value as ZoneFilter)}>
              <SelectTrigger className="w-full lg:w-36" aria-label="Filter by zone">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {ZONES.map((zoneOption) => (
                  <SelectItem key={zoneOption.id} value={zoneOption.id}>
                    {zoneOption.short}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={topicSlug} onValueChange={setTopicSlug}>
              <SelectTrigger className="w-full lg:w-44" aria-label="Filter by topic">
                <SelectValue placeholder="Topic" />
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

            <Select
              value={difficulty}
              onValueChange={(value) => setDifficulty(value as DifficultyFilter)}
            >
              <SelectTrigger className="w-full lg:w-32" aria-label="Filter by difficulty">
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any difficulty</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>

            <Select value={qtype} onValueChange={(value) => setQtype(value as TypeFilter)}>
              <SelectTrigger className="w-full lg:w-36" aria-label="Filter by question type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any type</SelectItem>
                <SelectItem value="mcq">MCQ</SelectItem>
                <SelectItem value="short_answer">Short answer</SelectItem>
                <SelectItem value="long_answer">Long answer</SelectItem>
                <SelectItem value="structured">Structured</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleSurprise}
            disabled={loading}
            className="focus-ring"
          >
            <Shuffle className="size-4" aria-hidden />
            Surprise me
          </Button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading questions">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="glass-card space-y-3 p-6">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" aria-hidden />}
          title="No questions match your filters"
          description="Loosen the filters, or help the class out by contributing questions for this topic."
          action={
            <Button asChild className="focus-ring">
              <Link href="/submit">Contribute a question</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground mb-4 text-sm" aria-live="polite">
            {surpriseMode ? (
              <>
                Showing{" "}
                <span className="text-foreground font-medium tabular-nums">{questions.length}</span>{" "}
                random picks from{" "}
                <span className="text-foreground font-medium tabular-nums">{total}</span> matching
                questions
              </>
            ) : (
              <>
                <span className="text-foreground font-medium tabular-nums">{total}</span> question
                {total === 1 ? "" : "s"} match your filters
              </>
            )}
          </p>

          <div className="space-y-4">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>

          {hasMore && !surpriseMode ? (
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="focus-ring"
              >
                {loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {loadingMore ? "Loading…" : "Load more questions"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
