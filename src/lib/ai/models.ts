/**
 * Aevibron Gateway model routing.
 *
 * Allowed models (per gateway contract):
 *   core-v3 · swift-v1 · quantum-v4 · compound-v1/lite · allam-v2 ·
 *   prime-v2/v3.1 · flash-v2 · flash-v3.5 · lite-v2.5
 *
 * Defaults are overridable through env (AEVIBRON_MODEL_*), see .env.example.
 */

export const ALLOWED_MODELS = [
  "core-v3",
  "swift-v1",
  "quantum-v4",
  "compound-v1/lite",
  "allam-v2",
  "prime-v2/v3.1",
  "flash-v2",
  "flash-v3.5",
  "lite-v2.5",
] as const;

export type AiModel = (typeof ALLOWED_MODELS)[number];

export type AiTask =
  | "tutor"
  | "explain"
  | "daily_questions"
  | "study_plan"
  | "flashcards"
  | "week_planner"
  | "moderation";

const ENV_KEYS: Record<AiTask, string> = {
  tutor: "AEVIBRON_MODEL_TUTOR",
  explain: "AEVIBRON_MODEL_EXPLAIN",
  daily_questions: "AEVIBRON_MODEL_DAILY",
  study_plan: "AEVIBRON_MODEL_PLAN",
  flashcards: "AEVIBRON_MODEL_FLASHCARDS",
  week_planner: "AEVIBRON_MODEL_PLAN",
  moderation: "AEVIBRON_MODEL_COMMUNITY",
};

const DEFAULTS: Record<AiTask, AiModel> = {
  tutor: "core-v3",
  explain: "flash-v2",
  daily_questions: "swift-v1",
  study_plan: "quantum-v4",
  flashcards: "compound-v1/lite",
  week_planner: "quantum-v4",
  moderation: "allam-v2",
};

export function modelForTask(task: AiTask): AiModel {
  const override = process.env[ENV_KEYS[task]] as AiModel | undefined;
  if (override && (ALLOWED_MODELS as readonly string[]).includes(override)) {
    return override;
  }
  return DEFAULTS[task];
}

/** Rate limits: max gateway calls per user per task per hour. */
export const RATE_LIMITS: Record<AiTask, number> = {
  tutor: 60,
  explain: 60,
  daily_questions: 6,
  study_plan: 4,
  flashcards: 10,
  week_planner: 5,
  moderation: 120,
};
