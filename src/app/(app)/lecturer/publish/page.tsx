import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { PublishForms } from "@/components/lecturer/publish-forms";
import { NotesAssistant } from "@/components/ai/notes-assistant";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import type { FormTopic } from "@/components/exam/submit-note-form";

export const metadata: Metadata = {
  title: "Publish · Lecturer",
  description: "Publish notes, bank questions and past papers directly — no review queue.",
};

/** Lecturer publish page — direct publishing console (publish_content). */
export default async function LecturerPublishPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "publish_content")) redirect("/dashboard");

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Publish"
          description="Publish notes, bank questions and past papers directly — no review queue."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, title, slug, zone")
    .order("order_index", { ascending: true });

  const topics: FormTopic[] = topicRows ?? [];

  return (
    <>
      <PageHeader
        title="Publish"
        description="Publish notes, bank questions and past papers directly — no review queue."
      />
      <div className="glass-card p-4 sm:p-6">
        <PublishForms topics={topics} />
      </div>
      <div className="mt-6">
        <NotesAssistant
          topics={topics.map((topic) => ({ id: topic.id, title: topic.title, zone: topic.zone }))}
        />
      </div>
    </>
  );
}
