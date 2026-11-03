import { format, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Crash-proof date helpers for client components.
 *
 * `parseISO(null)` and `format(new Date(NaN))` THROW in date-fns v4 —
 * an attempt row with a missing/invalid timestamp used to take the whole
 * page down with "Application error: a client-side exception". Every
 * mock-mode render path formats dates through these guards instead.
 */

function toDate(value: string | null | undefined): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  let date: Date;
  try {
    date = parseISO(value);
  } catch {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIsoSafe(value: string | null | undefined): Date | null {
  return toDate(value);
}

/** Formats a timestamp, or returns `fallback` when it is missing/invalid. */
export function formatDateTimeSafe(
  value: string | null | undefined,
  pattern = "d MMM yyyy, HH:mm",
  fallback = "",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  try {
    return format(date, pattern);
  } catch {
    return fallback;
  }
}

/** Relative time ("5 minutes ago"), or `fallback` when missing/invalid. */
export function formatDistanceSafe(
  value: string | null | undefined,
  fallback = "",
): string {
  const date = toDate(value);
  if (!date) return fallback;
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return fallback;
  }
}
