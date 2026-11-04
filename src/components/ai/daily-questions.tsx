"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarCheck,
  CheckCircle2,
  Flame,
  Loader2,
  Settings2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Markdown } from "@/components/markdown/markdown";
import { SetupNotice } from "@/components/common/setup-notice";
import { EmptyState } from "@/components/common/ui-bits";
import { cn } from "@/lib/utils";
import type { DailyQuestionPayload, Difficulty } from "@/types/domain";

/**
 * Question of the Day: today's AI-generated MCQs with instant grading,
 * streak tracking, delivery settings and a 7-day history strip.
 */

export interface DailyQuestionItem {
  id: string;
  for_date: string;
  topicTitle: string | null;
  difficulty: Difficulty;
  payload: DailyQuestionPayload;
  selected_answer: string | null;
  is_correct: boolean | null;
  answered_at: string | null;
}

export interface DailyTopicOption {
  id: string;
  title: string;
  zone: string;
}

export interface DailyHistoryDay {
  date: string;
  label: string;
  answered: number;
  correct: number;
}

export interface DailySettingsView {
  topicIds: string[];
  difficulty: Difficulty;
  count: number;
  deliveryTime: string;
  timezone: string;
  enabled: boolean;
}

interface DailyQuestionsProps {
  today: string;
  initialQuestions: DailyQuestionItem[];
  topics: DailyTopicOption[];
  historyDays: DailyHistoryDay[];
  streak: number;
  settings: DailySettingsView;
  flagOn: boolean;
  gatewayReady: boolean;
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function DailyQuestions({
  today,
  initialQuestions,
  topics,
  historyDays,
  streak,
  settings,
  flagOn,
  gatewayReady,
}: DailyQuestionsProps) {
  const [questions, setQuestions] = useState<DailyQuestionItem[]>(initialQuestions);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<DailySettingsView>(settings);
  const [saving, setSaving] = useState(false);

  const answeredCount = questions.filter((question) => question.answered_at !== null).length;

  // Render in the server's stable order. Never re-sort after an answer:
  // moving the just-answered question to the end made the fresh answer
  // appear on "the last question" and renumbered everything mid-session.

  const prettyDate = useMemo(() => {
    try {
      return format(new Date(`${today}T12:00:00`), "EEEE d MMMM yyyy");
    } catch {
      return today;
    }
  }, [today]);

  const submitAnswer = async (question: DailyQuestionItem, selected: string) => {
    if (question.answered_at || answeringId) return;
    setAnsweringId(question.id);
    try {
      const response = await fetch("/api/ai/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, selected }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        isCorrect?: boolean;
        answer?: string;
        alreadyAnswered?: boolean;
        error?: string;
      };
      if (!response.ok) {
        toast.error(data.error ?? "Could not record your answer — please try again.");
        return;
      }
      setQuestions((prev) =>
        prev.map((row) =>
          row.id === question.id
            ? {
                ...row,
                selected_answer: selected,
                is_correct: data.isCorrect === true,
                answered_at: new Date().toISOString(),
              }
            : row,
        ),
      );
      if (data.isCorrect === true) {
        toast.success("Correct! +1 XP");
      } else if (data.alreadyAnswered !== true) {
        toast.info("Not quite — read the explanation below.");
      }
    } catch {
      toast.error("Could not record your answer — please try again.");
    } finally {
      setAnsweringId(null);
    }
  };

  const generateNow = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/ai/daily", { method: "GET" });
      const data = (await response.json().catch(() => ({}))) as {
        questions?: DailyQuestionItem[];
        error?: string;
        retryAfterMinutes?: number;
      };
      if (!response.ok) {
        toast.error(
          `${data.error ?? "Could not generate today's questions."}${
            response.status === 429 && data.retryAfterMinutes
              ? ` Try again in ${data.retryAfterMinutes} minutes.`
              : ""
          }`,
        );
        return;
      }
      setQuestions(
        (data.questions ?? []).map((row) => ({
          ...row,
          topicTitle: row.topicTitle ?? null,
        })),
      );
      if ((data.questions ?? []).length > 0) {
        toast.success("Today's questions are ready — good luck!");
      } else {
        toast.info("No questions were generated — check your settings and try again.");
      }
    } catch {
      toast.error("Could not generate today's questions — please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const openSettings = () => {
    setDraft(settings);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!validTimezone(draft.timezone)) {
      toast.error("That timezone is not recognised — e.g. Africa/Nairobi.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/ai/daily", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicIds: draft.topicIds,
          difficulty: draft.difficulty,
          count: draft.count,
          deliveryTime: draft.deliveryTime,
          timezone: draft.timezone,
          enabled: draft.enabled,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        toast.error(data.error ?? "Could not save your settings.");
        return;
      }
      toast.success("Settings saved");
      setSettingsOpen(false);
    } catch {
      toast.error("Could not save your settings — please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!flagOn) {
    return (
      <Alert>
        <Sparkles className="size-4" aria-hidden />
        <AlertTitle>Question of the Day is temporarily disabled</AlertTitle>
        <AlertDescription>
          The daily questions feature has been switched off by the administrator. Please check back
          later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats + settings header */}
      <section className="glass-card p-4 sm:p-5" aria-label="Daily progress">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarCheck className="text-muted-foreground size-4" aria-hidden />
              {prettyDate}
            </p>
            <p
              className="flex items-center gap-1.5 text-sm font-medium"
              title="Consecutive days with at least one answered question"
            >
              <Flame
                className={cn("size-4", streak > 0 ? "text-amber-500" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="tabular-nums">{streak}</span>
              <span className="text-muted-foreground">day streak</span>
            </p>
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-semibold tabular-nums">
                {answeredCount}/{questions.length}
              </span>{" "}
              answered
            </p>
          </div>
          <Button variant="outline" size="sm" className="focus-ring gap-1.5" onClick={openSettings}>
            <Settings2 className="size-4" aria-hidden />
            Settings
          </Button>
        </div>
        <Progress
          value={questions.length > 0 ? (answeredCount / questions.length) * 100 : 0}
          className="mt-3 h-1.5"
          aria-label="Questions answered today"
        />
      </section>

      {/* Today's questions */}
      {questions.length === 0 ? (
        gatewayReady ? (
          <EmptyState
            icon={<Sparkles className="size-6" aria-hidden />}
            title="No questions for today yet"
            description="Generate today's set now, or fine-tune your topics and difficulty in Settings."
            action={
              <Button
                onClick={() => void generateNow()}
                disabled={generating}
                className="focus-ring gap-2"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                Generate now
              </Button>
            }
          />
        ) : (
          <SetupNotice missing="gateway" />
        )
      ) : (
        <ul className="space-y-4">
          {questions.map((question, index) => {
            const answered = question.answered_at !== null;
            const options = question.payload.options ?? [];
            const correctKey = question.payload.answer;
            return (
              <li key={question.id} className="glass-card p-4 sm:p-6">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-bold tabular-nums">
                      {index + 1}
                    </span>
                    <Badge variant="secondary" className="capitalize">
                      {question.difficulty}
                    </Badge>
                    {question.topicTitle ? (
                      <Badge variant="outline">{question.topicTitle}</Badge>
                    ) : null}
                  </div>
                  {answered ? (
                    question.is_correct ? (
                      <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Correct
                      </Badge>
                    ) : (
                      <Badge className="gap-1 border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300">
                        <XCircle className="size-3.5" aria-hidden /> Incorrect
                      </Badge>
                    )
                  ) : null}
                </div>

                <Markdown>{question.payload.stem}</Markdown>

                <div
                  className="mt-4 grid gap-2 sm:grid-cols-2"
                  role="group"
                  aria-label="Answer options"
                >
                  {options.map((option) => {
                    const isSelected = question.selected_answer === option.key;
                    const isCorrectOption = answered && option.key === correctKey;
                    const isWrongPick = answered && isSelected && option.key !== correctKey;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        disabled={answered || answeringId !== null}
                        onClick={() => void submitAnswer(question, option.key)}
                        aria-pressed={isSelected}
                        className={cn(
                          "focus-ring flex min-h-11 items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all",
                          !answered &&
                            "border-border bg-background/40 hover:border-primary/50 hover:bg-primary/5 hover:-translate-y-0.5",
                          answered &&
                            !isCorrectOption &&
                            !isWrongPick &&
                            "border-border opacity-60",
                          isCorrectOption &&
                            "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                          isWrongPick &&
                            "border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                            isCorrectOption
                              ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : isWrongPick
                                ? "border-rose-500/60 bg-rose-500/20 text-rose-700 dark:text-rose-300"
                                : "border-border bg-muted/50",
                          )}
                          aria-hidden
                        >
                          {option.key}
                        </span>
                        <span className="min-w-0 flex-1 leading-6">{option.text}</span>
                        {answeringId === question.id ? (
                          <Loader2
                            className="text-muted-foreground mt-1 size-4 shrink-0 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {answered ? (
                  <div className="border-border/70 bg-muted/30 mt-4 rounded-xl border p-4">
                    <p className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                      Explanation
                    </p>
                    <Markdown>{question.payload.explanation}</Markdown>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* 7-day history */}
      <section aria-label="Last 7 days" className="glass-card p-4 sm:p-5">
        <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
          Last 7 days
        </p>
        <ul className="flex flex-wrap gap-2">
          {historyDays.map((day) => {
            const hasData = day.answered > 0;
            return (
              <li key={day.date}>
                <div
                  className={cn(
                    "flex min-w-16 flex-col items-center rounded-xl border px-2.5 py-2 text-center",
                    hasData
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/70 text-muted-foreground/70 border-dashed",
                  )}
                >
                  <span className="text-[11px] font-medium tracking-wide uppercase">
                    {day.label}
                  </span>
                  <span className="mt-0.5 text-sm font-bold tabular-nums">
                    {hasData ? `${day.correct}/${day.answered}` : "—"}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {day.date === today ? "today" : day.date.slice(5)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Settings dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Daily question settings</DialogTitle>
            <DialogDescription>
              Choose what you get asked about and when it is delivered.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Topics</legend>
              <p className="text-muted-foreground mb-2 text-xs">
                Leave all unchecked to draw from every CAT 1 / CAT 2 / Main topic.
              </p>
              <div className="border-border/70 scrollbar-slim max-h-44 space-y-1 overflow-y-auto rounded-lg border p-2">
                {topics.length === 0 ? (
                  <p className="text-muted-foreground py-3 text-center text-sm">
                    No topics available yet.
                  </p>
                ) : (
                  topics.map((topic) => (
                    <label
                      key={topic.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors"
                    >
                      <Checkbox
                        checked={draft.topicIds.includes(topic.id)}
                        onCheckedChange={(checked) => {
                          setDraft((prev) => ({
                            ...prev,
                            topicIds:
                              checked === true
                                ? [...prev.topicIds, topic.id]
                                : prev.topicIds.filter((id) => id !== topic.id),
                          }));
                        }}
                        aria-label={`Topic ${topic.title}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{topic.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {topic.zone}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="daily-difficulty">Difficulty</Label>
                <Select
                  value={draft.difficulty}
                  onValueChange={(value) =>
                    setDraft((prev) => ({ ...prev, difficulty: value as Difficulty }))
                  }
                >
                  <SelectTrigger id="daily-difficulty" className="focus-ring mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="daily-delivery">Delivery time</Label>
                <Input
                  id="daily-delivery"
                  type="time"
                  value={draft.deliveryTime}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, deliveryTime: event.target.value }))
                  }
                  className="focus-ring mt-1.5"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="daily-count">Questions per day</Label>
                <span className="text-primary text-sm font-semibold tabular-nums">
                  {draft.count}
                </span>
              </div>
              <Slider
                id="daily-count"
                value={[draft.count]}
                min={1}
                max={20}
                step={1}
                onValueChange={(values) =>
                  setDraft((prev) => ({ ...prev, count: values[0] ?? prev.count }))
                }
                className="mt-3"
                aria-label="Questions per day"
              />
            </div>

            <div>
              <Label htmlFor="daily-timezone">Timezone</Label>
              <Input
                id="daily-timezone"
                value={draft.timezone}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, timezone: event.target.value }))
                }
                placeholder="Africa/Nairobi"
                className="focus-ring mt-1.5"
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                An IANA timezone name, e.g. Africa/Nairobi or Europe/London.
              </p>
            </div>

            <div className="border-border/70 flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="daily-enabled">Daily questions enabled</Label>
                <p className="text-muted-foreground text-xs">
                  Turn off to pause generation and delivery.
                </p>
              </div>
              <Switch
                id="daily-enabled"
                checked={draft.enabled}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            <p className="bg-muted/40 text-muted-foreground rounded-lg p-3 text-xs">
              Delivered around your chosen time by the scheduled job (README → Scheduled jobs).
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveSettings()}
              disabled={saving}
              className="focus-ring gap-2"
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
