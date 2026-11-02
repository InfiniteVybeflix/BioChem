"use client";

import { useState } from "react";
import { Check, Database, Eye, EyeOff, Lock, Sparkles, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/markdown";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Difficulty, QuestionOption, QuestionType } from "@/types/domain";

export interface QuestionData {
  id: string;
  zone: string;
  difficulty: Difficulty;
  type: QuestionType;
  stemMd: string;
  options: QuestionOption[];
  /** The answer never rides along with the question — it is fetched on reveal. */
  answersHidden: boolean;
  answersReleaseAt: string | null;
  marks: number;
  source: string;
  topicTitle: string | null;
}

const DIFFICULTY_STYLES: Record<Difficulty, string> = {
  easy: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  medium: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400",
  hard: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "MCQ",
  short_answer: "Short answer",
  long_answer: "Long answer",
  structured: "Structured",
};

function SourceBadge({ source }: { source: string }) {
  if (source === "ai") {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Sparkles className="size-3" aria-hidden />
        AI generated
      </Badge>
    );
  }
  if (source === "community") {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Users className="size-3" aria-hidden />
        Community
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      <Database className="size-3" aria-hidden />
      Question bank
    </Badge>
  );
}

function formatRelease(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RevealPayload {
  locked: boolean;
  releaseAt?: string | null;
  answerKey?: string;
  explanationMd?: string;
}

/**
 * One question with its stem (markdown + LaTeX) and MCQ options as
 * radio-style rows. Answers are NOT in the page payload — picking an
 * option records the attempt and the server replies with right/wrong
 * instantly; "Reveal" fetches the full answer + explanation, unless the
 * lecturer has hidden the answers (optionally until a release moment).
 */
export function QuestionCard({ question }: { question: QuestionData }) {
  const { userId, supabase } = useUser();
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [locked, setLocked] = useState<{ releaseAt: string | null } | null>(null);
  const [answer, setAnswer] = useState<{ answerKey: string; explanationMd: string } | null>(null);
  const [revealPending, setRevealPending] = useState(false);

  const handleSelect = async (key: string) => {
    if (revealed) return; // locking selection once the answer is out
    setSelected(key);
    if (!userId || !supabase) {
      // Guests pick locally — sign in is required to record the attempt.
      toast.error("Sign in to record your answers", {
        action: {
          label: "Sign in",
          onClick: () => {
            window.location.assign("/login");
          },
        },
      });
      return;
    }
    try {
      const response = await fetch(`/api/questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attempt", selected: key }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Could not record the attempt";
        toast.error(message);
        return;
      }
      const data = payload as { recorded?: boolean; correct?: boolean | null };
      setAttempted(true);
      if (typeof data.correct === "boolean") setCorrect(data.correct);
    } catch {
      toast.error("Network error — your answer wasn't recorded");
    }
  };

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (answer) {
      setRevealed(true);
      return;
    }
    setRevealPending(true);
    try {
      const response = await fetch(`/api/questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal" }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Could not load the answer";
        toast.error(message);
        return;
      }
      const data = payload as RevealPayload;
      if (data.locked) {
        setLocked({ releaseAt: data.releaseAt ?? null });
        setRevealed(true); // renders the locked notice
        return;
      }
      const next = {
        answerKey: data.answerKey ?? "",
        explanationMd: data.explanationMd ?? "",
      };
      setAnswer(next);
      setLocked(null);
      setRevealed(true);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setRevealPending(false);
    }
  };

  const releaseLabel = formatRelease(locked?.releaseAt ?? null);
  const isWrongPick = revealed && correct === false;
  const correctKey = answer?.answerKey ?? null;

  return (
    <article className="glass-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("border", DIFFICULTY_STYLES[question.difficulty])}>
          {question.difficulty}
        </Badge>
        <Badge variant="secondary">{TYPE_LABELS[question.type]}</Badge>
        {question.topicTitle ? <Badge variant="outline">{question.topicTitle}</Badge> : null}
        <span className="text-muted-foreground ml-auto text-xs font-medium">
          <span className="tabular-nums">{question.marks}</span> mark
          {question.marks === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4">
        <Markdown className="text-sm">{question.stemMd}</Markdown>
      </div>

      {question.type === "mcq" && question.options.length > 0 ? (
        <ul className="mt-4 space-y-2" aria-label="Answer options">
          {question.options.map((option) => {
            const isSelected = selected === option.key;
            const isAnswerKey = revealed && correctKey !== null && option.key === correctKey;
            const showWrong = (isWrongPick && isSelected) || (isAnswerKey && isSelected && correct === false);
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => void handleSelect(option.key)}
                  aria-pressed={isSelected}
                  className={cn(
                    "focus-ring flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                    isSelected && !revealed
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/70 bg-card/50 hover:border-primary/30",
                    isAnswerKey && "border-emerald-500/60 bg-emerald-500/10",
                    showWrong && "border-rose-500/60 bg-rose-500/10",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                      isSelected &&
                        !revealed &&
                        "border-primary bg-primary text-primary-foreground",
                      isAnswerKey && "border-emerald-500 bg-emerald-500 text-white",
                      showWrong && "border-rose-500 bg-rose-500 text-white",
                      !isSelected &&
                        !isAnswerKey &&
                        !showWrong &&
                        "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {option.key}
                  </span>
                  <span className="flex-1 leading-6">{option.text}</span>
                  {isAnswerKey ? (
                    <Check
                      className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-label="Correct answer"
                    />
                  ) : null}
                  {showWrong ? (
                    <X
                      className="mt-1 size-4 shrink-0 text-rose-600 dark:text-rose-400"
                      aria-label="Your incorrect pick"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {attempted && correct !== null ? (
        <p
          role="status"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
            correct
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
          )}
        >
          {correct ? (
            <>
              <Check className="size-4" aria-hidden /> Correct — recorded. Reveal the worked answer
              below.
            </>
          ) : (
            <>
              <X className="size-4" aria-hidden /> Not quite — attempt recorded. Try again or reveal
              the answer below.
            </>
          )}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant={revealed ? "ghost" : "outline"}
          size="sm"
          onClick={() => void handleReveal()}
          disabled={revealPending}
          className="focus-ring"
          aria-expanded={revealed}
        >
          {revealed ? (
            <>
              <EyeOff className="size-4" aria-hidden />
              Hide answer & explanation
            </>
          ) : (
            <>
              <Eye className="size-4" aria-hidden />
              {revealPending ? "Loading…" : "Reveal answer & explanation"}
            </>
          )}
        </Button>
        <SourceBadge source={question.source} />
      </div>

      {revealed && locked ? (
        <div className="border-amber-500/40 bg-amber-500/10 mt-4 flex items-start gap-3 rounded-lg border p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Answers are hidden by your lecturer
            </p>
            <p className="text-muted-foreground mt-1">
              {releaseLabel
                ? `They open on ${releaseLabel}. Attempt the question now — your answer is recorded and marked the moment it opens.`
                : "Your lecturer will release them — attempt the question now, your answer is recorded."}
            </p>
          </div>
        </div>
      ) : null}

      {revealed && answer ? (
        <div className="border-border/70 bg-muted/40 mt-4 space-y-4 rounded-lg border p-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden />
              Answer: <span className="font-mono">{answer.answerKey}</span>
            </p>
          </div>
          {answer.explanationMd ? (
            <div>
              <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Explanation
              </p>
              <Markdown className="text-sm">{answer.explanationMd}</Markdown>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
