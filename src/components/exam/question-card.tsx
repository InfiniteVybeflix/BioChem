"use client";

import { useState } from "react";
import { Check, Database, Eye, EyeOff, Sparkles, Users, X } from "lucide-react";
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
  answerKey: string;
  explanationMd: string;
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

/**
 * One question with its stem (markdown + LaTeX), MCQ options as radio-style
 * rows, and a reveal button that exposes the correct option, model answer and
 * explanation. Guests can read and reveal, but not select.
 */
export function QuestionCard({ question }: { question: QuestionData }) {
  const { userId } = useUser();
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (key: string) => {
    if (!userId) {
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
    if (revealed) return; // locking selection once the answer is out
    setSelected(key);
  };

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
            const isCorrect = revealed && option.key === question.answerKey;
            const isWrongPick = revealed && isSelected && !isCorrect;
            return (
              <li key={option.key}>
                <button
                  type="button"
                  onClick={() => handleSelect(option.key)}
                  aria-pressed={isSelected}
                  className={cn(
                    "focus-ring flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                    isSelected && !revealed
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/70 bg-card/50 hover:border-primary/30",
                    isCorrect && "border-emerald-500/60 bg-emerald-500/10",
                    isWrongPick && "border-rose-500/60 bg-rose-500/10",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                      isSelected &&
                        !revealed &&
                        "border-primary bg-primary text-primary-foreground",
                      isCorrect && "border-emerald-500 bg-emerald-500 text-white",
                      isWrongPick && "border-rose-500 bg-rose-500 text-white",
                      !isSelected &&
                        !isCorrect &&
                        !isWrongPick &&
                        "border-border text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {option.key}
                  </span>
                  <span className="flex-1 leading-6">{option.text}</span>
                  {isCorrect ? (
                    <Check
                      className="mt-1 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-label="Correct answer"
                    />
                  ) : null}
                  {isWrongPick ? (
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant={revealed ? "ghost" : "outline"}
          size="sm"
          onClick={() => setRevealed((value) => !value)}
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
              Reveal answer & explanation
            </>
          )}
        </Button>
        <SourceBadge source={question.source} />
      </div>

      {revealed ? (
        <div className="border-border/70 bg-muted/40 mt-4 space-y-4 rounded-lg border p-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
              <Check className="size-3.5" aria-hidden />
              Answer: <span className="font-mono">{question.answerKey}</span>
            </p>
          </div>
          {question.explanationMd ? (
            <div>
              <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Explanation
              </p>
              <Markdown className="text-sm">{question.explanationMd}</Markdown>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
