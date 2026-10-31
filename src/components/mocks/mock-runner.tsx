"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileQuestion,
  Loader2,
  Send,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { Markdown } from "@/components/markdown/markdown";
import { MockReview } from "./mock-review";
import type { RunnerPayload, RunnerQuestion } from "./types";
import { queuedJson } from "@/lib/offline-queue";
import { zoneLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AttemptAnswer } from "@/types/domain";

const TYPE_LABELS: Record<RunnerQuestion["type"], string> = {
  mcq: "Multiple choice",
  short_answer: "Short answer",
  long_answer: "Long answer",
  structured: "Structured",
};

const ANSWER_PLACEHOLDERS: Record<string, string> = {
  short_answer: "Your answer…",
  long_answer: "Write your full answer — key terms earn credit…",
  structured:
    "Structure your answer: definition, mechanism, example. Key terms from the marking scheme earn partial credit.",
};

/** Shallow runtime validation of the API payload before casting. */
function parseRunnerPayload(body: unknown): RunnerPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as { attempt?: { id?: unknown; status?: unknown }; questions?: unknown };
  if (
    typeof obj.attempt?.id !== "string" ||
    typeof obj.attempt.status !== "string" ||
    !Array.isArray(obj.questions)
  ) {
    return null;
  }
  return body as RunnerPayload;
}

function isAnswered(question: RunnerQuestion, answer: AttemptAnswer | undefined): boolean {
  if (question.type === "mcq") {
    return typeof answer?.selected === "string" && answer.selected.length > 0;
  }
  return typeof answer?.text === "string" && answer.text.trim().length > 0;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Take (in progress) or review (submitted) a mock attempt. Fetches its own
 * payload from the API so answer keys never reach the client early.
 */
export function MockRunner({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<RunnerPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AttemptAnswer>>({});
  const [current, setCurrent] = useState(0);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef<Record<string, AttemptAnswer>>({});
  const lastSavedRef = useRef("{}");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // ---------- Load the attempt ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mocks/${attemptId}`);
        const body: unknown = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setFetchError((body as { error?: string }).error ?? "Could not load this attempt");
          return;
        }
        const payload = parseRunnerPayload(body);
        if (!payload) {
          setFetchError("Could not load this attempt");
          return;
        }
        setData(payload);
        setAnswers(payload.attempt.answers ?? {});
      } catch {
        if (!cancelled) setFetchError("Network error — could not load this attempt");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // ---------- Autosave (debounced 2s, flushed on navigation) ----------
  const fireSave = useCallback(async () => {
    const snapshot = JSON.stringify(answersRef.current);
    if (snapshot === lastSavedRef.current) return;
    lastSavedRef.current = snapshot;
    try {
      const result = await queuedJson(`/api/mocks/${attemptId}`, "PATCH", {
        answers: answersRef.current,
      });
      if (!result.ok && result.status !== 0) lastSavedRef.current = "";
    } catch {
      lastSavedRef.current = ""; // retry on the next flush
    }
  }, [attemptId]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void fireSave();
    }, 2000);
  }, [fireSave]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await fireSave();
  }, [fireSave]);

  // Flush pending changes when leaving the runner.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) void fireSave();
    };
  }, [fireSave]);

  const setAnswer = useCallback(
    (questionId: string, patch: AttemptAnswer) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: { ...prev[questionId], ...patch },
      }));
      scheduleSave();
    },
    [scheduleSave],
  );

  // ---------- Timer ----------
  useEffect(() => {
    if (data?.attempt.status !== "in_progress") return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data?.attempt.status]);

  const deadline = useMemo(() => {
    if (!data) return 0;
    return (
      new Date(data.attempt.startedAt).getTime() +
      Math.max(1, data.attempt.config.durationMinutes ?? 30) * 60_000
    );
  }, [data]);

  const inProgress = data?.attempt.status === "in_progress";
  const remainingMs = inProgress ? deadline - nowTick : 0;

  // ---------- Submit ----------
  const submitAttempt = useCallback(
    async (auto: boolean) => {
      if (!data || data.attempt.status !== "in_progress" || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await flushSave(); // make sure the latest answers are graded
        const res = await fetch(`/api/mocks/${attemptId}/submit`, { method: "POST" });
        const body: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error((body as { error?: string }).error ?? "Could not submit your mock");
          return;
        }
        const payload = parseRunnerPayload(body);
        if (!payload) {
          toast.error("Could not load your graded attempt");
          return;
        }
        setData(payload);
        setAnswers(payload.attempt.answers ?? {});
        toast.success(
          auto ? "Time is up — your mock was submitted" : "Mock submitted — here's how you did",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        toast.error("Network error — could not submit your mock");
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, data, flushSave],
  );

  // Auto-submit when the countdown reaches zero.
  useEffect(() => {
    if (!data || data.attempt.status !== "in_progress") return;
    if (remainingMs > 0 || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void submitAttempt(true);
  }, [remainingMs, data, submitAttempt]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (data?.attempt.status !== "in_progress") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [data?.attempt.status]);

  // ---------- Render ----------
  if (fetchError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-5" aria-hidden />}
        title="Could not load this attempt"
        description={fetchError}
        action={
          <Button asChild>
            <Link href="/mocks">Back to mock hub</Link>
          </Button>
        }
      />
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6" aria-busy="true" aria-label="Loading attempt">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
        <div className="flex justify-between">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    );
  }

  if (data.attempt.status === "submitted") {
    return <MockReview attempt={data.attempt} questions={data.questions} />;
  }

  if (data.attempt.status !== "in_progress") {
    return (
      <EmptyState
        icon={<FileQuestion className="size-5" aria-hidden />}
        title="This attempt was abandoned"
        description="Abandoned attempts keep their place in history but can no longer be resumed."
        action={
          <Button asChild>
            <Link href="/mocks">Back to mock hub</Link>
          </Button>
        }
      />
    );
  }

  if (data.questions.length === 0) {
    return (
      <EmptyState
        icon={<FileQuestion className="size-5" aria-hidden />}
        title="This attempt has no questions"
        description="The questions may have been removed. Start a fresh mock from the hub."
        action={
          <Button asChild>
            <Link href="/mocks">Back to mock hub</Link>
          </Button>
        }
      />
    );
  }

  const total = data.questions.length;
  const answeredCount = data.questions.filter((question) =>
    isAnswered(question, answers[question.id]),
  ).length;
  const question = data.questions[Math.min(current, total - 1)];
  const answer = answers[question.id];
  const timerTone =
    remainingMs < 60_000
      ? "border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : remainingMs < 5 * 60_000
        ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "border-border/60 bg-card/60 text-foreground";

  const goTo = (index: number) => {
    setCurrent(index);
    void flushSave();
  };

  return (
    <div className="min-w-0">
      {/* ---------- Sticky status bar ---------- */}
      <div className="border-border/60 bg-background/85 sticky top-16 z-30 -mx-4 mb-6 border-b px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              role="timer"
              aria-live="off"
              aria-label={`Time remaining: ${formatCountdown(remainingMs)}`}
              className={cn(
                "font-heading inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-bold tabular-nums",
                timerTone,
              )}
            >
              <Clock className="size-4" aria-hidden />
              {formatCountdown(remainingMs)}
            </span>
            <span className="text-muted-foreground truncate text-sm">
              Question {current + 1} of {total}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {answeredCount}/{total} answered
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="size-4" aria-hidden />
                  )}
                  Submit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this mock?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have answered {answeredCount} of {total} questions. Submitting locks your
                    answers and grades the attempt — this cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep working</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void submitAttempt(false)}>
                    Submit now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <Progress
          value={total > 0 ? (answeredCount / total) * 100 : 0}
          className="mx-auto mt-3 h-1.5 max-w-3xl"
          aria-label={`${answeredCount} of ${total} questions answered`}
        />
      </div>

      <div className="mx-auto max-w-3xl space-y-5">
        {/* ---------- Question card ---------- */}
        <article className="glass-card p-4 sm:p-6" aria-label={`Question ${current + 1}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Q{current + 1}</Badge>
              <Badge variant="outline">{TYPE_LABELS[question.type]}</Badge>
              <Badge variant="outline">
                {question.marks} {question.marks === 1 ? "mark" : "marks"}
              </Badge>
            </div>
            <Badge variant="outline" className="capitalize">
              {question.difficulty}
            </Badge>
          </div>

          <Markdown className="mt-4">{question.stemMd}</Markdown>

          {question.type === "mcq" ? (
            <div role="radiogroup" aria-label="Answer options" className="mt-5 grid gap-3">
              {question.options.map((option) => {
                const selected = answer?.selected === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAnswer(question.id, { selected: option.key })}
                    className={cn(
                      "focus-ring flex min-h-14 w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5",
                      selected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border/70 bg-background/60 hover:bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {option.key}
                    </span>
                    <span className="text-sm leading-6">{option.text}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {question.type === "structured" ? (
                <p className="text-muted-foreground text-xs">
                  Structure your answer — definition, mechanism, then an example. Key terms from the
                  marking scheme earn partial credit.
                </p>
              ) : null}
              <Textarea
                value={answer?.text ?? ""}
                onChange={(event) => setAnswer(question.id, { text: event.target.value })}
                placeholder={ANSWER_PLACEHOLDERS[question.type] ?? "Your answer…"}
                className="min-h-32"
                aria-label="Your answer"
              />
            </div>
          )}
        </article>

        {/* ---------- Dots navigator ---------- */}
        <nav aria-label="Question navigator" className="glass-card p-4">
          <div className="flex flex-wrap gap-1.5">
            {data.questions.map((q, index) => {
              const answered = isAnswered(q, answers[q.id]);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Question ${index + 1}${answered ? ", answered" : ", not answered"}`}
                  aria-current={index === current ? "true" : undefined}
                  className={cn(
                    "focus-ring size-9 rounded-lg border text-xs font-semibold tabular-nums transition-all hover:-translate-y-0.5",
                    index === current
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : answered
                        ? "border-primary/40 bg-primary/15 text-foreground"
                        : "border-border/70 bg-background/60 text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ---------- Prev / Next ---------- */}
        <div className="flex items-center justify-between gap-3 pb-4">
          <Button
            variant="outline"
            disabled={current === 0}
            onClick={() => goTo(Math.max(0, current - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Button>
          {current < total - 1 ? (
            <Button onClick={() => goTo(current + 1)}>
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="size-4" aria-hidden />
                  )}
                  Finish &amp; submit
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this mock?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have answered {answeredCount} of {total} questions. Submitting locks your
                    answers and grades the attempt — this cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep working</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void submitAttempt(false)}>
                    Submit now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <p className="text-muted-foreground pb-6 text-center text-xs">
          Answers save automatically — you can safely close this page and resume later from{" "}
          {zoneLabel(data.attempt.zone)} mocks.
        </p>
      </div>
    </div>
  );
}
