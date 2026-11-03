"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  History,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Settings2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { EmptyState } from "@/components/common/ui-bits";
import { ScoreChart } from "./score-chart";
import { formatDistanceSafe } from "./date-utils";
import type { AttemptListItem } from "./types";
import { useUser } from "@/hooks/use-user";
import { ZONES, zoneLabel } from "@/lib/constants";
import { gradeBand } from "@/lib/grading";
import { cn } from "@/lib/utils";
import type { AttemptMode, Difficulty, ExamZone } from "@/types/domain";

const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

const DIFFICULTY_OPTIONS: { value: Difficulty | "all"; label: string }[] = [
  { value: "all", label: "All difficulties" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const MODE_LABELS: Record<AttemptMode, string> = {
  practice: "Practice",
  mock: "Mock",
  custom: "Custom exam",
  past_paper: "Past paper",
};

function ModeBadge({ mode }: { mode: AttemptMode }) {
  return (
    <Badge variant="secondary" className="capitalize">
      {MODE_LABELS[mode]}
    </Badge>
  );
}

function bandTone(tone: "great" | "good" | "warn" | "bad"): string {
  switch (tone) {
    case "great":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "good":
      return "border-primary/40 bg-primary/10 text-primary";
    case "warn":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "bad":
      return "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  }
}

interface TopicOption {
  id: string;
  title: string;
}

/** Mock hub: configuration card, in-progress resumption and score history. */
export function MockHub({
  attempts,
  initialZone,
}: {
  attempts: AttemptListItem[];
  initialZone: ExamZone | null;
}) {
  const router = useRouter();
  const { supabase } = useUser();

  const [zone, setZone] = useState<ExamZone>(initialZone ?? "cat1");
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [count, setCount] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [abandoningId, setAbandoningId] = useState<string | null>(null);

  // Topics for the selected zone.
  useEffect(() => {
    if (!supabase) {
      setTopicsLoading(false);
      return;
    }
    let cancelled = false;
    setTopicsLoading(true);
    supabase
      .from("topics")
      .select("id, title")
      .eq("zone", zone)
      .order("order_index")
      .then(({ data }) => {
        if (cancelled) return;
        setTopics(data ?? []);
        setSelectedTopics([]);
        setTopicsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, zone]);

  // Preflight: how many published questions match the current filters?
  useEffect(() => {
    if (!supabase) return;
    const timer = setTimeout(() => {
      let query = supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("zone", zone)
        .eq("status", "published");
      if (selectedTopics.length > 0) query = query.in("topic_id", selectedTopics);
      if (difficulty !== "all") query = query.eq("difficulty", difficulty);
      void query.then(({ count: matched }) => setAvailableCount(matched ?? 0));
    }, 350);
    return () => clearTimeout(timer);
  }, [supabase, zone, selectedTopics, difficulty]);

  const toggleTopic = (topicId: string, checked: boolean) => {
    setSelectedTopics((prev) =>
      checked ? [...prev, topicId] : prev.filter((id) => id !== topicId),
    );
  };

  const startMock = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone,
          topicIds: selectedTopics,
          difficulty,
          count,
          durationMinutes,
        }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      const attemptId = (body as { attemptId?: string }).attemptId;
      if (!res.ok || !attemptId) {
        toast.error((body as { error?: string }).error ?? "Could not start this mock");
        return;
      }
      router.push(`/mocks/${attemptId}`);
    } catch {
      toast.error("Network error — could not start this mock");
    } finally {
      setStarting(false);
    }
  };

  const abandon = async (attemptId: string) => {
    setAbandoningId(attemptId);
    try {
      const res = await fetch(`/api/mocks/${attemptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "abandoned" }),
      });
      if (!res.ok) {
        toast.error("Could not abandon this attempt");
        return;
      }
      toast.info("Attempt abandoned");
      router.refresh();
    } catch {
      toast.error("Network error — could not abandon this attempt");
    } finally {
      setAbandoningId(null);
    }
  };

  const inProgress = attempts.filter((attempt) => attempt.status === "in_progress");
  const submitted = attempts.filter((attempt) => attempt.status === "submitted");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[360px,1fr]">
      {/* ---------- New mock configuration ---------- */}
      <section aria-labelledby="new-mock-heading" className="glass-card h-fit p-4 sm:p-6">
        <h2
          id="new-mock-heading"
          className="font-heading flex items-center gap-2 text-lg font-semibold"
        >
          <Settings2 className="text-primary size-4.5" aria-hidden />
          New mock
        </h2>

        <div className="mt-5 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="mock-zone">Exam zone</Label>
            <Select
              value={zone}
              onValueChange={(value) => {
                const next = ZONES.find((z) => z.id === value);
                if (next) setZone(next.id);
              }}
            >
              <SelectTrigger id="mock-zone" className="w-full" aria-label="Exam zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={topicsOpen} onOpenChange={setTopicsOpen}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Topics</span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" aria-expanded={topicsOpen}>
                  {selectedTopics.length > 0 ? `${selectedTopics.length} selected` : "All topics"}
                  <ChevronDown
                    className={cn("size-4 transition-transform", topicsOpen && "rotate-180")}
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              {topicsLoading ? (
                <div className="mt-2 space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-4/5" />
                </div>
              ) : topics.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  No topics in this zone yet — your mock will draw from the whole zone.
                </p>
              ) : (
                <div className="scrollbar-slim mt-2 max-h-64 space-y-0.5 overflow-y-auto rounded-lg border p-2">
                  {topics.map((topic) => (
                    <label
                      key={topic.id}
                      className="hover:bg-accent/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm transition-colors"
                    >
                      <Checkbox
                        checked={selectedTopics.includes(topic.id)}
                        onCheckedChange={(checked) => toggleTopic(topic.id, checked === true)}
                        aria-label={topic.title}
                      />
                      <span className="leading-snug">{topic.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-1.5">
            <Label htmlFor="mock-difficulty">Difficulty</Label>
            <Select
              value={difficulty}
              onValueChange={(value) => {
                const next = DIFFICULTY_OPTIONS.find((option) => option.value === value);
                if (next) setDifficulty(next.value);
              }}
            >
              <SelectTrigger id="mock-difficulty" className="w-full" aria-label="Difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Questions</span>
              <span className="text-primary text-sm font-semibold tabular-nums">{count}</span>
            </div>
            <Slider
              className="mt-3"
              min={5}
              max={60}
              step={1}
              value={[count]}
              onValueChange={(value) => setCount(value[0] ?? count)}
              aria-label="Number of questions"
            />
            <div className="text-muted-foreground mt-1 flex justify-between text-xs">
              <span>5</span>
              <span>60</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mock-duration">Duration</Label>
            <Select
              value={String(durationMinutes)}
              onValueChange={(value) => {
                const minutes = Number(value);
                if (DURATIONS.some((d) => d === minutes)) setDurationMinutes(minutes);
              }}
            >
              <SelectTrigger id="mock-duration" className="w-full" aria-label="Duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availableCount !== null && availableCount < 5 ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {availableCount === 0
                ? "No questions match these filters — widen them or try another zone."
                : `Only ${availableCount} questions match — widen your filters.`}
            </p>
          ) : availableCount !== null && availableCount < count ? (
            <p className="text-muted-foreground text-sm">
              {availableCount} questions available — your mock will be shorter than requested.
            </p>
          ) : null}

          <Button
            className="w-full"
            size="lg"
            onClick={() => void startMock()}
            disabled={starting || availableCount === 0}
          >
            {starting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {starting ? "Starting…" : "Start mock"}
          </Button>
        </div>
      </section>

      {/* ---------- Attempts ---------- */}
      <div className="min-w-0 space-y-6">
        {inProgress.length > 0 ? (
          <section aria-labelledby="in-progress-heading" className="space-y-3">
            <h2
              id="in-progress-heading"
              className="font-heading flex items-center gap-2 text-lg font-semibold"
            >
              <RotateCcw className="text-primary size-4.5" aria-hidden />
              In progress
            </h2>
            <ul className="glass-card divide-y">
              {inProgress.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{zoneLabel(attempt.zone)}</Badge>
                      <ModeBadge mode={attempt.mode} />
                      {attempt.examTitle ? (
                        <span className="truncate text-sm font-medium">{attempt.examTitle}</span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Started {formatDistanceSafe(attempt.startedAt, "recently")} ·{" "}
                      {attempt.config.count ?? "—"} questions ·{" "}
                      {attempt.config.durationMinutes ?? 30} min
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild>
                      <Link href={`/mocks/${attempt.id}`}>
                        <RotateCcw className="size-4" aria-hidden />
                        Resume
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void abandon(attempt.id)}
                      disabled={abandoningId === attempt.id}
                    >
                      {abandoningId === attempt.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <XCircle className="size-4" aria-hidden />
                      )}
                      Abandon
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="history-heading" className="space-y-3">
          <h2
            id="history-heading"
            className="font-heading flex items-center gap-2 text-lg font-semibold"
          >
            <History className="text-primary size-4.5" aria-hidden />
            History
          </h2>
          <ScoreChart attempts={attempts} />

          {submitted.length > 0 ? (
            <ul className="glass-card divide-y">
              {submitted.map((attempt) => {
                const pct =
                  attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
                const band = gradeBand(pct);
                return (
                  <li
                    key={attempt.id}
                    className="hover:bg-accent/30 flex flex-wrap items-center justify-between gap-3 p-4 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {attempt.submittedAt ? formatSubmitted(attempt.submittedAt) : "Submitted"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{zoneLabel(attempt.zone)}</Badge>
                        <ModeBadge mode={attempt.mode} />
                        {attempt.examTitle ? (
                          <span className="text-muted-foreground max-w-48 truncate text-xs">
                            {attempt.examTitle}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">
                        {attempt.score}/{attempt.maxScore}
                      </span>
                      <span className="text-muted-foreground text-sm tabular-nums">{pct}%</span>
                      <Badge variant="outline" className={bandTone(band.tone)}>
                        {band.label}
                      </Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/mocks/${attempt.id}`}>
                          <Layers className="size-4" aria-hidden />
                          Review
                        </Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<Layers className="size-5" aria-hidden />}
              title="No submitted mocks yet"
              description="Configure a mock on the left and submit it — your score history and trend chart will appear here."
            />
          )}
        </section>
      </div>
    </div>
  );
}

function formatSubmitted(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm");
  } catch {
    return "Submitted";
  }
}
