import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import {
  DailyQuestions,
  type DailyHistoryDay,
  type DailyQuestionItem,
  type DailyTopicOption,
} from "@/components/ai/daily-questions";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { normalizeDailySettings, zonedToday } from "@/lib/ai/daily";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DAY_NAMES } from "@/lib/constants";
import type { Database } from "@/types/domain";
import { dailyQuestionPayload } from "@/types/domain";

export const metadata = { title: "Question of the Day — BioChem" };

type DailyQuestionRow = Database["public"]["Tables"]["daily_questions"]["Row"];

/** Columns fetched for today's set + the streak/history computation. */
type HistoryRow = Pick<
  DailyQuestionRow,
  | "id"
  | "for_date"
  | "topic_id"
  | "difficulty"
  | "payload"
  | "selected_answer"
  | "is_correct"
  | "answered_at"
>;

/** "YYYY-MM-DD" shifted by `days` (UTC-safe string math). */
function shiftDate(date: string, days: number): string {
  const dateObj = new Date(`${date}T00:00:00Z`);
  dateObj.setUTCDate(dateObj.getUTCDate() + days);
  return dateObj.toISOString().slice(0, 10);
}

/** Consecutive days (ending today, or yesterday when today is unplayed) with ≥1 answered question. */
function computeStreak(
  rows: Pick<DailyQuestionRow, "for_date" | "answered_at">[],
  today: string,
): number {
  const answeredDays = new Set(
    rows.filter((row) => row.answered_at !== null).map((row) => row.for_date),
  );
  let cursor = today;
  if (!answeredDays.has(cursor)) cursor = shiftDate(cursor, -1);
  let streak = 0;
  while (answeredDays.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

/**
 * Question of the Day page: today's set (generated on first visit by the API
 * when enabled), streak, 7-day history and delivery settings.
 */
export default async function DailyQuestionsPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Question of the Day"
          description="A fresh set of biochemistry MCQs, every single day."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const [{ data: settingsRow }, { data: topicRows }, { data: historyRows }, { data: flag }] =
    await Promise.all([
      supabase.from("daily_question_settings").select("*").maybeSingle(),
      supabase.from("topics").select("id, title, zone").order("order_index", { ascending: true }),
      supabase
        .from("daily_questions")
        .select(
          "id, for_date, topic_id, difficulty, payload, selected_answer, is_correct, answered_at, created_at",
        )
        .order("created_at", { ascending: true })
        .limit(400),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "question_of_the_day")
        .maybeSingle(),
    ]);

  const settings = normalizeDailySettings(settingsRow);
  const today = zonedToday(settings.timezone);
  const allRows: HistoryRow[] = historyRows ?? [];

  const topicTitles = new Map((topicRows ?? []).map((topic) => [topic.id, topic.title]));
  const questions: DailyQuestionItem[] = allRows
    .filter((row) => row.for_date === today)
    .flatMap((row) => {
      const payload = dailyQuestionPayload(row.payload);
      if (!payload) return [];
      return [
        {
          id: row.id,
          for_date: row.for_date,
          topicTitle: row.topic_id ? (topicTitles.get(row.topic_id) ?? null) : null,
          difficulty: row.difficulty,
          payload,
          selected_answer: row.selected_answer,
          is_correct: row.is_correct,
          answered_at: row.answered_at,
        },
      ];
    });

  const topics: DailyTopicOption[] = (topicRows ?? []).map((topic) => ({
    id: topic.id,
    title: topic.title,
    zone: topic.zone,
  }));

  // 7-day strip (oldest → today).
  const historyDays: DailyHistoryDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(today, index - 6);
    const dayRows = allRows.filter((row) => row.for_date === date);
    const answered = dayRows.filter((row) => row.answered_at !== null);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return {
      date,
      label: DAY_NAMES[weekday]?.slice(0, 3) ?? "",
      answered: answered.length,
      correct: answered.filter((row) => row.is_correct === true).length,
    };
  });

  const streak = computeStreak(allRows, today);
  const flagOn = !flag || flag.enabled !== false;

  return (
    <>
      <PageHeader
        title="Question of the Day"
        description="A fresh set of biochemistry MCQs, every single day — answer them all to keep your streak alive."
      />
      <DailyQuestions
        today={today}
        initialQuestions={questions}
        topics={topics}
        historyDays={historyDays}
        streak={streak}
        settings={settings}
        flagOn={flagOn}
        gatewayReady={gatewayConfigured()}
      />
    </>
  );
}
