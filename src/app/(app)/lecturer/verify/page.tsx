import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { VerifyQueue, type PendingAnswer } from "@/components/lecturer/verify-queue";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import type { ProfileLite } from "@/components/community/types";

export const metadata: Metadata = {
  title: "Verify answers · Lecturer",
  description: "Award lecturer-verified badges to the best community answers.",
};

/**
 * Verification queue — unverified answers (most upvoted first) with their
 * authors and thread titles. The service-role client is used because the
 * queue spans every student's replies; the page only renders after the
 * verify_answers capability gate.
 */
export default async function LecturerVerifyPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "verify_answers")) redirect("/dashboard");

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return (
      <>
        <PageHeader
          title="Verify answers"
          description="Award lecturer-verified badges to the best community answers."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const { data: replyRows } = await admin
    .from("discussion_replies")
    .select("id, discussion_id, user_id, body_md, upvotes, created_at")
    .eq("is_verified", false)
    .order("upvotes", { ascending: false })
    .limit(50);

  const replies = replyRows ?? [];

  const profileIds = [...new Set(replies.map((reply) => reply.user_id))];
  const discussionIds = [...new Set(replies.map((reply) => reply.discussion_id))];

  const [{ data: profileRows }, { data: discussionRows }] = await Promise.all([
    profileIds.length > 0
      ? admin.from("profiles").select("id, full_name, avatar_url, role").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileLite[] }),
    discussionIds.length > 0
      ? admin.from("discussions").select("id, title").in("id", discussionIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));
  const titleByDiscussion = new Map((discussionRows ?? []).map((row) => [row.id, row.title]));

  const answers: PendingAnswer[] = replies.map((reply) => ({
    replyId: reply.id,
    discussionId: reply.discussion_id,
    threadTitle: titleByDiscussion.get(reply.discussion_id) ?? "Discussion",
    bodyMd: reply.body_md,
    upvotes: reply.upvotes,
    createdAt: reply.created_at,
    author: profileById.get(reply.user_id) ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Verify answers"
        description="Stamp the best community answers with the verified badge."
        actions={
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <BadgeCheck className="text-primary size-4" aria-hidden />
            Verified answers get the badge — and earn their author 15 XP.
          </p>
        }
      />
      <VerifyQueue answers={answers} />
    </>
  );
}
