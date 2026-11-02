import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { MarkingBoard } from "@/components/lecturer/marking-board";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import type { MarkingQuestion } from "@/app/api/lecturer/marking/route";

export const metadata: Metadata = {
  title: "Marking · Lecturer",
  description:
    "Review and mark student attempts, and decide when hidden answers open — manually or on a schedule.",
};

/**
 * Lecturer marking — every attempt on your bank questions with
 * mark-as-right/wrong controls, plus the answer-release controls for
 * questions whose answers you hid.
 */
export default async function LecturerMarkingPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? []))
    redirect("/dashboard");

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader title="Marking" />
        <SetupNotice missing="app" />
      </>
    );
  }

  // The board fetches its own data client-side; the initial render shows
  // the empty state and the first load happens on mount.
  const initial: MarkingQuestion[] = [];

  return (
    <>
      <PageHeader
        title="Marking"
        description="Every attempt students made on your questions — mark written answers, and release hidden answers when you're ready."
      />
      <MarkingBoard initial={initial} />
    </>
  );
}
