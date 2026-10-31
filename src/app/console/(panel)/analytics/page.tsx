import { AnalyticsCharts } from "@/components/admin/analytics-charts";
import type {
  AiUsageRow,
  ContributorRow,
  DailyPoint,
  ZoneMasteryRow,
} from "@/components/admin/analytics-charts";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ExamZone } from "@/types/domain";

/** The last 30 day-strings (UTC), oldest first. */
function last30Days(): string[] {
  return Array.from({ length: 30 }, (_, index) =>
    new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** The date-string of 30 days ago (for DB range filters). */
function since30Days(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
}

/** The timestamp 30 days ago (for DB range filters). */
function since30DaysIso(): string {
  return `${since30Days()}T00:00:00Z`;
}

/**
 * Console — platform analytics: 30-day DAU, attempts per day, top
 * contributors, per-zone mastery and AI usage.
 */
export default async function ConsoleAnalyticsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const since = since30Days();
  const days = last30Days();

  const [
    { data: activeRows },
    { data: attemptRows },
    { data: contributorRows },
    { data: zoneRows },
    { data: aiRows },
  ] = await Promise.all([
    admin.from("profiles").select("last_active_date").gte("last_active_date", since).limit(5000),
    admin
      .from("exam_attempts")
      .select("created_at")
      .gte("created_at", since30DaysIso())
      .limit(10000),
    admin
      .from("leaderboard_entries")
      .select("points, contributions, profiles(full_name)")
      .eq("period", "all_time")
      .order("points", { ascending: false })
      .limit(10),
    admin.from("user_outcome_progress").select("mastered, outcomes(topics(zone))"),
    admin.from("ai_usage").select("task, status").limit(20000),
  ]);

  const byDay = new Map<string, number>();
  for (const row of activeRows ?? []) {
    if (!row.last_active_date) continue;
    byDay.set(row.last_active_date, (byDay.get(row.last_active_date) ?? 0) + 1);
  }
  const dau: DailyPoint[] = days.map((date) => ({ date, count: byDay.get(date) ?? 0 }));

  const attemptsByDay = new Map<string, number>();
  for (const row of attemptRows ?? []) {
    const day = row.created_at.slice(0, 10);
    attemptsByDay.set(day, (attemptsByDay.get(day) ?? 0) + 1);
  }
  const attemptsPerDay: DailyPoint[] = days.map((date) => ({
    date,
    count: attemptsByDay.get(date) ?? 0,
  }));

  const contributors: ContributorRow[] = (contributorRows ?? [])
    .filter((row) => row.profiles?.full_name)
    .map((row) => ({
      name: row.profiles?.full_name ?? "",
      points: row.points,
      contributions: row.contributions,
    }));

  const zoneTotals = new Map<ExamZone, { mastered: number; total: number }>();
  for (const row of zoneRows ?? []) {
    const zone = row.outcomes?.topics?.zone;
    if (!zone) continue;
    const entry = zoneTotals.get(zone) ?? { mastered: 0, total: 0 };
    entry.total += 1;
    if (row.mastered) entry.mastered += 1;
    zoneTotals.set(zone, entry);
  }
  const zoneMastery: ZoneMasteryRow[] = (["cat1", "cat2", "main"] as ExamZone[]).map((zone) => {
    const entry = zoneTotals.get(zone);
    return {
      zone,
      pct: entry && entry.total > 0 ? Math.round((entry.mastered / entry.total) * 100) : 0,
    };
  });

  const usage = new Map<string, Record<string, number>>();
  for (const row of aiRows ?? []) {
    const counts = usage.get(row.task) ?? {};
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    usage.set(row.task, counts);
  }
  const aiUsage: AiUsageRow[] = [...usage.entries()].map(([task, counts]) => ({ task, counts }));
  const aiStatuses = [...new Set((aiRows ?? []).map((row) => row.status))];

  return (
    <AnalyticsCharts
      dau={dau}
      attemptsPerDay={attemptsPerDay}
      contributors={contributors}
      zoneMastery={zoneMastery}
      aiUsage={aiUsage}
      aiStatuses={aiStatuses}
    />
  );
}
