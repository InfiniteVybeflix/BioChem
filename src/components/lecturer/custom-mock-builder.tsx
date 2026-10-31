"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardList, ExternalLink, Loader2, Search, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/ui-bits";
import { useUser } from "@/hooks/use-user";
import { useDebounce } from "@/hooks/use-debounce";
import { ZONES, zoneLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Difficulty, ExamZone } from "@/types/domain";
import type { FormTopic } from "@/components/exam/submit-note-form";

/** A custom mock row as rendered in the list (serialized server-side). */
export interface CustomMockRow {
  id: string;
  title: string;
  zone: ExamZone;
  durationMinutes: number;
  totalMarks: number;
  questionCount: number;
  createdAt: string;
}

interface PickerQuestion {
  id: string;
  stemMd: string;
  marks: number;
  difficulty: Difficulty;
  topicId: string;
  zone: ExamZone;
}

const PAGE_SIZE = 25;
const MIN_QUESTIONS = 5;

function excerptOf(stem: string): string {
  return stem
    .replace(/[#*_>`$]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

/**
 * Custom mock builder + this lecturer's existing mocks. The builder searches
 * the published question bank (RLS client), paginates 25 at a time, keeps a
 * sticky selection bar with live mark totals, and saves through
 * /api/lecturer/mocks.
 */
export function CustomMockBuilder({
  topics,
  initialMocks,
}: {
  topics: FormTopic[];
  initialMocks: CustomMockRow[];
}) {
  const { supabase } = useUser();

  const [title, setTitle] = useState("");
  const [zone, setZone] = useState<ExamZone>("cat1");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);

  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [questions, setQuestions] = useState<PickerQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const marksByIdRef = useRef<Map<string, number>>(new Map());

  const [mocks, setMocks] = useState<CustomMockRow[]>(initialMocks);
  const [saving, setSaving] = useState(false);

  // Question bank query — refetches whenever a filter or the page size changes.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    let query = supabase
      .from("questions")
      .select("id, stem_md, marks, difficulty, topic_id, zone")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (topicFilter !== "all") query = query.eq("topic_id", topicFilter);
    if (difficultyFilter !== "all") query = query.eq("difficulty", difficultyFilter);
    const term = debouncedSearch.trim();
    if (term.length > 0) query = query.ilike("stem_md", `%${term}%`);

    void query.then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error("Couldn't load questions", { description: error.message });
        setQuestions([]);
        return;
      }
      const rows: PickerQuestion[] = (data ?? []).map((row) => ({
        id: row.id,
        stemMd: row.stem_md,
        marks: row.marks,
        difficulty: row.difficulty,
        topicId: row.topic_id ?? "",
        zone: row.zone,
      }));
      for (const row of rows) marksByIdRef.current.set(row.id, row.marks);
      setQuestions(rows);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase, topicFilter, difficultyFilter, debouncedSearch, limit]);

  const selectedMarks = useMemo(() => {
    let total = 0;
    for (const id of selected) total += marksByIdRef.current.get(id) ?? 0;
    return total;
  }, [selected]);

  const toggleQuestion = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= 100) {
          toast.error("A mock can hold at most 100 questions");
          return prev;
        }
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const saveMock = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 3 || trimmedTitle.length > 160) {
      toast.error("Give the mock a title (3–160 characters)");
      return;
    }
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 300) {
      toast.error("Duration must be between 5 and 300 minutes");
      return;
    }
    if (selected.size < MIN_QUESTIONS) {
      toast.error(`Pick at least ${MIN_QUESTIONS} questions (you have ${selected.size})`);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/lecturer/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          zone,
          description: description.trim() ? description : undefined,
          durationMinutes: duration,
          questionIds: [...selected],
        }),
        credentials: "include",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Could not save the mock";
        toast.error("Could not save the mock", { description: message });
        return;
      }
      const data = payload as { examId: string; totalMarks: number };
      toast.success("Custom mock published", {
        description: `${selected.size} questions · ${data.totalMarks} marks — students can sit it now.`,
      });
      setMocks((prev) => [
        {
          id: data.examId,
          title: trimmedTitle,
          zone,
          durationMinutes: duration,
          totalMarks: data.totalMarks,
          questionCount: selected.size,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTitle("");
      setDescription("");
      setDurationMinutes(30);
      setSelected(new Set());
    } catch {
      toast.error("Could not save the mock", { description: "Network error — please try again." });
    } finally {
      setSaving(false);
    }
  };

  const hasMore = questions.length === limit;

  return (
    <div className="space-y-6">
      <section className="glass-card p-4 sm:p-6" aria-labelledby="mock-builder-heading">
        <h2 id="mock-builder-heading" className="font-heading text-lg font-semibold">
          Build a custom mock
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Assemble questions into a timed exam your class can sit — pick at least {MIN_QUESTIONS}.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="mock-title">Title</Label>
            <Input
              id="mock-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. CAT 2 revision sprint"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-zone">Zone</Label>
            <Select value={zone} onValueChange={(value) => setZone(value as ExamZone)}>
              <SelectTrigger id="mock-zone" className="w-full" aria-label="Choose a zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-duration">Duration (minutes)</Label>
            <Input
              id="mock-duration"
              type="number"
              min={5}
              max={300}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="mock-description">Description (optional)</Label>
            <Input
              id="mock-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shown to students before they start"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="mock-filter-topic">Filter by topic</Label>
            <Select
              value={topicFilter}
              onValueChange={(value) => {
                setTopicFilter(value);
                setLimit(PAGE_SIZE);
              }}
            >
              <SelectTrigger id="mock-filter-topic" className="w-full" aria-label="Filter by topic">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-filter-difficulty">Filter by difficulty</Label>
            <Select
              value={difficultyFilter}
              onValueChange={(value) => {
                setDifficultyFilter(value as Difficulty | "all");
                setLimit(PAGE_SIZE);
              }}
            >
              <SelectTrigger
                id="mock-filter-difficulty"
                className="w-full"
                aria-label="Filter by difficulty"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All difficulties</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mock-search">Search stems</Label>
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="mock-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setLimit(PAGE_SIZE);
                }}
                placeholder="e.g. Km, TCA cycle…"
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          {loading && questions.length === 0 ? (
            <div className="space-y-2" aria-label="Loading questions">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : !supabase ? (
            <EmptyState
              title="Question bank unavailable"
              description="The question bank is temporarily unavailable — try again shortly."
            />
          ) : questions.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="size-5" aria-hidden />}
              title="No questions match these filters"
              description="Try clearing the search or widening the topic and difficulty filters."
            />
          ) : (
            <ul className="divide-border/60 scrollbar-slim border-border/60 max-h-96 divide-y overflow-y-auto rounded-xl border">
              {questions.map((question) => (
                <li key={question.id} className="flex items-start gap-3 px-3 py-3">
                  <Checkbox
                    id={`question-${question.id}`}
                    checked={selected.has(question.id)}
                    onCheckedChange={(checked) => toggleQuestion(question.id, checked === true)}
                    className="mt-1"
                    aria-label={`Select question: ${excerptOf(question.stemMd).slice(0, 60)}`}
                  />
                  <label
                    htmlFor={`question-${question.id}`}
                    className="min-w-0 flex-1 cursor-pointer text-sm leading-relaxed"
                  >
                    <span className="line-clamp-2">{excerptOf(question.stemMd)}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {question.marks} mark{question.marks === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {question.difficulty}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {zoneLabel(question.zone)}
                      </Badge>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {hasMore && !loading ? (
            <Button
              type="button"
              variant="ghost"
              className="focus-ring mt-2 w-full"
              onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
            >
              Load more
            </Button>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <div
            className={cn(
              "glass-card border-primary/30 sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4",
            )}
            role="status"
          >
            <p className="text-sm font-medium">
              {selected.size} selected · {selectedMarks} mark{selectedMarks === 1 ? "" : "s"}
              {selected.size < MIN_QUESTIONS ? (
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  (need {MIN_QUESTIONS - selected.size} more)
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="focus-ring"
                onClick={() => setSelected(new Set())}
              >
                <X className="size-4" aria-hidden />
                Clear
              </Button>
              <Button
                type="button"
                className="focus-ring"
                disabled={saving || selected.size < MIN_QUESTIONS}
                onClick={() => void saveMock()}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                {saving ? "Saving…" : "Save mock"}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="glass-card p-4 sm:p-6" aria-labelledby="mock-list-heading">
        <h2 id="mock-list-heading" className="font-heading text-lg font-semibold">
          Your custom mocks
        </h2>
        {mocks.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<ClipboardList className="size-5" aria-hidden />}
              title="No custom mocks yet"
              description="Build your first one above — pick questions, set a duration and publish it to the class."
            />
          </div>
        ) : (
          <ul className="divide-border/60 mt-4 divide-y">
            {mocks.map((mock) => (
              <li
                key={mock.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{mock.title}</p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {zoneLabel(mock.zone)}
                    </Badge>
                    <span>
                      {mock.durationMinutes} min · {mock.questionCount} question
                      {mock.questionCount === 1 ? "" : "s"} · {mock.totalMarks} marks
                    </span>
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="focus-ring">
                  <Link href="/past-papers" className="gap-1.5">
                    Preview
                    <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
