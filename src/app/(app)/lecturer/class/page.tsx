import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import {
  ClassAnalytics,
  type MasteryPoint,
  type MockDistributionView,
  type StrugglingTopicView,
  type StudentRowView,
} from "@/components/lecturer/class-analytics";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import {
  mockDistribution,
  strugglingTopics,
  studentRows,
  topicMastery,
} from "@/lib/analytics/class";

export const metadata: Metadata = {
  title: "Class analytics · Lecturer",
  description: "Topic mastery, mock score bands, student progress and struggling students.",
};

/**
 * Class analytics — cross-user aggregates (outcome progress is own-read under
 * RLS), so the service-role client runs the queries after the capability gate.
 */
export default async function LecturerClassPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "view_class_analytics")) redirect("/dashboard");

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return (
      <>
        <PageHeader
          title="Class analytics"
          description="Topic mastery, mock score bands, student progress and struggling students."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const [mastery, distribution, students, struggling] = await Promise.all([
    topicMastery(admin),
    mockDistribution(admin),
    studentRows(admin),
    strugglingTopics(admin),
  ]);

  const masteryPoints: MasteryPoint[] = mastery.map((topic) => ({
    topicId: topic.topicId,
    title: topic.title,
    zone: topic.zone,
    mastered: topic.mastered,
    total: topic.total,
  }));
  const distributionView: MockDistributionView = distribution;
  const studentViews: StudentRowView[] = students.map((student) => ({ ...student }));
  const strugglingViews: StrugglingTopicView[] = struggling.map((topic) => ({ ...topic }));

  return (
    <>
      <PageHeader
        title="Class analytics"
        description="Where the class is strong, where it struggles, and who needs a hand — across all students."
      />
      <ClassAnalytics
        mastery={masteryPoints}
        distribution={distributionView}
        students={studentViews}
        struggling={strugglingViews}
      />
    </>
  );
}
