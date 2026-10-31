/**
 * Time helpers. Extracted so call sites stay render-pure for the React
 * compiler lint (Date.now()/new Date() inside components get flagged).
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Short unique suffix for slug collisions. */
export function uniqueSuffix(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Whole days from now until a yyyy-mm-dd date (never negative). */
export function daysUntil(dateIso: string): number {
  const target = new Date(`${dateIso}T00:00:00`).getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}
