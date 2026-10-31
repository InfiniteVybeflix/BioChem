import type { Database, PlanEventType } from "@/types/domain";
import { DAY_NAMES, EVENT_COLORS } from "@/lib/constants";

/**
 * Shared planner types, the single EVENT_COLORS → Tailwind style map and
 * date/time helpers used by every planner tab.
 */

export type PlanEventRow = Database["public"]["Tables"]["plan_events"]["Row"];
export type StudyPlanRow = Database["public"]["Tables"]["study_plans"]["Row"];
export type PlanEventTypeName = PlanEventType;

/** Type-safe color name drawn from EVENT_COLORS. */
export type EventColorName = (typeof EVENT_COLORS)[number];

/** The ONE colour map — every planner surface references this. */
export const EVENT_COLOR_STYLES: Record<
  EventColorName,
  { block: string; dot: string; swatch: string; text: string }
> = {
  teal: {
    block: "border-teal-500/40 bg-teal-500/20 text-teal-700 dark:text-teal-300",
    dot: "bg-teal-500",
    swatch: "bg-teal-500/40 border-teal-500/60",
    text: "text-teal-600 dark:text-teal-400",
  },
  emerald: {
    block: "border-emerald-500/40 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    swatch: "bg-emerald-500/40 border-emerald-500/60",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    block: "border-amber-500/40 bg-amber-500/20 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    swatch: "bg-amber-500/40 border-amber-500/60",
    text: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    block: "border-rose-500/40 bg-rose-500/20 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    swatch: "bg-rose-500/40 border-rose-500/60",
    text: "text-rose-600 dark:text-rose-400",
  },
  violet: {
    block: "border-violet-500/40 bg-violet-500/20 text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    swatch: "bg-violet-500/40 border-violet-500/60",
    text: "text-violet-600 dark:text-violet-400",
  },
  cyan: {
    block: "border-cyan-500/40 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-500",
    swatch: "bg-cyan-500/40 border-cyan-500/60",
    text: "text-cyan-600 dark:text-cyan-400",
  },
};

export function eventColorStyle(color: string) {
  const name = (EVENT_COLORS as readonly string[]).includes(color)
    ? (color as EventColorName)
    : "teal";
  return EVENT_COLOR_STYLES[name];
}

export const EVENT_TYPE_META: Record<PlanEventTypeName, { label: string }> = {
  study: { label: "Study session" },
  class: { label: "Class / lecture" },
  exam: { label: "Exam" },
  personal: { label: "Personal" },
  deadline: { label: "Deadline" },
};

/** Grid bounds: events are laid out between 06:00 and 24:00. */
export const DAY_START_MINUTES = 6 * 60;
export const DAY_END_MINUTES = 24 * 60;
export const DAY_SPAN_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES;

/** "07:30" | "07:30:00" → 450. */
export function timeToMinutes(value: string): number {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

/** 450 → "07:30". */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** 450 → "7:30 AM". */
export function minutesToLabel(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

/** Local date → "YYYY-MM-DD" (plan_events.date format). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday 00:00 of the week containing `date` (or offset weeks away). */
export function startOfWeek(date: Date, weekOffset = 0): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  start.setDate(start.getDate() + diff + weekOffset * 7);
  return start;
}

/** Monday-first day order: Mon(1) … Sun(0). */
export const WEEK_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function dayShortName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek]?.slice(0, 3) ?? "";
}

/** 30-minute start-time options between "06:00" and "23:30". */
export const START_TIME_OPTIONS: string[] = Array.from(
  { length: DAY_SPAN_MINUTES / 30 },
  (_, index) => minutesToTime(DAY_START_MINUTES + index * 30),
);

/** 30-minute end-time options between "06:30" and "24:00" (midnight). */
export const END_TIME_OPTIONS: string[] = Array.from(
  { length: DAY_SPAN_MINUTES / 30 },
  (_, index) => minutesToTime(DAY_START_MINUTES + 30 + index * 30),
);
