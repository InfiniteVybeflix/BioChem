"use client";

import { useState, type FormEvent } from "react";
import {
  AlarmClock,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Loader2,
  Repeat,
  School,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_COLORS, DAY_NAMES } from "@/lib/constants";
import { planEventSchema } from "@/lib/validation";
import type { PlanEventType } from "@/types/domain";
import {
  END_TIME_OPTIONS,
  EVENT_COLOR_STYLES,
  START_TIME_OPTIONS,
  minutesToLabel,
  type EventColorName,
  type PlanEventRow,
} from "@/components/planner/planner-lib";
import { cn } from "@/lib/utils";

/** Form values produced by the dialog (already planEventSchema-shaped). */
export interface EventFormValues {
  title: string;
  type: PlanEventType;
  dayOfWeek: number | null;
  date: string | null;
  startTime: string;
  endTime: string;
  notes: string | null;
  color: string;
  reminderMinutes: number | null;
}

/** Maps dialog values to the snake_case plan_events column shape. */
export function eventValuesToRow(values: EventFormValues) {
  return {
    title: values.title,
    type: values.type,
    day_of_week: values.dayOfWeek,
    date: values.date,
    start_time: values.startTime,
    end_time: values.endTime,
    notes: values.notes,
    color: values.color,
    reminder_minutes: values.reminderMinutes,
  };
}

const TYPE_ICONS: Record<PlanEventType, typeof BookOpen> = {
  study: BookOpen,
  class: School,
  exam: GraduationCap,
  personal: User,
  deadline: AlarmClock,
};

const TYPE_LABELS: Record<PlanEventType, string> = {
  study: "Study session",
  class: "Class / lecture",
  exam: "Exam",
  personal: "Personal",
  deadline: "Deadline",
};

const REMINDER_OPTIONS = [
  { value: "none", label: "No reminder" },
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
] as const;

export interface EventDialogPrefill {
  dayOfWeek?: number;
  date?: string;
  type?: PlanEventType;
  startTime?: string;
  endTime?: string;
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  target: PlanEventRow | null;
  prefill: EventDialogPrefill;
  lockType: PlanEventType | null;
  onCreate: (values: EventFormValues) => Promise<boolean>;
  onUpdate: (id: string, values: EventFormValues) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function EventDialog({
  open,
  onOpenChange,
  mode,
  target,
  prefill,
  lockType,
  onCreate,
  onUpdate,
  onDelete,
}: EventDialogProps) {
  const isEdit = mode === "edit" && target !== null;

  const [title, setTitle] = useState(() => target?.title ?? "");
  const [type, setType] = useState<PlanEventType>(
    () => lockType ?? target?.type ?? prefill.type ?? "study",
  );
  const [recurring, setRecurring] = useState(() =>
    target
      ? target.day_of_week !== null
      : prefill.dayOfWeek !== undefined && prefill.date === undefined,
  );
  const [dayOfWeek, setDayOfWeek] = useState<number>(
    () => target?.day_of_week ?? prefill.dayOfWeek ?? new Date().getDay(),
  );
  const [date, setDate] = useState<string>(() => target?.date ?? prefill.date ?? "");
  const [startTime, setStartTime] = useState(
    () => target?.start_time?.slice(0, 5) ?? prefill.startTime ?? "18:00",
  );
  const [endTime, setEndTime] = useState(
    () => target?.end_time?.slice(0, 5) ?? prefill.endTime ?? "19:00",
  );
  const [notes, setNotes] = useState(() => target?.notes ?? "");
  const [color, setColor] = useState<string>(() => target?.color ?? "teal");
  const [reminder, setReminder] = useState<string>(() =>
    target?.reminder_minutes != null ? String(target.reminder_minutes) : "none",
  );
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = planEventSchema.safeParse({
      title,
      type,
      dayOfWeek: recurring ? dayOfWeek : null,
      date: recurring ? null : date || null,
      startTime,
      endTime,
      notes: notes.trim() ? notes.trim() : null,
      color,
      reminderMinutes: reminder === "none" ? null : Number(reminder),
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the event details");
      return;
    }
    if (!recurring && !date) {
      toast.error("Pick the date for this one-off event");
      return;
    }
    if (endTime <= startTime) {
      toast.error("The end time has to be after the start time");
      return;
    }

    setPending(true);
    const values: EventFormValues = {
      title: parsed.data.title,
      type: parsed.data.type,
      dayOfWeek: parsed.data.dayOfWeek,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      notes: parsed.data.notes ?? null,
      color: parsed.data.color,
      reminderMinutes: parsed.data.reminderMinutes ?? null,
    };
    const ok = isEdit ? await onUpdate(target.id, values) : await onCreate(values);
    setPending(false);
    if (ok) onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const ok = await onDelete(target.id);
    setDeleting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scrollbar-slim max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the details — changes save straight to your planner."
                : "Block time for study, classes and deadlines. It saves straight to your planner."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={2}
              maxLength={160}
              placeholder="e.g. Glycolysis revision"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-type">Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as PlanEventType)}
                disabled={lockType !== null}
              >
                <SelectTrigger id="event-type" className="w-full" aria-label="Event type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as PlanEventType[]).map((option) => {
                    const Icon = TYPE_ICONS[option];
                    return (
                      <SelectItem key={option} value={option}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="size-4" aria-hidden />
                          {TYPE_LABELS[option]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event-reminder">Reminder</Label>
              <Select value={reminder} onValueChange={setReminder}>
                <SelectTrigger id="event-reminder" className="w-full" aria-label="Reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="border-border/60 space-y-3 rounded-lg border p-3">
            <legend className="text-muted-foreground px-1 text-xs font-medium">When</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={recurring ? "default" : "outline"}
                size="sm"
                onClick={() => setRecurring(true)}
                aria-pressed={recurring}
                className="focus-ring gap-1.5"
              >
                <Repeat className="size-3.5" aria-hidden />
                Repeats weekly
              </Button>
              <Button
                type="button"
                variant={!recurring ? "default" : "outline"}
                size="sm"
                onClick={() => setRecurring(false)}
                aria-pressed={!recurring}
                className="focus-ring gap-1.5"
              >
                <CalendarDays className="size-3.5" aria-hidden />
                One-off date
              </Button>
            </div>

            {recurring ? (
              <div className="space-y-2">
                <Label htmlFor="event-day">Day of week</Label>
                <Select
                  value={String(dayOfWeek)}
                  onValueChange={(value) => setDayOfWeek(Number(value))}
                >
                  <SelectTrigger id="event-day" className="w-full" aria-label="Day of week">
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
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="event-date">Date</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required={!recurring}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Starts</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger id="event-start" className="w-full" aria-label="Start time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {START_TIME_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {minutesToLabel(
                          Number(option.slice(0, 2)) * 60 + Number(option.slice(3, 5)),
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">Ends</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger id="event-end" className="w-full" aria-label="End time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {END_TIME_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "24:00"
                          ? "Midnight"
                          : minutesToLabel(
                              Number(option.slice(0, 2)) * 60 + Number(option.slice(3, 5)),
                            )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="event-notes">Notes (optional)</Label>
            <Textarea
              id="event-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Focus on rate-limiting enzymes, past CAT 2 questions"
            />
          </div>

          <div className="space-y-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Event colour">
              {EVENT_COLORS.map((option: EventColorName) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setColor(option)}
                  aria-label={`Colour: ${option}`}
                  aria-pressed={color === option}
                  className={cn(
                    "focus-ring size-8 rounded-lg border-2 transition-all",
                    EVENT_COLOR_STYLES[option].swatch,
                    color === option
                      ? "ring-ring ring-offset-background scale-110 ring-2 ring-offset-2"
                      : "opacity-70 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="mr-auto gap-2"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Delete
              </Button>
            ) : null}
            <Button type="submit" disabled={pending} className="gap-2">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
