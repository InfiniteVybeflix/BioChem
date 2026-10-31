import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/common/setup-notice";
import { PageHeader } from "@/components/common/ui-bits";
import { MockHub } from "@/components/mocks/mock-hub";
import type { AttemptListItem } from "@/components/mocks/types";
import { ZONES } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";
import { attemptConfig } from "@/types/domain";

/**
 * Mock exam hub — configure + start mocks, resume in-progress attempts and
 * review score history. Honors `?zone=` to preselect a zone.
 */
export default async function MocksPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string | string[] }>;
}) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mock Exams" description="Practise under real exam conditions." />
        <SetupNotice missing="app" />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select(
      "id, zone, mode, status, score, max_score, config, started_at, submitted_at, duration_seconds, exams(title)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const list: AttemptListItem[] = (attempts ?? []).map((row) => ({
    id: row.id,
    zone: row.zone,
    mode: row.mode,
    status: row.status,
    score: row.score,
    maxScore: row.max_score,
    config: attemptConfig(row.config),
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    durationSeconds: row.duration_seconds,
    examTitle: row.exams?.title ?? null,
  }));

  const zoneParam = await searchParams;
  const rawZone = Array.isArray(zoneParam.zone) ? zoneParam.zone[0] : zoneParam.zone;
  const initialZone: ExamZone | null =
    rawZone && ZONES.some((zone) => zone.id === rawZone) ? (rawZone as ExamZone) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock Exams"
        description="Build random mocks from the question bank, sit past papers under timed conditions and track your scores."
      />
      <MockHub attempts={list} initialZone={initialZone} />
    </div>
  );
}
