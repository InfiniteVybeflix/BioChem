"use client";

import { useMemo } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  History,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/ui-bits";
import { useCountdown } from "@/hooks/use-countdown";
import {
  minutesToLabel,
  timeToMinutes,
  toDateKey,
  type PlanEventRow,
} from "@/components/planner/planner-lib";
import { cn } from "@/lib/utils";

interface ExamCountdownsProps {
  events: PlanEventRow[];
  onAddExam: () => void;
  onEdit: (event: PlanEventRow) => void;
}

/** Exams always carry a one-off date. */
type ExamEvent = PlanEventRow & { date: string };

function examTargetDate(exam: ExamEvent): Date {
  return new Date(`${exam.date}T${exam.start_time.slice(0, 5)}:00`);
}

function examDateLabel(exam: ExamEvent): string {
  const date = new Date(`${exam.date}T00:00:00`);
  return `${date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })} · ${minutesToLabel(timeToMinutes(exam.start_time))}`;
}

function urgency(totalHours: number, expired: boolean): "expired" | "urgent" | "soon" | "later" {
  if (expired) return "expired";
  if (totalHours < 48) return "urgent";
  if (totalHours < 24 * 7) return "soon";
  return "later";
}

const BADGE_TONES: Record<ReturnType<typeof urgency>, string> = {
  expired: "border-border/60 bg-card/60 text-muted-foreground",
  urgent: "border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  soon: "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  later: "border-primary/40 bg-primary/10 text-primary",
};

const COUNTDOWN_TONES: Record<ReturnType<typeof urgency>, string> = {
  expired: "text-muted-foreground",
  urgent: "text-rose-600 dark:text-rose-400",
  soon: "text-amber-600 dark:text-amber-400",
  later: "text-primary",
};

function CountdownDigits({ exam }: { exam: ExamEvent }) {
  const target = useMemo(() => examTargetDate(exam), [exam]);
  const { days, hours, minutes, seconds, expired } = useCountdown(target);
  const tone = urgency(days * 24 + hours, expired);

  if (expired) {
    return (
      <p className="text-muted-foreground text-right text-xs font-semibold">
        {exam.completed ? "Done" : "Happening now"}
        <span className="mt-0.5 block text-[10px] font-normal">good luck!</span>
      </p>
    );
  }

  const parts = [
    { value: days, unit: "d" },
    { value: hours, unit: "h" },
    { value: minutes, unit: "m" },
    { value: seconds, unit: "s" },
  ];

  return (
    <p
      className={cn("font-heading flex items-baseline gap-1.5 tabular-nums", COUNTDOWN_TONES[tone])}
      aria-label={`${days} days ${hours} hours ${minutes} minutes ${seconds} seconds remaining`}
    >
      {parts.map((part) => (
        <span key={part.unit} className="inline-flex items-baseline gap-0.5">
          <span className="text-lg font-bold sm:text-xl">
            {String(part.value).padStart(2, "0")}
          </span>
          <span className="text-muted-foreground text-[10px] font-medium">{part.unit}</span>
        </span>
      ))}
    </p>
  );
}

function ExamRow({ exam, onEdit }: { exam: ExamEvent; onEdit: (event: PlanEventRow) => void }) {
  const target = useMemo(() => examTargetDate(exam), [exam]);
  const { days, hours, expired } = useCountdown(target);
  const tone = urgency(days * 24 + hours, expired);
  const startsAt = new Date(`${exam.date}T00:00:00`);

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 sm:gap-4">
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl border",
          BADGE_TONES[tone],
        )}
      >
        <span className="text-base leading-none font-bold tabular-nums">{startsAt.getDate()}</span>
        <span className="mt-0.5 text-[9px] font-semibold tracking-wide uppercase">
          {startsAt.toLocaleDateString(undefined, { month: "short" })}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(exam)}
          className="hover:text-primary focus-ring block max-w-full truncate text-left text-sm font-semibold transition-colors"
        >
          {exam.title}
        </button>
        <p className="text-muted-foreground text-xs">{examDateLabel(exam)}</p>
        {exam.notes ? (
          <p className="text-muted-foreground/80 mt-0.5 truncate text-xs">{exam.notes}</p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        {tone === "urgent" ? (
          <span className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-rose-600 uppercase dark:text-rose-400">
            <span
              className="size-1.5 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none"
              aria-hidden
            />
            Urgent
          </span>
        ) : null}
        <CountdownDigits exam={exam} />
      </div>
    </li>
  );
}

function PastExamRow({ exam, onEdit }: { exam: ExamEvent; onEdit: (event: PlanEventRow) => void }) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <CheckCircle2
        className={cn(
          "size-4 shrink-0",
          exam.completed ? "text-emerald-500" : "text-muted-foreground/60",
        )}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => onEdit(exam)}
        className={cn(
          "hover:text-primary focus-ring min-w-0 flex-1 truncate text-left text-sm transition-colors",
          exam.completed ? "text-muted-foreground line-through" : "text-foreground/80",
        )}
      >
        {exam.title}
      </button>
      <span className="text-muted-foreground shrink-0 text-xs">{examDateLabel(exam)}</span>
    </li>
  );
}

export function ExamCountdowns({ events, onAddExam, onEdit }: ExamCountdownsProps) {
  const { upcoming, past } = useMemo(() => {
    const todayKey = toDateKey(new Date());
    const exams = events.filter((event): event is ExamEvent => {
      return event.type === "exam" && event.date !== null;
    });
    return {
      upcoming: exams
        .filter((exam) => !exam.completed && exam.date >= todayKey)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)),
      past: exams
        .filter((exam) => exam.completed || exam.date < todayKey)
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [events]);

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="size-6" aria-hidden />}
        title="No exam dates yet"
        description="Add your CAT and Main Exam dates to get countdowns and reminders."
        action={
          <Button type="button" onClick={onAddExam} className="focus-ring gap-2">
            <Plus className="size-4" aria-hidden />
            Add exam date
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddExam}
          className="focus-ring gap-1.5"
        >
          <Plus className="size-4" aria-hidden />
          Add exam date
        </Button>
      </div>

      {upcoming.length > 0 ? (
        <section aria-label="Upcoming exams" className="glass-card p-4 sm:p-5">
          <h2 className="font-heading mb-1 inline-flex items-center gap-2 text-base font-semibold">
            <CalendarCheck className="text-primary size-4" aria-hidden />
            Upcoming exams
          </h2>
          <ul className="divide-border/60 divide-y">
            {upcoming.map((exam) => (
              <ExamRow key={exam.id} exam={exam} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          No upcoming exams — add your next CAT or Main Exam date to start the countdown.
        </p>
      )}

      {past.length > 0 ? (
        <details className="glass-card group p-4 sm:p-5">
          <summary className="font-heading focus-ring flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              <History className="text-muted-foreground size-4" aria-hidden />
              Past exams
              <Badge variant="outline" className="text-muted-foreground font-normal">
                {past.length}
              </Badge>
            </span>
            <ChevronDown
              aria-hidden
              className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="divide-border/60 border-border/60 mt-2 divide-y border-t pt-2">
            {past.map((exam) => (
              <PastExamRow key={exam.id} exam={exam} onEdit={onEdit} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
