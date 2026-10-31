"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { CalendarCheck, Loader2, Plus, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { SetupNotice } from "@/components/common/setup-notice";
import type { EventFormValues } from "@/components/planner/event-dialog";
import { DAY_NAMES, EVENT_COLORS } from "@/lib/constants";
import {
  END_TIME_OPTIONS,
  START_TIME_OPTIONS,
  dayShortName,
  eventColorStyle,
  minutesToLabel,
  timeToMinutes,
  type StudyPlanRow,
} from "@/components/planner/planner-lib";
import type { PlannedEvent } from "@/lib/ai/week-planner";
import { cn } from "@/lib/utils";

interface AiWeekPlannerProps {
  activePlans: StudyPlanRow[];
  onBulkCreate: (rows: EventFormValues[]) => Promise<number>;
  onPlanned: () => void;
}

interface FreeSlotDraft {
  id: number;
  day: string;
  start: string;
  end: string;
}

const MAX_GOALS = 11;

function formatRange(start: string, end: string): string {
  return `${minutesToLabel(timeToMinutes(start))} – ${minutesToLabel(timeToMinutes(end))}`;
}

export function AiWeekPlanner({ activePlans, onBulkCreate, onPlanned }: AiWeekPlannerProps) {
  const slotId = useRef(1);

  const [brief, setBrief] = useState("");
  const [slots, setSlots] = useState<FreeSlotDraft[]>([
    { id: 0, day: "1", start: "18:00", end: "21:00" },
  ]);
  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState("");

  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PlannedEvent[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const updateSlot = (id: number, patch: Partial<Omit<FreeSlotDraft, "id">>) => {
    setSlots((prev) => prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  };

  const addSlot = () => {
    setSlots((prev) => [...prev, { id: slotId.current++, day: "1", start: "18:00", end: "20:00" }]);
  };

  const removeSlot = (id: number) => {
    setSlots((prev) => (prev.length <= 1 ? prev : prev.filter((slot) => slot.id !== id)));
  };

  const addGoal = () => {
    const value = goalDraft.trim();
    if (!value) return;
    if (goals.length >= MAX_GOALS) {
      toast.error("That's plenty of goals for one week — remove one to add another.");
      return;
    }
    if (goals.some((goal) => goal.toLowerCase() === value.toLowerCase())) {
      toast.info("That goal is already on your list");
      setGoalDraft("");
      return;
    }
    setGoals((prev) => [...prev, value.slice(0, 200)]);
    setGoalDraft("");
  };

  const handleGoalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addGoal();
    }
  };

  const planWeek = async () => {
    const invalidSlot = slots.find((slot) => slot.start >= slot.end);
    if (invalidSlot) {
      toast.error("Each free slot needs an end time after its start time");
      return;
    }

    const goalList = [...goals];
    const trimmedBrief = brief.trim();
    if (trimmedBrief) goalList.push(`Context: ${trimmedBrief}`);
    if (goalList.length === 0) {
      toast.error("Add at least one goal so the planner knows what to schedule");
      return;
    }

    setPending(true);
    setError(null);
    setResult(null);
    setChecked([]);

    try {
      const response = await fetch("/api/ai/week-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeSlots: slots.map((slot) => ({
            day_of_week: Number(slot.day),
            start_time: slot.start,
            end_time: slot.end,
          })),
          goals: goalList,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        events?: PlannedEvent[];
        error?: string;
        retryAfterMinutes?: number;
      };

      if (!response.ok) {
        if (response.status === 503) {
          setError({ status: 503, message: data.error ?? "" });
          return;
        }
        if (response.status === 403) {
          setError({ status: 403, message: data.error ?? "" });
          return;
        }
        if (response.status === 429) {
          toast.error(
            `AI planner rate limit reached — try again in ${data.retryAfterMinutes ?? 60} minutes.`,
          );
          return;
        }
        toast.error(data.error ?? "Couldn't build a plan — please try again.");
        return;
      }

      const events = data.events ?? [];
      setResult(events);
      setChecked(events.map(() => true));
      if (events.length > 0) {
        toast.success(`Here's your suggested week — ${events.length} sessions ready to review`);
      } else {
        toast.info("The planner couldn't fit your goals into those slots — try wider free times.");
      }
    } catch {
      toast.error("Couldn't reach the planner — check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  const toggleChecked = (index: number, value: boolean) => {
    setChecked((prev) => prev.map((checked, i) => (i === index ? value : checked)));
  };

  const addToTimetable = async () => {
    if (!result) return;
    const selectedCount = checked.filter(Boolean).length;
    if (selectedCount === 0) {
      toast.error("Tick at least one session to add it to your timetable");
      return;
    }

    let colorIndex = 0;
    const rows: EventFormValues[] = result
      .filter((_, index) => checked[index])
      .map((event) => ({
        title: event.title,
        type: "study",
        dayOfWeek: event.day_of_week,
        date: null,
        startTime: event.start_time,
        endTime: event.end_time,
        notes: null,
        color: EVENT_COLORS[colorIndex++ % EVENT_COLORS.length],
        reminderMinutes: 15,
      }));

    setAdding(true);
    const inserted = await onBulkCreate(rows);
    setAdding(false);

    if (inserted > 0) {
      toast.success(`Added ${inserted} events to your timetable`);
      setResult(null);
      setChecked([]);
      onPlanned();
    }
  };

  const selectedCount = checked.filter(Boolean).length;
  const planTitles = activePlans.slice(0, 3).map((plan) => plan.title);

  return (
    <div className="space-y-4">
      {activePlans.length > 0 ? (
        <div className="glass-card flex items-start gap-3 p-4">
          <Sparkles className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Building on your active plans</p>
            <p className="text-muted-foreground truncate text-xs">
              {planTitles.join(" · ")}
              {activePlans.length > planTitles.length
                ? ` · +${activePlans.length - planTitles.length} more`
                : ""}
            </p>
          </div>
        </div>
      ) : null}

      <section aria-label="AI week planner form" className="glass-card p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="ai-brief">Tell the assistant about your week</Label>
          <Textarea
            id="ai-brief"
            rows={3}
            maxLength={1000}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="I have 3 free evenings — schedule glycolysis revision, and Sunday morning for TCA cycle practice"
          />
        </div>

        <div className="mt-5 space-y-2">
          <Label>Free slots</Label>
          <div className="space-y-2">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="border-border/60 bg-card/40 flex flex-wrap items-center gap-2 rounded-lg border p-2"
              >
                <Select
                  value={slot.day}
                  onValueChange={(value) => updateSlot(slot.id, { day: value })}
                >
                  <SelectTrigger aria-label="Weekday" className="focus-ring w-[7.75rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {DAY_NAMES[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={slot.start}
                  onValueChange={(value) => updateSlot(slot.id, { start: value })}
                >
                  <SelectTrigger
                    aria-label="Free slot start time"
                    className="focus-ring w-[6.75rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {START_TIME_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {minutesToLabel(timeToMinutes(option))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-xs">to</span>
                <Select
                  value={slot.end}
                  onValueChange={(value) => updateSlot(slot.id, { end: value })}
                >
                  <SelectTrigger aria-label="Free slot end time" className="focus-ring w-[6.75rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {END_TIME_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "24:00" ? "Midnight" : minutesToLabel(timeToMinutes(option))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSlot(slot.id)}
                  disabled={slots.length <= 1}
                  aria-label="Remove this free slot"
                  className="focus-ring ml-auto"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSlot}
            disabled={slots.length >= 6}
            className="focus-ring gap-1.5"
          >
            <Plus className="size-4" aria-hidden />
            Add another free slot
          </Button>
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="ai-goal">Goals for the week</Label>
          {goals.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="Your goals">
              {goals.map((goal) => (
                <span
                  key={goal}
                  role="listitem"
                  className="border-primary/30 bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                >
                  {goal}
                  <button
                    type="button"
                    onClick={() => setGoals((prev) => prev.filter((item) => item !== goal))}
                    aria-label={`Remove goal: ${goal}`}
                    className="hover:bg-primary/20 focus-ring rounded-full p-0.5 transition-colors"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <Input
            id="ai-goal"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
            onKeyDown={handleGoalKeyDown}
            maxLength={200}
            placeholder="e.g. Finish TCA cycle past-paper questions — press Enter to add"
            aria-describedby="ai-goal-hint"
          />
          <p id="ai-goal-hint" className="text-muted-foreground text-xs">
            Type a goal and press Enter. {goals.length}/{MAX_GOALS} added.
          </p>
        </div>

        <Button
          type="button"
          onClick={planWeek}
          disabled={pending}
          className="focus-ring mt-6 w-full gap-2 sm:w-auto"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="size-4" aria-hidden />
          )}
          {pending ? "Planning your week…" : "Plan my week"}
        </Button>
      </section>

      {pending ? (
        <section aria-label="Generating your plan" className="glass-card space-y-3 p-4 sm:p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </section>
      ) : null}

      {!pending && error?.status === 503 ? <SetupNotice missing="gateway" /> : null}

      {!pending && error?.status === 403 ? (
        <Alert>
          <Sparkles className="size-4" aria-hidden />
          <AlertTitle>AI planner is currently disabled</AlertTitle>
          <AlertDescription>
            {error.message || "An administrator has turned this feature off — check back soon."}
          </AlertDescription>
        </Alert>
      ) : null}

      {!pending && result && result.length > 0 ? (
        <section aria-label="Suggested week" className="glass-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading inline-flex items-center gap-2 text-base font-semibold">
              <CalendarCheck className="text-primary size-4" aria-hidden />
              Your suggested week
            </h2>
            <Button
              type="button"
              onClick={addToTimetable}
              disabled={adding || selectedCount === 0}
              className="focus-ring gap-2"
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {adding
                ? "Adding…"
                : `Add ${selectedCount} event${selectedCount === 1 ? "" : "s"} to timetable`}
            </Button>
          </div>

          <ul className="divide-border/60 mt-3 divide-y">
            {result.map((event, index) => (
              <li
                key={`${event.day_of_week}-${event.start_time}-${index}`}
                className="flex items-center gap-3 py-2.5"
              >
                <Checkbox
                  checked={checked[index] ?? false}
                  onCheckedChange={(value) => toggleChecked(index, value === true)}
                  aria-label={`Include "${event.title}" in my timetable`}
                  className="focus-ring"
                />
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    eventColorStyle(EVENT_COLORS[index % EVENT_COLORS.length]).dot,
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{event.title}</span>
                  <span className="text-muted-foreground block text-xs">
                    {dayShortName(event.day_of_week)} ·{" "}
                    {formatRange(event.start_time, event.end_time)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground mt-3 text-xs">
            Untick anything you don't want, then add the rest — they land in your timetable as
            weekly study sessions with a 15-minute reminder.
          </p>
        </section>
      ) : null}

      {!pending && result && result.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No plan generated — try describing your goals more concretely or widening your free slots.
        </p>
      ) : null}
    </div>
  );
}
