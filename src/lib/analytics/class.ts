import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { ExamZone } from "@/types/domain";

/**
 * Class-level analytics for the lecturer panel. Every function takes the
 * service-role client (user_outcome_progress and cross-user attempt data are
 * not readable under RLS) and keeps its queries bounded with limits/head
 * counts. Call sites must have passed a `view_class_analytics` capability
 * check first.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregate counters shown on the lecturer overview + /api/lecturer/class-stats. */
export interface ClassStats {
  studentCount: number;
  lecturerCount: number;
  attempts30d: number;
  avgMockPct: number | null;
  pendingSubmissions: number;
  unverifiedAnswers: number;
}

export async function classStats(admin: SupabaseAdminClient): Promise<ClassStats> {
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const [students, lecturers, attemptCount, attemptRows, pending, unverified] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "lecturer"),
    admin
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted")
      .gte("submitted_at", since),
    admin
      .from("exam_attempts")
      .select("score, max_score")
      .eq("status", "submitted")
      .gte("submitted_at", since)
      .limit(2000),
    admin.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("discussion_replies")
      .select("id", { count: "exact", head: true })
      .eq("is_verified", false),
  ]);

  const scored = (attemptRows.data ?? []).filter((row) => row.max_score > 0);
  const avgMockPct =
    scored.length > 0
      ? Math.round(
          (scored.reduce((sum, row) => sum + row.score / row.max_score, 0) / scored.length) * 1000,
        ) / 10
      : null;

  return {
    studentCount: students.count ?? 0,
    lecturerCount: lecturers.count ?? 0,
    attempts30d: attemptCount.count ?? 0,
    avgMockPct,
    pendingSubmissions: pending.count ?? 0,
    unverifiedAnswers: unverified.count ?? 0,
  };
}

/** Per-topic outcome mastery across ALL students (progress records grouped by topic). */
export interface TopicMastery {
  topicId: string;
  title: string;
  zone: ExamZone;
  mastered: number;
  total: number;
}

export function topicMasteryPct(topic: TopicMastery): number | null {
  if (topic.total <= 0) return null;
  return Math.round((topic.mastered / topic.total) * 1000) / 10;
}

export async function topicMastery(admin: SupabaseAdminClient): Promise<TopicMastery[]> {
  const [{ data: topicRows }, { data: outcomeRows }, { data: progressRows }] = await Promise.all([
    admin.from("topics").select("id, title, zone").order("order_index"),
    admin.from("outcomes").select("id, topic_id"),
    admin.from("user_outcome_progress").select("outcome_id, mastered").limit(5000),
  ]);

  const topicIdByOutcome = new Map((outcomeRows ?? []).map((row) => [row.id, row.topic_id]));
  const countsByTopic = new Map<string, { mastered: number; total: number }>();

  for (const row of progressRows ?? []) {
    const topicId = topicIdByOutcome.get(row.outcome_id);
    if (!topicId) continue;
    const entry = countsByTopic.get(topicId) ?? { mastered: 0, total: 0 };
    entry.total += 1;
    if (row.mastered) entry.mastered += 1;
    countsByTopic.set(topicId, entry);
  }

  return (topicRows ?? []).map((topic) => ({
    topicId: topic.id,
    title: topic.title,
    zone: topic.zone,
    mastered: countsByTopic.get(topic.id)?.mastered ?? 0,
    total: countsByTopic.get(topic.id)?.total ?? 0,
  }));
}

/** Submitted attempts from the last 30 days bucketed by percentage band. */
export interface MockDistribution {
  "0-49": number;
  "50-64": number;
  "65-79": number;
  "80-100": number;
}

export async function mockDistribution(admin: SupabaseAdminClient): Promise<MockDistribution> {
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const { data } = await admin
    .from("exam_attempts")
    .select("score, max_score")
    .eq("status", "submitted")
    .gte("submitted_at", since)
    .limit(2000);

  const dist: MockDistribution = { "0-49": 0, "50-64": 0, "65-79": 0, "80-100": 0 };
  for (const row of data ?? []) {
    if (row.max_score <= 0) continue;
    const pct = (row.score / row.max_score) * 100;
    if (pct < 50) dist["0-49"] += 1;
    else if (pct < 65) dist["50-64"] += 1;
    else if (pct < 80) dist["65-79"] += 1;
    else dist["80-100"] += 1;
  }
  return dist;
}

/** One row per student (max 200) with their attempts aggregate + mastered outcomes. */
export interface StudentRow {
  userId: string;
  name: string;
  xp: number;
  streak: number;
  attempts: number;
  avgPct: number | null;
  mastered: number;
}

export async function studentRows(admin: SupabaseAdminClient): Promise<StudentRow[]> {
  const [{ data: profileRows }, { data: attemptRows }, { data: progressRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, xp, streak_count")
      .eq("role", "student")
      .order("created_at", { ascending: true })
      .limit(200),
    admin
      .from("exam_attempts")
      .select("user_id, score, max_score")
      .eq("status", "submitted")
      .limit(5000),
    admin
      .from("user_outcome_progress")
      .select("user_id, mastered")
      .eq("mastered", true)
      .limit(5000),
  ]);

  const attemptsByUser = new Map<string, { count: number; ratioSum: number; scored: number }>();
  for (const row of attemptRows ?? []) {
    const entry = attemptsByUser.get(row.user_id) ?? { count: 0, ratioSum: 0, scored: 0 };
    entry.count += 1;
    if (row.max_score > 0) {
      entry.ratioSum += row.score / row.max_score;
      entry.scored += 1;
    }
    attemptsByUser.set(row.user_id, entry);
  }

  const masteredByUser = new Map<string, number>();
  for (const row of progressRows ?? []) {
    masteredByUser.set(row.user_id, (masteredByUser.get(row.user_id) ?? 0) + 1);
  }

  return (profileRows ?? []).map((profile) => {
    const attempts = attemptsByUser.get(profile.id);
    return {
      userId: profile.id,
      name: profile.full_name,
      xp: profile.xp,
      streak: profile.streak_count,
      attempts: attempts?.count ?? 0,
      avgPct:
        attempts && attempts.scored > 0
          ? Math.round((attempts.ratioSum / attempts.scored) * 1000) / 10
          : null,
      mastered: masteredByUser.get(profile.id) ?? 0,
    };
  });
}

/** The three lowest-mastery topics plus the students under 30% mastery on them. */
export interface StrugglingTopic {
  topicTitle: string;
  zone: ExamZone;
  students: string[];
}

export async function strugglingTopics(admin: SupabaseAdminClient): Promise<StrugglingTopic[]> {
  const mastery = await topicMastery(admin);
  const ranked = mastery
    .filter((topic) => topic.total > 0)
    .sort((a, b) => {
      const left = topicMasteryPct(a) ?? 100;
      const right = topicMasteryPct(b) ?? 100;
      return left - right;
    });
  const bottom = ranked.slice(0, 3);
  if (bottom.length === 0) return [];

  const { data: outcomeRows } = await admin
    .from("outcomes")
    .select("id, topic_id")
    .in(
      "topic_id",
      bottom.map((topic) => topic.topicId),
    );
  const outcomeIds = (outcomeRows ?? []).map((row) => row.id);
  if (outcomeIds.length === 0) return [];

  const { data: progressRows } = await admin
    .from("user_outcome_progress")
    .select("user_id, outcome_id, mastered")
    .in("outcome_id", outcomeIds)
    .limit(5000);

  // topic → student → { mastered, total }
  const byTopic = new Map<string, Map<string, { mastered: number; total: number }>>();
  const topicIdByOutcome = new Map((outcomeRows ?? []).map((row) => [row.id, row.topic_id]));
  for (const row of progressRows ?? []) {
    const topicId = topicIdByOutcome.get(row.outcome_id);
    if (!topicId) continue;
    const students = byTopic.get(topicId) ?? new Map<string, { mastered: number; total: number }>();
    const entry = students.get(row.user_id) ?? { mastered: 0, total: 0 };
    entry.total += 1;
    if (row.mastered) entry.mastered += 1;
    students.set(row.user_id, entry);
    byTopic.set(topicId, students);
  }

  const strugglingIds = new Set<string>();
  for (const students of byTopic.values()) {
    for (const [userId, entry] of students) {
      if (entry.total > 0 && entry.mastered / entry.total < 0.3) strugglingIds.add(userId);
    }
  }

  const { data: profileRows } =
    strugglingIds.size > 0
      ? await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", [...strugglingIds])
          .limit(500)
      : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));

  return bottom.map((topic) => {
    const students = byTopic.get(topic.topicId);
    const names: string[] = [];
    if (students) {
      for (const [userId, entry] of students) {
        if (entry.total > 0 && entry.mastered / entry.total < 0.3) {
          names.push(nameById.get(userId) ?? "Unknown student");
        }
      }
    }
    return {
      topicTitle: topic.title,
      zone: topic.zone,
      students: names.sort((a, b) => a.localeCompare(b)),
    };
  });
}
