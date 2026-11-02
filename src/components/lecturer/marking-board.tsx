"use client";

import { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/common/ui-bits";
import type { MarkingQuestion } from "@/app/api/lecturer/marking/route";

const TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  short_answer: "Short answer",
  long_answer: "Long answer",
  structured: "Structured",
};

function formatWhen(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Lecturer marking — review every attempt students made on your bank
 * questions, mark written answers right/wrong, and decide when hidden
 * answers open up (manually or at a scheduled moment).
 */
export function MarkingBoard({ initial }: { initial: MarkingQuestion[] }) {
  const [questions, setQuestions] = useState<MarkingQuestion[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [releaseAt, setReleaseAt] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    const response = await fetch("/api/lecturer/marking", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { questions: MarkingQuestion[] };
    setQuestions(data.questions);
    setLoaded(true);
  };

  // The page hands off an empty list — the real data loads on mount.
  useEffect(() => {
    void reload();
  }, []);

  const act = async (
    body: Record<string, unknown>,
    questionId: string,
    successMessage: string,
  ) => {
    setBusyId(questionId);
    try {
      const response = await fetch("/api/lecturer/marking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Action failed";
        toast.error(message);
        return;
      }
      toast.success(successMessage);
      await reload();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setBusyId(null);
    }
  };

  const mark = async (attemptId: string, result: "correct" | "incorrect" | "clear") => {
    setBusyId(attemptId);
    try {
      const response = await fetch("/api/lecturer/marking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", attemptId, result }),
      });
      if (!response.ok) {
        toast.error("Could not save the mark");
        return;
      }
      setQuestions((prev) =>
        prev.map((question) => ({
          ...question,
          attempts: question.attempts.map((attempt) =>
            attempt.id === attemptId
              ? { ...attempt, markedResult: result === "clear" ? null : result }
              : attempt,
          ),
        })),
      );
      toast.success(result === "clear" ? "Mark cleared" : `Marked ${result}`);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setBusyId(null);
    }
  };

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={loaded ? <Check className="size-6" aria-hidden /> : <Loader2 className="size-6 animate-spin" aria-hidden />}
        title={loaded ? "Nothing to mark yet" : "Loading attempts…"}
        description={
          loaded
            ? "Publish questions from the Publish tab (or import them in the console). Once students attempt them, every attempt shows up here for marking — and you control when hidden answers open."
            : "Fetching the latest attempts on your questions."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {questions.length} question{questions.length === 1 ? "" : "s"} — your most recent bank
          questions with every recorded attempt.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>
          <RefreshCw className="size-4" aria-hidden />
          Refresh
        </Button>
      </div>

      {questions.map((question) => (
        <article key={question.id} className="glass-card space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm leading-6 font-medium">{question.stem}</p>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABELS[question.type] ?? question.type}
                </Badge>
                {question.topicTitle ? <span>{question.topicTitle}</span> : null}
                <span>
                  · {question.attemptCount} attempt{question.attemptCount === 1 ? "" : "s"}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {question.answersHidden ? (
                <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                  <Lock className="size-3" aria-hidden />
                  {question.answersReleaseAt
                    ? `Answers open ${formatWhen(question.answersReleaseAt)}`
                    : "Answers hidden"}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                  <Eye className="size-3" aria-hidden />
                  Answers visible
                </Badge>
              )}
              <div className="flex gap-1">
                {question.answersHidden ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === question.id}
                    onClick={() =>
                      void act(
                        { action: "release", questionId: question.id },
                        question.id,
                        "Answers released — students can reveal them now",
                      )
                    }
                    className="focus-ring"
                  >
                    <Eye className="size-3.5" aria-hidden />
                    Release now
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === question.id}
                    onClick={() =>
                      void act(
                        { action: "hide", questionId: question.id },
                        question.id,
                        "Answers hidden until you release them",
                      )
                    }
                    className="focus-ring"
                  >
                    <EyeOff className="size-3.5" aria-hidden />
                    Hide answers
                  </Button>
                )}
              </div>
            </div>
          </div>

          {question.answersHidden ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
              <div className="space-y-1">
                <Label htmlFor={`release-${question.id}`} className="text-xs">
                  Schedule release
                </Label>
                <Input
                  id={`release-${question.id}`}
                  type="datetime-local"
                  className="h-8 w-56 text-xs"
                  value={releaseAt[question.id] ?? ""}
                  onChange={(event) =>
                    setReleaseAt((prev) => ({ ...prev, [question.id]: event.target.value }))
                  }
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyId === question.id || !releaseAt[question.id]}
                onClick={() =>
                  void act(
                    {
                      action: "schedule",
                      questionId: question.id,
                      releaseAt: new Date(releaseAt[question.id]).toISOString(),
                    },
                    question.id,
                    "Release scheduled",
                  )
                }
                className="focus-ring"
              >
                <CalendarClock className="size-3.5" aria-hidden />
                Schedule
              </Button>
            </div>
          ) : null}

          {question.attempts.length > 0 ? (
            <ul className="divide-border/60 border-border/60 divide-y border-t">
              {question.attempts.map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{attempt.student}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    picked: {attempt.selected || "—"}
                  </span>
                  {attempt.autoCorrect !== null ? (
                    <Badge
                      variant="outline"
                      className={
                        attempt.autoCorrect
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-rose-500/40 text-rose-600 dark:text-rose-400"
                      }
                    >
                      {attempt.autoCorrect ? "auto: correct" : "auto: incorrect"}
                    </Badge>
                  ) : null}
                  {attempt.markedResult ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3" aria-hidden />
                      marked {attempt.markedResult}
                    </Badge>
                  ) : null}
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="focus-ring size-7 text-emerald-600 dark:text-emerald-400"
                      aria-label={`Mark ${attempt.student} correct`}
                      disabled={busyId === attempt.id}
                      onClick={() => void mark(attempt.id, "correct")}
                    >
                      {busyId === attempt.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-3.5" aria-hidden />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="focus-ring text-rose-600 size-7 dark:text-rose-400"
                      aria-label={`Mark ${attempt.student} incorrect`}
                      disabled={busyId === attempt.id}
                      onClick={() => void mark(attempt.id, "incorrect")}
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                    {attempt.markedResult ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="focus-ring size-7"
                        aria-label={`Clear mark for ${attempt.student}`}
                        disabled={busyId === attempt.id}
                        onClick={() => void mark(attempt.id, "clear")}
                      >
                        <RefreshCw className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground/70 w-full text-[11px]">
                    {formatWhen(attempt.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground border-border/60 border-t pt-3 text-xs">
              No attempts recorded for this question yet.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
