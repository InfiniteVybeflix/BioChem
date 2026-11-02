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

/**
 * Lecturer publish page — direct publishing console (publish_content).
 * Accepts ?unit=<id> and ?topic=<slug> (from a course-unit page) so the
 * note form opens pre-aimed at that unit's first topic.
 */
export default async function LecturerPublishPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? []))
    redirect("/dashboard");

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

  const query = await searchParams;
  const firstParam = (value: string | string[] | undefined): string | null =>
    Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  const unitParam = firstParam(query.unit);
  const topicParam = firstParam(query.topic);

  // Unit-aware topic list; falls back to a plain select when the units
  // join can't resolve yet (pending setup SQL).
  const topicsResult = await supabase
    .from("topics")
    .select("id, title, slug, zone, unit_id, units(code, name)")
    .order("order_index", { ascending: true });
  type TopicOptionRow = {
    id: string;
    title: string;
    slug: string;
    zone: FormTopic["zone"];
    unit_id: string | null;
    units: { code: string; name: string } | null;
  };
  let topicRows = (topicsResult.data ?? []) as unknown as TopicOptionRow[];
  if (topicsResult.error) {
    const fallback = await supabase
      .from("topics")
      .select("id, title, slug, zone, unit_id")
      .order("order_index", { ascending: true });
    topicRows = (fallback.data ?? []) as unknown as TopicOptionRow[];
  }

  const topics: FormTopic[] = topicRows.map((topic) => ({
    id: topic.id,
    title: topic.title,
    slug: topic.slug,
    zone: topic.zone,
    unitId: topic.unit_id ?? null,
    unitCode: topic.units?.code ?? null,
    unitName: topic.units?.name ?? null,
  }));

  const initialTopicId = topicParam
    ? (topics.find((topic) => topic.slug === topicParam)?.id ?? undefined)
    : unitParam
      ? (topics.find((topic) => topic.unitId === unitParam)?.id ?? undefined)
      : undefined;

  return (
    <>
      <PageHeader
        title="Publish"
        description="Publish notes, bank questions and past papers directly — no review queue."
      />
      <div className="glass-card p-4 sm:p-6">
        <PublishForms topics={topics} initialTopicId={initialTopicId} />
      </div>
      <div className="mt-6">
        <NotesAssistant
          topics={topics.map((topic) => ({ id: topic.id, title: topic.title, zone: topic.zone }))}
        />
      </div>
    </>
  );
}
