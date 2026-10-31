"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DAY_NAMES } from "@/lib/constants";
import type { EventDialogPrefill } from "@/components/planner/event-dialog";
import { eventsForDate } from "@/components/planner/today-strip";
import {
  dayShortName,
  eventColorStyle,
  minutesToLabel,
  timeToMinutes,
  toDateKey,
  WEEK_DAY_ORDER,
  type PlanEventRow,
} from "@/components/planner/planner-lib";
import { cn } from "@/lib/utils";

interface MonthCalendarProps {
  events: PlanEventRow[];
  onCreate: (prefill?: EventDialogPrefill) => void;
  onEdit: (event: PlanEventRow) => void;
  onToggleCompleted: (event: PlanEventRow, completed: boolean) => void;
}

const MAX_DOTS = 4;

interface MonthCell {
  key: string;
  date: Date | null;
  dayNumber: number | null;
}

function buildMonthCells(cursor: Date): MonthCell[] {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let blank = 0; blank < leading; blank++) {
    cells.push({ key: `blank-${blank}`, date: null, dayNumber: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    cells.push({ key: toDateKey(date), date, dayNumber: day });
  }
  return cells;
}

function formatRange(event: PlanEventRow): string {
  return `${minutesToLabel(timeToMinutes(event.start_time))} – ${minutesToLabel(
    timeToMinutes(event.end_time),
  )}`;
}

export function MonthCalendar({ events, onCreate, onEdit, onToggleCompleted }: MonthCalendarProps) {
  const [cursor, setCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState<string>(() => toDateKey(new Date()));

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);

  const selectedDate = useMemo(() => {
    const [year, month, day] = selected.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }, [selected]);
  const selectedKey = toDateKey(selectedDate);
  const dayEvents = useMemo(() => eventsForDate(events, selectedDate), [events, selectedDate]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const stepMonth = (delta: number) => {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(toDateKey(now));
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      {/* Month grid */}
      <section aria-label="Month calendar" className="glass-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading inline-flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="text-primary size-4" aria-hidden />
            {monthLabel}
          </h2>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className="focus-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              className="focus-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={goToday}
              className="focus-ring"
            >
              Today
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEK_DAY_ORDER.map((day) => (
            <div
              key={day}
              className="text-muted-foreground pb-1 text-center text-[11px] font-medium tracking-wide uppercase"
            >
              <span aria-hidden>{dayShortName(day)}</span>
              <span className="sr-only">{DAY_NAMES[day]}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) => {
            if (!cell.date || cell.dayNumber === null) {
              return <div key={cell.key} aria-hidden className="min-h-14 sm:min-h-16" />;
            }
            const key = toDateKey(cell.date);
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const occurrences = eventsForDate(events, cell.date);

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={`${cell.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${occurrences.length > 0 ? `, ${occurrences.length} events` : ""}`}
                aria-pressed={isSelected}
                className={cn(
                  "focus-ring hover:bg-primary/10 flex min-h-14 flex-col items-center gap-1 rounded-lg border border-transparent p-1 pt-1.5 transition-all sm:min-h-16",
                  isSelected && "border-primary/50 bg-primary/10",
                  isToday && !isSelected && "ring-primary/60 ring-1 ring-inset",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && isSelected && "text-primary",
                  )}
                >
                  {cell.dayNumber}
                </span>
                {occurrences.length > 0 ? (
                  <span className="flex flex-wrap items-center justify-center gap-0.5">
                    {occurrences.slice(0, MAX_DOTS).map((event) => (
                      <span
                        key={event.id}
                        className={cn("size-1.5 rounded-full", eventColorStyle(event.color).dot)}
                        aria-hidden
                      />
                    ))}
                    {occurrences.length > MAX_DOTS ? (
                      <span className="text-muted-foreground text-[9px] leading-none font-semibold">
                        +{occurrences.length - MAX_DOTS}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* Day detail panel */}
      <section aria-label="Selected day" className="glass-card flex flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading text-sm font-semibold">
            {selectedDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCreate({ date: selectedKey })}
            className="focus-ring gap-1.5"
          >
            <CalendarPlus className="size-4" aria-hidden />
            Add event
          </Button>
        </div>

        {dayEvents.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <CalendarDays className="text-muted-foreground/60 size-6" aria-hidden />
            <p className="text-muted-foreground mt-2 text-sm">
              Nothing scheduled — add a session or revision block.
            </p>
          </div>
        ) : (
          <ul className="scrollbar-slim mt-3 max-h-96 space-y-1.5 overflow-y-auto">
            {dayEvents.map((event) => {
              const style = eventColorStyle(event.color);
              return (
                <li key={event.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onEdit(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        onEdit(event);
                      }
                    }}
                    aria-label={`Edit "${event.title}", ${formatRange(event)}`}
                    className={cn(
                      "border-border/60 bg-card/60 hover:bg-card focus-ring flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all hover:-translate-y-0.5",
                      event.completed && "opacity-60",
                    )}
                  >
                    <Checkbox
                      checked={event.completed}
                      onCheckedChange={(checked) => {
                        onToggleCompleted(event, checked === true);
                      }}
                      onClick={(clickEvent) => clickEvent.stopPropagation()}
                      aria-label={`Mark "${event.title}" as done`}
                      className="focus-ring"
                    />
                    <span className={cn("size-2.5 shrink-0 rounded-full", style.dot)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          event.completed && "line-through",
                        )}
                      >
                        {event.title}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {formatRange(event)}
                      </span>
                    </span>
                    <ChevronDown
                      className="text-muted-foreground size-3.5 shrink-0 -rotate-90"
                      aria-hidden
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
