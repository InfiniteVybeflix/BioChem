import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { CustomMockBuilder, type CustomMockRow } from "@/components/lecturer/custom-mock-builder";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import type { FormTopic } from "@/components/exam/submit-note-form";

export const metadata: Metadata = {
  title: "Custom mocks · Lecturer",
  description:
    "Assemble question sets into timed class mocks and review the ones you've published.",
};

/** Lecturer custom mocks page — builder plus this lecturer's existing mocks. */
export default async function LecturerMocksPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? [])) redirect("/dashboard");

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Custom mocks"
          description="Assemble question sets into timed class mocks and review the ones you've published."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const [topicResult, examResult] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, slug, zone")
      .order("order_index", { ascending: true }),
    supabase
      .from("exams")
      .select("id, title, zone, description, duration_minutes, total_marks, created_at")
      .eq("created_by", auth.user.id)
      .eq("is_past_paper", false)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const topics: FormTopic[] = topicResult.data ?? [];
  const examRows = examResult.data ?? [];

  // The typed client cannot embed through the reverse exam→exam_questions
  // relationship, so question counts are gathered separately and grouped in JS.
  const examIds = examRows.map((exam) => exam.id);
  const { data: linkRows } =
    examIds.length > 0
      ? await supabase.from("exam_questions").select("exam_id").in("exam_id", examIds).limit(5000)
      : { data: [] as { exam_id: string }[] };
  const countByExam = new Map<string, number>();
  for (const row of linkRows ?? []) {
    countByExam.set(row.exam_id, (countByExam.get(row.exam_id) ?? 0) + 1);
  }

  const mocks: CustomMockRow[] = examRows.map((exam) => ({
    id: exam.id,
    title: exam.title,
    zone: exam.zone,
    durationMinutes: exam.duration_minutes,
    totalMarks: exam.total_marks,
    questionCount: countByExam.get(exam.id) ?? 0,
    createdAt: exam.created_at,
  }));

  return (
    <>
      <PageHeader
        title="Custom mocks"
        description="Assemble question sets into timed class mocks and review the ones you've published."
      />
      <CustomMockBuilder topics={topics} initialMocks={mocks} />
    </>
  );
}
