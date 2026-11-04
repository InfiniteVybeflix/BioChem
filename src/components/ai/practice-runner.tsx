"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { NovaMark } from "@/components/ai/nova-mark";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Markdown } from "@/components/markdown/markdown";
import { cn } from "@/lib/utils";

/**
 * AI Practice — the student asks for a set of MCQs on any topic; the
 * AI generates them, the student answers, and the answers travel back
 * WITH the questions to the AI, which marks them and returns
 * per-question remarks, what to note, and a coaching summary.
 */

interface PracticeQuestion {
  stem: string;
  options: { key: string; text: string }[];
  answerKey: string;
  marks: number;
  explanation: string;
}

interface MarkResult {
  index: number;
  correct: boolean;
  selected: string | null;
  correctAnswer: string;
  remark: string;
  note: string;
}

export function PracticeRunner({
  topics,
}: {
  topics: { id: string; title: string; zone: string }[];
}) {
  const [topicId, setTopicId] = useState(topics[0]?.id ?? "");
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "all">("all");
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<MarkResult[] | null>(null);
  const [overall, setOverall] = useState<string>("");
  const [busy, setBusy] = useState<"generate" | "mark" | null>(null);

  const answered = Object.keys(answers).length;
  const score = useMemo(
    () => (results ? results.filter((result) => result.correct).length : 0),
    [results],
  );

  const generate = async () => {
    if (!topicId) return;
    setBusy("generate");
    setResults(null);
    setAnswers({});
    try {
      const response = await fetch("/api/ai/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", topicId, count, difficulty }),
      });
      const data: { questions?: PracticeQuestion[]; error?: string } = await response.json();
      if (!response.ok || !data.questions) {
        toast.error(data.error ?? "Couldn't generate the questions");
        return;
      }
      setQuestions(data.questions);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(null);
    }
  };

  const mark = async () => {
    if (!questions || answered < questions.length) {
      toast.info("Answer every question first — your best guess counts");
      return;
    }
    setBusy("mark");
    try {
      const response = await fetch("/api/ai/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark",
          questions: questions.map((question) => ({
            stem: question.stem,
            options: question.options,
            answerKey: question.answerKey,
            marks: question.marks,
          })),
          answers: Object.fromEntries(Object.entries(answers).map(([index, key]) => [index, key])),
        }),
      });
      const data: {
        results?: MarkResult[];
        overall?: string;
        error?: string;
      } = await response.json();
      if (!response.ok || !data.results) {
        toast.error(data.error ?? "Marking failed — try again");
        return;
      }
      setResults(data.results);
      setOverall(data.overall ?? "");
      toast.success(`Marked: ${data.results.filter((r) => r.correct).length}/${questions.length}`);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(null);
    }
  };

  // ---------------- setup screen ----------------
  if (!questions) {
    return (
      <div className="glass-card mx-auto max-w-xl space-y-5 p-6">
        <div className="text-center">
          <span className="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-2xl">
            <NovaMark className="size-6" />
          </span>
          <h2 className="font-display mt-3 text-lg font-semibold">AI Practice</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Fresh multiple-choice questions on any topic — generated, marked and coached by the AI.
          </p>
        </div>

        {topics.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">
            No topics yet — check back once your lecturers publish the syllabus.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="practice-topic" className="text-sm font-medium">
                Topic
              </label>
              <select
                id="practice-topic"
                className="border-input bg-background focus-ring w-full rounded-lg border px-3 py-2 text-sm"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
              >
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} ({topic.zone.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="practice-count" className="text-sm font-medium">
                  Questions
                </label>
                <select
                  id="practice-count"
                  className="border-input bg-background focus-ring w-full rounded-lg border px-3 py-2 text-sm"
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  {[5, 8, 10, 15].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="practice-difficulty" className="text-sm font-medium">
                  Difficulty
                </label>
                <select
                  id="practice-difficulty"
                  className="border-input bg-background focus-ring w-full rounded-lg border px-3 py-2 text-sm"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
                >
                  <option value="all">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            <Button
              className="w-full gap-2"
              disabled={busy !== null}
              onClick={() => void generate()}
            >
              {busy === "generate" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {busy === "generate" ? "Generating…" : "Generate questions"}
            </Button>
          </>
        )}
      </div>
    );
  }

  // ---------------- results summary ----------------
  const resultCard = results ? (
    <div className="glass-card space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold">
          <Target className="text-primary size-5" aria-hidden />
          {score}/{questions.length} correct
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setQuestions(null);
            setResults(null);
          }}
        >
          <RotateCcw className="size-4" aria-hidden /> New set
        </Button>
      </div>
      <Progress
        value={(score / questions.length) * 100}
        aria-label={`${score} of ${questions.length}`}
      />
      {overall ? <p className="text-muted-foreground text-sm leading-relaxed">{overall}</p> : null}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {!results ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {answered}/{questions.length} answered
          </p>
          <Button className="gap-2" disabled={busy !== null} onClick={() => void mark()}>
            {busy === "mark" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
            {busy === "mark" ? "Marking…" : "Submit for AI marking"}
          </Button>
        </div>
      ) : null}

      {resultCard}

      <ol className="space-y-4">
        {questions.map((question, index) => {
          const result = results?.find((entry) => entry.index === index);
          const selected = answers[index];
          return (
            <li key={index} className="glass-card space-y-3 p-4 sm:p-5">
              <div className="flex items-start gap-2">
                <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Markdown>{question.stem}</Markdown>
                </div>
                {result ? (
                  result.correct ? (
                    <CheckCircle2
                      className="size-5 shrink-0 text-emerald-500"
                      aria-label="Correct"
                    />
                  ) : (
                    <XCircle className="text-destructive size-5 shrink-0" aria-label="Incorrect" />
                  )
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const isSelected = selected === option.key;
                  const isCorrect = result && option.key === result.correctAnswer;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={results !== null}
                      aria-pressed={isSelected}
                      onClick={() => setAnswers((prev) => ({ ...prev, [index]: option.key }))}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition-all",
                        isCorrect
                          ? "border-emerald-500/50 bg-emerald-500/10"
                          : isSelected && result
                            ? "border-destructive/50 bg-destructive/10"
                            : isSelected
                              ? "border-primary bg-primary/10"
                              : "hover:border-primary/40 border-border bg-muted/20",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                          isSelected || isCorrect
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {option.key}
                      </span>
                      <span className="leading-snug">{option.text}</span>
                    </button>
                  );
                })}
              </div>

              {result && !result.correct ? (
                <p className="text-muted-foreground text-xs">
                  Correct answer: <strong>{result.correctAnswer}</strong>
                  {result.selected ? ` · you picked ${result.selected}` : " · you didn't answer"}
                </p>
              ) : null}

              {result && (result.remark || result.note) ? (
                <div className="bg-muted/40 space-y-1 rounded-xl p-3">
                  {result.remark ? (
                    <p className="text-sm leading-relaxed">{result.remark}</p>
                  ) : null}
                  {result.note ? (
                    <p className="text-muted-foreground text-sm">
                      <strong className="text-foreground">Note:</strong> {result.note}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {results ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setQuestions(null);
              setResults(null);
            }}
          >
            <RotateCcw className="size-4" aria-hidden /> Generate another set
          </Button>
        </div>
      ) : null}
    </div>
  );
}
