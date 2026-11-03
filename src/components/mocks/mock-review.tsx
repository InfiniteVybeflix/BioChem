"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown/markdown";
import { gradeBand } from "@/lib/grading";
import { zoneLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatDateTimeSafe } from "./date-utils";
import type { RunnerAttempt, RunnerQuestion } from "./types";
import type { AttemptAnswer, AttemptMode } from "@/types/domain";

const MODE_LABELS: Record<AttemptMode, string> = {
  practice: "Practice",
  mock: "Mock",
  custom: "Custom exam",
  past_paper: "Past paper",
};

const TYPE_LABELS: Record<RunnerQuestion["type"], string> = {
  mcq: "Multiple choice",
  short_answer: "Short answer",
  long_answer: "Long answer",
  structured: "Structured",
};

type ReviewFilter = "all" | "correct" | "partial" | "incorrect";

function reviewStatus(answer: AttemptAnswer | undefined): Exclude<ReviewFilter, "all"> {
  if (answer?.correct === true) return "correct";
  if ((answer?.marksAwarded ?? 0) > 0) return "partial";
  return "incorrect";
}

function bandToneClass(tone: "great" | "good" | "warn" | "bad"): string {
  switch (tone) {
    case "great":
      return "text-emerald-600 dark:text-emerald-400";
    case "good":
      return "text-primary";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    case "bad":
      return "text-rose-600 dark:text-rose-400";
  }
}

function bandBadgeClass(tone: "great" | "good" | "warn" | "bad"): string {
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

function statusClasses(status: Exclude<ReviewFilter, "all">): string {
  switch (status) {
    case "correct":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "partial":
      return "border-amber-500/40 bg-amber-500/5";
    case "incorrect":
      return "border-rose-500/40 bg-rose-500/5";
  }
}

function statusBadgeClass(status: Exclude<ReviewFilter, "all">): string {
  switch (status) {
    case "correct":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "partial":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    case "incorrect":
      return "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  }
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** Post-submission review: score summary + per-question breakdown. */
export function MockReview({
  attempt,
  questions,
}: {
  attempt: RunnerAttempt;
  questions: RunnerQuestion[];
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");

  const counts = useMemo(() => {
    const result = { all: questions.length, correct: 0, partial: 0, incorrect: 0 };
    for (const question of questions) {
      result[reviewStatus(attempt.answers[question.id])] += 1;
    }
    return result;
  }, [questions, attempt.answers]);

  const visible = questions.filter(
    (question) => filter === "all" || reviewStatus(attempt.answers[question.id]) === filter,
  );

  const percentage =
    attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  const band = gradeBand(percentage);
  const heading = attempt.examTitle ?? `${zoneLabel(attempt.zone)} ${MODE_LABELS[attempt.mode]}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ---------- Score header ---------- */}
      <section aria-label="Score summary" className="glass-card p-6 text-center sm:p-8">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {heading}
        </p>
        <p
          className={cn(
            "font-heading mt-2 text-5xl font-bold tabular-nums sm:text-6xl",
            bandToneClass(band.tone),
          )}
        >
          {percentage}%
        </p>
        <Badge variant="outline" className={cn("mt-3", bandBadgeClass(band.tone))}>
          {band.label}
        </Badge>
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-sm">
          <span className="text-foreground font-medium">
            {attempt.score} / {attempt.maxScore} marks
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden />
            {formatDuration(attempt.durationSeconds)}
          </span>
          {attempt.submittedAt ? (
            <span>{formatDateTimeSafe(attempt.submittedAt, "d MMM yyyy, HH:mm", "Submitted")}</span>
          ) : null}
        </div>
      </section>

      {/* ---------- Filter chips ---------- */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter questions">
        {(
          [
            { key: "all", label: "All" },
            { key: "correct", label: "Correct" },
            { key: "incorrect", label: "Incorrect" },
            { key: "partial", label: "Partial" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={cn(
              "focus-ring min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5",
              filter === option.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 bg-card/50 text-muted-foreground hover:bg-accent/50",
            )}
          >
            {option.label} ({counts[option.key]})
          </button>
        ))}
      </div>

      {/* ---------- Question review cards ---------- */}
      {visible.length === 0 ? (
        <p className="glass-card text-muted-foreground p-6 text-center text-sm">
          No questions in this category.
        </p>
      ) : (
        <ol className="space-y-4">
          {visible.map((question) => (
            <ReviewCard
              key={question.id}
              index={questions.indexOf(question) + 1}
              question={question}
              answer={attempt.answers[question.id]}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ReviewCard({
  index,
  question,
  answer,
}: {
  index: number;
  question: RunnerQuestion;
  answer: AttemptAnswer | undefined;
}) {
  const status = reviewStatus(answer);
  const marksAwarded = answer?.marksAwarded ?? 0;

  const yourAnswer =
    question.type === "mcq"
      ? ((question.options ?? []).find((option) => option.key === (answer?.selected ?? ""))?.text ??
        (answer?.selected ? answer.selected : "Not answered"))
      : answer?.text?.trim() && answer.text.trim().length > 0
        ? answer.text.trim()
        : "Not answered";

  const correctAnswer =
    question.type === "mcq"
      ? ((question.options ?? []).find((option) => option.key === question.answerKey)?.text ??
        question.answerKey ??
        "—")
      : (question.answerKey ?? "—");

  return (
    <li className={cn("glass-card p-4 sm:p-6", statusClasses(status))}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Q{index}</Badge>
          <Badge variant="outline">{TYPE_LABELS[question.type] ?? "Question"}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusBadgeClass(status)}>
            {status === "correct" ? (
              <CheckCircle2 className="size-3" aria-hidden />
            ) : status === "incorrect" ? (
              <XCircle className="size-3" aria-hidden />
            ) : null}
            {marksAwarded} / {question.marks} marks
          </Badge>
        </div>
      </div>

      <Markdown className="mt-4">{question.stemMd}</Markdown>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className={cn(
            "rounded-lg border p-3",
            status === "correct"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-rose-500/40 bg-rose-500/5",
          )}
        >
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Your answer
          </p>
          <p className="mt-1.5 text-sm leading-6">{yourAnswer}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Correct answer
          </p>
          <div className="mt-1.5 text-sm leading-6">
            <Markdown className="text-[14px] [&_p]:leading-6">{correctAnswer}</Markdown>
          </div>
        </div>
      </div>

      {question.explanationMd && question.explanationMd.length > 0 ? (
        <div className="bg-muted/40 mt-4 rounded-lg p-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Explanation
          </p>
          <Markdown className="mt-1">{question.explanationMd}</Markdown>
        </div>
      ) : null}
    </li>
  );
}
