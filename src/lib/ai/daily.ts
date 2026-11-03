import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gatewayChat } from "@/lib/ai/gateway";
import { DAILY_QUESTIONS_PROMPT, extractJsonArray, questionExamples } from "@/lib/ai/prompts";
import { notifyUsers } from "@/lib/push";
import type { Database, DailyQuestionPayload, Difficulty } from "@/types/domain";
import { toJson } from "@/types/domain";

/**
 * Question-of-the-Day generation.
 *
 * Runs in three contexts: the daily API route (generation-on-first-visit),
 * the delivery cron, and the AI queue processor. Always operates through the
 * service-role client because the cron/queue paths have no user session.
 */

type DailyQuestionRow = Database["public"]["Tables"]["daily_questions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["questions"]["Row"];
type DailySettingsRow = Database["public"]["Tables"]["daily_question_settings"]["Row"];

export interface DailySettings {
  topicIds: string[];
  difficulty: Difficulty;
  count: number;
  deliveryTime: string;
  timezone: string;
  enabled: boolean;
}

/** Shape of a single model-generated question (validated before insert). */
const dailyQuestionSchema = z
  .object({
    stem: z.string().min(5),
    options: z
      .array(z.object({ key: z.string().min(1).max(4), text: z.string().min(1).max(1000) }))
      .length(4),
    answer: z.string().min(1).max(4),
    explanation: z.string().min(1).max(4000),
  })
  .refine((question) => question.options.some((option) => option.key === question.answer), {
    message: "answer must match one of the option keys",
  });

/** "HH:MM" / "HH:MM:SS" → minutes since midnight. */
export function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function zonedParts(
  timeZone: string,
  at: Date,
): { date: string; minutes: number; dayOfWeek: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? "";
    const weekday = get("weekday"); // Sun, Mon, …
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      minutes: Number(get("hour")) * 60 + Number(get("minute")),
      dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : at.getUTCDay(),
    };
  } catch {
    // Unknown timezone — fall back to UTC.
    return {
      date: at.toISOString().slice(0, 10),
      minutes: at.getUTCHours() * 60 + at.getUTCMinutes(),
      dayOfWeek: at.getUTCDay(),
    };
  }
}

/** Local calendar date ("YYYY-MM-DD") of `at` rendered in `timeZone`. */
export function zonedToday(timeZone: string, at: Date = new Date()): string {
  return zonedParts(timeZone, at).date;
}

/** Minutes since local midnight of `at` rendered in `timeZone`. */
export function zonedMinutes(timeZone: string, at: Date = new Date()): number {
  return zonedParts(timeZone, at).minutes;
}

/** Local day of week (0 = Sunday) of `at` rendered in `timeZone`. */
export function zonedDayOfWeek(timeZone: string, at: Date = new Date()): number {
  return zonedParts(timeZone, at).dayOfWeek;
}

export function normalizeDailySettings(row: DailySettingsRow | null): DailySettings {
  return row
    ? {
        topicIds: row.topic_ids ?? [],
        difficulty: row.difficulty,
        count: row.count,
        deliveryTime: row.delivery_time.slice(0, 5),
        timezone: row.timezone,
        enabled: row.enabled,
      }
    : {
        topicIds: [],
        difficulty: "medium",
        count: 5,
        deliveryTime: "07:00",
        timezone: "Africa/Nairobi",
        enabled: true,
      };
}

/**
 * Generates (once per user per local day) the user's daily questions and
 * inserts them into `daily_questions`. Idempotent: when today's set already
 * exists the existing rows are returned untouched. Notifies the user that
 * their questions are ready.
 *
 * `settingsRow` lets callers that already loaded the row (the daily route,
 * the delivery cron) skip the extra fetch; omitted, it is loaded here.
 */
export async function generateDailyQuestions(
  userId: string,
  settingsRow?: DailySettingsRow | null,
): Promise<DailyQuestionRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  let row: DailySettingsRow | null = settingsRow ?? null;
  if (!row) {
    const { data: fetched } = await admin
      .from("daily_question_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    row = fetched ?? null;
  }
  const settings = normalizeDailySettings(row);

  const today = zonedToday(settings.timezone);

  const { data: existing } = await admin
    .from("daily_questions")
    .select("*")
    .eq("user_id", userId)
    .eq("for_date", today);
  if (existing && existing.length > 0) return existing;

  // 1-2 published MCQs from the bank as few-shot style examples, matching the
  // requested difficulty when possible.
  const loadExamples = async (difficulty: Difficulty | null): Promise<QuestionRow[]> => {
    let query = admin
      .from("questions")
      .select("*")
      .eq("status", "published")
      .eq("type", "mcq")
      .limit(2);
    if (difficulty) query = query.eq("difficulty", difficulty);
    const { data } = await query;
    return data ?? [];
  };
  let examples = await loadExamples(settings.difficulty);
  if (examples.length === 0) examples = await loadExamples(null);

  let topicInstruction = "Cover any CAT 1/CAT 2/Main topic.";
  if (settings.topicIds.length > 0) {
    const { data: topics } = await admin.from("topics").select("title").in("id", settings.topicIds);
    const titles = (topics ?? []).map((topic) => topic.title);
    if (titles.length > 0) {
      topicInstruction = `Focus on these topics: ${titles.join(", ")}.`;
    }
  }

  const instructions = `Generate exactly ${settings.count} questions. Difficulty: ${settings.difficulty}. ${topicInstruction}`;

  // Parse with layered repair; retry once with a stricter instruction so a
  // single malformed reply never surfaces as a raw JSON error to the student.
  let raw: unknown[] | null = null;
  for (let attempt = 0; attempt < 2 && raw === null; attempt += 1) {
    const retryNote =
      attempt === 0
        ? ""
        : "\n\nIMPORTANT: your previous reply was not usable. Reply with ONLY a valid JSON array — start with [ and end with ], no markdown fences, no commentary, no trailing commas. Every element must have stem, options (exactly 4, each {\"key\",\"text\"}), answerKey, explanation and marks.";
    const result = await gatewayChat("daily_questions", [
      { role: "system", content: DAILY_QUESTIONS_PROMPT },
      {
        role: "user",
        content:
          (examples.length > 0
            ? `${instructions}\n\nStyle examples:\n\n${questionExamples(examples)}`
            : instructions) + retryNote,
      },
    ]);
    try {
      raw = extractJsonArray(result.content);
    } catch {
      raw = null;
    }
  }
  if (raw === null) {
    throw new Error("The model returned an unreadable response — please try again");
  }

  const valid: DailyQuestionPayload[] = [];
  for (const element of raw) {
    const parsed = dailyQuestionSchema.safeParse(element);
    if (parsed.success) valid.push(parsed.data);
    if (valid.length >= settings.count) break;
  }
  if (valid.length === 0) {
    throw new Error("The model returned no valid daily questions — please try again");
  }

  const { data: inserted, error } = await admin
    .from("daily_questions")
    .insert(
      valid.map((payload) => ({
        user_id: userId,
        for_date: today,
        difficulty: settings.difficulty,
        payload: toJson(payload),
      })),
    )
    .select("*");
  if (error || !inserted) {
    throw new Error(`Failed to save daily questions: ${error?.message ?? "unknown error"}`);
  }

  await notifyUsers([userId], "daily_questions", {
    title: "Your daily questions are ready",
    body: `${inserted.length} biochemistry questions waiting for you`,
    link: "/ai/daily",
  });

  return inserted;
}
