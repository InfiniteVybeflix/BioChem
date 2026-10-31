"use client";

import { CalendarCheck, Clock } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import {
  eventColorStyle,
  minutesToLabel,
  timeToMinutes,
  toDateKey,
} from "@/components/planner/planner-lib";
import type { PlanEventRow } from "@/components/planner/planner-lib";
import { cn } from "@/lib/utils";

/** Today's timeline: recurring events on today's weekday + today's one-offs. */
export function eventsForDate(events: PlanEventRow[], date: Date): PlanEventRow[] {
  const dateKey = toDateKey(date);
  const dayOfWeek = date.getDay();
  return events
    .filter((event) => event.day_of_week === dayOfWeek || event.date === dateKey)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

function formatRange(event: PlanEventRow): string {
  return `${minutesToLabel(timeToMinutes(event.start_time))} – ${minutesToLabel(
    timeToMinutes(event.end_time),
  )}`;
}

export function TodayStrip({
  events,
  onToggleCompleted,
}: {
  events: PlanEventRow[];
  onToggleCompleted: (event: PlanEventRow, completed: boolean) => void;
}) {
  const now = new Date();
  const today = eventsForDate(events, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextUp = today.find(
    (event) => !event.completed && timeToMinutes(event.end_time) > nowMinutes,
  );

  return (
    <section aria-label="Today's schedule" className="glass-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading inline-flex items-center gap-2 text-base font-semibold">
          <CalendarCheck className="text-primary size-4" aria-hidden />
          Today
        </h2>
        <p className="text-muted-foreground text-xs">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {today.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm">
          Nothing scheduled today — enjoy the calm, or add a session from the timetable below.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {today.map((event) => {
            const style = eventColorStyle(event.color);
            const isNext = nextUp?.id === event.id;
            const past = !event.completed && timeToMinutes(event.end_time) <= nowMinutes;
            return (
              <li
                key={event.id}
                className={cn(
                  "border-border/60 bg-card/60 flex items-center gap-3 rounded-lg border px-3 py-2 transition-all",
                  isNext && "border-primary/50 ring-primary/30 ring-1",
                  past && "opacity-60",
                  event.completed && "opacity-50",
                )}
              >
                <Checkbox
                  id={`today-done-${event.id}`}
                  checked={event.completed}
                  onCheckedChange={(checked) => onToggleCompleted(event, checked === true)}
                  aria-label={`Mark "${event.title}" as done`}
                  className="focus-ring"
                />
                <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      event.completed && "line-through",
                    )}
                  >
                    {event.title}
                    {isNext ? (
                      <span className="bg-primary/15 text-primary ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                        Next up
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">{event.type}</p>
                </div>
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                  <Clock className="size-3" aria-hidden />
                  {formatRange(event)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
