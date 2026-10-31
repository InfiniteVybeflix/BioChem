"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarPlus, Check, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DAY_NAMES } from "@/lib/constants";
import type { EventDialogPrefill } from "@/components/planner/event-dialog";
import {
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  eventColorStyle,
  minutesToLabel,
  minutesToTime,
  startOfWeek,
  timeToMinutes,
  toDateKey,
  WEEK_DAY_ORDER,
  dayShortName,
  type PlanEventRow,
} from "@/components/planner/planner-lib";
import { cn } from "@/lib/utils";

/** Pixels per hour row — the whole 06:00–24:00 span is 18 rows tall. */
const HOUR_HEIGHT = 52;
const GRID_HEIGHT = HOUR_HEIGHT * 18;
const GRID_COLS = "grid-cols-[3.25rem_repeat(7,minmax(7rem,1fr))]";

interface TimetableGridProps {
  events: PlanEventRow[];
  onCreate: (prefill?: EventDialogPrefill) => void;
  onEdit: (event: PlanEventRow) => void;
  onMove: (id: string, changes: { dayOfWeek: number | null; date: string | null }) => void;
  onToggleCompleted: (event: PlanEventRow, completed: boolean) => void;
}

interface LaidOutEvent {
  event: PlanEventRow;
  lane: number;
  lanes: number;
  top: number;
  height: number;
}

/** Greedy lane packing so overlapping events share the column width. */
function layoutDayEvents(dayEvents: PlanEventRow[]): LaidOutEvent[] {
  const sorted = [...dayEvents].sort(
    (a, b) =>
      timeToMinutes(a.start_time) - timeToMinutes(b.start_time) ||
      timeToMinutes(a.end_time) - timeToMinutes(b.end_time),
  );

  const laneEnds: number[] = [];
  const placed: Omit<LaidOutEvent, "lanes">[] = [];

  for (const event of sorted) {
    const start = Math.max(DAY_START_MINUTES, timeToMinutes(event.start_time));
    const end = Math.min(DAY_END_MINUTES, timeToMinutes(event.end_time));
    if (end <= start) continue;

    let lane = laneEnds.findIndex((endsAt) => endsAt <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }

    placed.push({
      event,
      lane,
      top: ((start - DAY_START_MINUTES) / 60) * HOUR_HEIGHT,
      height: Math.max(((end - start) / 60) * HOUR_HEIGHT, 20),
    });
  }

  return placed.map((item) => ({ ...item, lanes: Math.max(laneEnds.length, 1) }));
}

function formatRange(event: PlanEventRow): string {
  return `${minutesToLabel(timeToMinutes(event.start_time))} – ${minutesToLabel(
    timeToMinutes(event.end_time),
  )}`;
}

/** A single draggable event block inside a day column. */
function EventBlock({
  laid,
  onEdit,
  onToggleCompleted,
}: {
  laid: LaidOutEvent;
  onEdit: (event: PlanEventRow) => void;
  onToggleCompleted: (event: PlanEventRow, completed: boolean) => void;
}) {
  const { event, lane, lanes, top, height } = laid;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });
  const style = eventColorStyle(event.color);
  const showTime = height >= 42;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${formatRange(event)}${event.completed ? ", completed" : ""}. Press to edit, drag to move.`}
      onClick={() => onEdit(event)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onEdit(event);
        }
      }}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 40 : 10,
      }}
      className={cn(
        "group focus-ring absolute flex cursor-grab touch-none flex-col overflow-hidden rounded-lg border px-2 py-1 text-left transition-all select-none active:cursor-grabbing",
        style.block,
        isDragging && "opacity-30",
        event.completed && "opacity-60",
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] leading-4 font-semibold",
            event.completed && "line-through",
          )}
        >
          {event.title}
        </span>
        <button
          type="button"
          onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            onToggleCompleted(event, !event.completed);
          }}
          aria-label={
            event.completed ? `Mark "${event.title}" as not done` : `Mark "${event.title}" as done`
          }
          className={cn(
            "focus-ring -mr-0.5 shrink-0 rounded p-0.5 transition-all",
            event.completed
              ? "bg-emerald-500/80 text-white"
              : "hover:bg-foreground/10 opacity-0 group-hover:opacity-100 max-sm:opacity-100",
          )}
        >
          <Check className="size-3" aria-hidden />
        </button>
      </span>
      {showTime ? (
        <span className="truncate text-[10px] leading-4 opacity-80">
          {minutesToLabel(timeToMinutes(event.start_time))}
        </span>
      ) : null}
    </div>
  );
}

/** One weekday column: droppable target + hourly create buttons + event blocks. */
function DayColumn({
  dayOfWeek,
  columnDate,
  dateKey,
  dayEvents,
  isToday,
  onCreate,
  onEdit,
  onToggleCompleted,
}: {
  dayOfWeek: number;
  columnDate: Date;
  dateKey: string;
  dayEvents: PlanEventRow[];
  isToday: boolean;
  onCreate: (prefill?: EventDialogPrefill) => void;
  onEdit: (event: PlanEventRow) => void;
  onToggleCompleted: (event: PlanEventRow, completed: boolean) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `grid-day-${dayOfWeek}`,
    data: { dayOfWeek, dateKey },
  });
  const laid = useMemo(() => layoutDayEvents(dayEvents), [dayEvents]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-border/40 relative border-l transition-colors",
        isOver && "bg-primary/10",
        isToday && "bg-primary/5",
      )}
      style={{ height: GRID_HEIGHT }}
    >
      {Array.from({ length: 18 }, (_, hour) => (
        <button
          key={hour}
          type="button"
          onClick={() =>
            onCreate({
              dayOfWeek,
              startTime: minutesToTime(DAY_START_MINUTES + hour * 60),
              endTime: minutesToTime(DAY_START_MINUTES + hour * 60 + 60),
            })
          }
          aria-label={`Add event on ${DAY_NAMES[dayOfWeek]} at ${minutesToLabel(
            DAY_START_MINUTES + hour * 60,
          )}`}
          className="border-border/25 hover:bg-primary/10 focus-ring absolute inset-x-0 border-t transition-colors"
          style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
        />
      ))}

      <span aria-hidden className="border-border/25 absolute inset-x-0 bottom-0 border-t" />

      {laid.map((item) => (
        <EventBlock
          key={item.event.id}
          laid={item}
          onEdit={onEdit}
          onToggleCompleted={onToggleCompleted}
        />
      ))}

      <span className="sr-only">
        {DAY_NAMES[dayOfWeek]} {columnDate.getDate()} — {dayEvents.length} events
      </span>
    </div>
  );
}

/** Mobile fallback: chunky drop chips for touch users ("move to any day"). */
function DayDropChip({ dayOfWeek, dateKey }: { dayOfWeek: number; dateKey: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `chip-day-${dayOfWeek}`,
    data: { dayOfWeek, dateKey },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border-border/60 bg-card/60 flex h-11 items-center justify-center rounded-lg border text-xs font-semibold transition-all",
        isOver && "border-primary bg-primary/15 text-primary ring-primary ring-1",
      )}
    >
      {dayShortName(dayOfWeek)}
    </div>
  );
}

export function TimetableGrid({
  events,
  onCreate,
  onEdit,
  onMove,
  onToggleCompleted,
}: TimetableGridProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeEvent, setActiveEvent] = useState<PlanEventRow | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const weekStart = useMemo(() => startOfWeek(new Date(), weekOffset), [weekOffset]);
  const columnDates = useMemo(
    () =>
      WEEK_DAY_ORDER.map(
        (_, index) =>
          new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index),
      ),
    [weekStart],
  );
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  /** Column index → events to render there for the displayed week. */
  const eventsByColumn = useMemo(() => {
    const order: readonly number[] = WEEK_DAY_ORDER;
    const map = new Map<number, PlanEventRow[]>();
    for (let index = 0; index < 7; index++) map.set(index, []);

    for (const event of events) {
      if (event.day_of_week !== null) {
        const index = order.indexOf(event.day_of_week);
        if (index !== -1) map.get(index)?.push(event);
      } else if (event.date !== null) {
        const index = columnDates.findIndex((date) => toDateKey(date) === event.date);
        if (index !== -1) map.get(index)?.push(event);
      }
    }
    return map;
  }, [events, columnDates]);

  const weekEnd = columnDates[6];
  const weekLabel = `${weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { event?: PlanEventRow } | undefined;
    setActiveEvent(data?.event ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveEvent(null);
    const { active, over } = event;
    if (!over) return;

    const source = active.data.current as { event?: PlanEventRow } | undefined;
    const target = over.data.current as { dayOfWeek?: number; dateKey?: string } | undefined;
    const moved = source?.event;
    if (!moved || target?.dayOfWeek === undefined || !target.dateKey) return;

    if (moved.day_of_week !== null) {
      onMove(moved.id, { dayOfWeek: target.dayOfWeek, date: null });
    } else {
      onMove(moved.id, { dayOfWeek: null, date: target.dateKey });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveEvent(null)}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm font-medium">{weekLabel}</p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              aria-label="Previous week"
              className="focus-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              aria-label="Next week"
              className="focus-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            {weekOffset !== 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setWeekOffset(0)}
                className="focus-ring"
              >
                This week
              </Button>
            ) : null}
          </div>
        </div>

        {/* Mobile "any day" drop fallback — touch targets for moving blocks. */}
        <div className="sm:hidden">
          <p className="text-muted-foreground mb-1.5 text-xs">
            Drag an event block onto a day to move it
          </p>
          <div className="grid grid-cols-7 gap-1">
            {WEEK_DAY_ORDER.map((day, index) => (
              <DayDropChip key={day} dayOfWeek={day} dateKey={toDateKey(columnDates[index])} />
            ))}
          </div>
        </div>

        <div className="border-border/60 bg-card/30 scrollbar-slim relative max-h-[78vh] overflow-auto rounded-xl border">
          <div className="min-w-[720px]">
            {/* Sticky day headers */}
            <div
              className={cn(
                "border-border/60 bg-background/95 sticky top-0 z-30 grid border-b backdrop-blur",
                GRID_COLS,
              )}
            >
              <div className="bg-background/95 sticky left-0 z-40 backdrop-blur" aria-hidden />
              {WEEK_DAY_ORDER.map((day, index) => {
                const date = columnDates[index];
                const isToday = toDateKey(date) === todayKey;
                return (
                  <div
                    key={day}
                    className={cn("px-1 py-2 text-center", isToday && "bg-primary/10")}
                  >
                    <p
                      className={cn(
                        "text-muted-foreground text-[11px] font-medium tracking-wide uppercase",
                        isToday && "text-primary",
                      )}
                    >
                      {dayShortName(day)}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        isToday && "text-primary",
                      )}
                    >
                      {date.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Body: sticky hour labels + droppable day columns */}
            <div className={cn("relative grid", GRID_COLS)}>
              <div className="bg-background/95 sticky left-0 z-20 backdrop-blur">
                {Array.from({ length: 18 }, (_, hour) => (
                  <div key={hour} className="relative" style={{ height: HOUR_HEIGHT }}>
                    <span className="text-muted-foreground absolute -top-2 right-1.5 text-[10px] font-medium">
                      {minutesToLabel(DAY_START_MINUTES + hour * 60).replace(":00", "")}
                    </span>
                  </div>
                ))}
              </div>

              {WEEK_DAY_ORDER.map((day, index) => (
                <DayColumn
                  key={day}
                  dayOfWeek={day}
                  columnDate={columnDates[index]}
                  dateKey={toDateKey(columnDates[index])}
                  dayEvents={eventsByColumn.get(index) ?? []}
                  isToday={toDateKey(columnDates[index]) === todayKey}
                  onCreate={onCreate}
                  onEdit={onEdit}
                  onToggleCompleted={onToggleCompleted}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <CalendarPlus className="size-3.5" aria-hidden />
          Tap an empty slot to add an event · tap a block to edit · drag it to another day to move
        </p>
      </div>

      <DragOverlay>
        {activeEvent ? (
          <div
            className={cn(
              "w-44 rounded-lg border p-2 shadow-2xl backdrop-blur",
              eventColorStyle(activeEvent.color).block,
            )}
          >
            <p className="truncate text-xs font-semibold">{activeEvent.title}</p>
            <p className="text-[10px] opacity-80">{formatRange(activeEvent)}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
