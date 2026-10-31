/**
 * SM-2 spaced repetition (SuperMemo 2) — the classic scheduling algorithm.
 *
 * Quality ratings follow the SM-2 convention:
 *   5 = perfect recall, 4 = correct after hesitation, 3 = correct with effort,
 *   2 = incorrect, easy answer recalled, 1 = incorrect, hard, 0 = complete blackout.
 * Ratings below 3 count as a lapse and reset the repetition streak.
 */

export interface Sm2State {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface Sm2Review extends Sm2State {
  dueDate: string; // ISO date (yyyy-mm-dd)
}

export const SM2_DEFAULTS: Sm2State = {
  ease: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
};

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
/** Intervals cap at ~5 years so scheduled dates always remain valid. */
const MAX_INTERVAL_DAYS = 1825;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

/**
 * Applies a single review to a card state and returns the next state.
 * `previous` may be omitted for a first review (defaults are used).
 */
export function sm2Review(
  previous: Partial<Sm2State> | null | undefined,
  quality: number,
): Sm2Review {
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    throw new Error(`SM-2 quality must be an integer 0–5, received ${quality}`);
  }

  const state: Sm2State = {
    ease: clamp(previous?.ease ?? SM2_DEFAULTS.ease, MIN_EASE, MAX_EASE),
    intervalDays: previous?.intervalDays ?? SM2_DEFAULTS.intervalDays,
    repetitions: previous?.repetitions ?? SM2_DEFAULTS.repetitions,
    lapses: previous?.lapses ?? SM2_DEFAULTS.lapses,
  };

  let ease = state.ease;
  let intervalDays: number;
  let repetitions: number;
  let lapses = state.lapses;

  if (quality < 3) {
    // Lapse: relearn from scratch, penalise ease.
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.min(Math.round(state.intervalDays * ease), MAX_INTERVAL_DAYS);
    }
  }

  // EF' = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
  ease = clamp(ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)), MIN_EASE, MAX_EASE);

  return {
    ease: Number(ease.toFixed(4)),
    intervalDays,
    repetitions,
    lapses,
    dueDate: addDaysIso(Math.max(intervalDays, 1)),
  };
}

/** Map a four-button UI (Again / Hard / Good / Easy) to SM-2 quality. */
export function qualityFromUiRating(rating: "again" | "hard" | "good" | "easy"): number {
  switch (rating) {
    case "again":
      return 2;
    case "hard":
      return 3;
    case "good":
      return 4;
    case "easy":
      return 5;
  }
}
