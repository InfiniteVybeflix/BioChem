import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitNoteForm } from "@/components/exam/submit-note-form";
import { SubmitQuestionForm } from "@/components/exam/submit-question-form";
import type { FormTopic } from "@/components/exam/submit-note-form";
import { SubmissionsList, type SubmissionLite } from "@/components/exam/submissions-list";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "Submit notes and questions for lecturer review — earn XP and leaderboard credit when they're published.",
};

/**
 * Contribute page: note + question submission forms (validated with the shared
 * Zod schemas) and a live list of the user's own submissions with reviewer
 * feedback. Realtime updates arrive via the channel in <SubmissionsList>.
 *
 * Accepts ?unit=<id> (from a course-unit page) and ?topic=<slug> so the
 * note form opens pre-aimed at the right unit's topic.
 */
export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Contribute"
          description="Upload your notes and questions — lecturers review them, and your name goes on everything published."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const query = await searchParams;
  const firstParam = (value: string | string[] | undefined): string | null =>
    Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  const unitParam = firstParam(query.unit);
  const topicParam = firstParam(query.topic);

  const [topicsResult, submissionsResult] = await Promise.all([
    supabase
      .from("topics")
      .select("id, title, slug, zone, unit_id, units(code, name)")
      .order("order_index"),
    supabase
      .from("submissions")
      .select("id, type, title, status, review_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  // If the units join can't resolve yet (pending setup SQL) fall back to
  // a plain topic select so contributing keeps working.
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
      .order("order_index");
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

  // Pre-aim the form: explicit topic wins, else the first topic of the
  // unit the student arrived from.
  const initialTopicId = topicParam
    ? (topics.find((topic) => topic.slug === topicParam)?.id ?? undefined)
    : unitParam
      ? (topics.find((topic) => topic.unitId === unitParam)?.id ?? undefined)
      : undefined;

  // RLS scopes this to the signed-in user's own submissions.
  const submissions: SubmissionLite[] = (submissionsResult.data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
  }));

  return (
    <section>
      <PageHeader
        title="Contribute"
        description="Upload your notes and questions — lecturers review them, and your name goes on everything published. +25 XP per published contribution."
      />

      <Tabs defaultValue="note">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="note" className="flex-1 sm:flex-none">
            Submit a note
          </TabsTrigger>
          <TabsTrigger value="question" className="flex-1 sm:flex-none">
            Submit questions
          </TabsTrigger>
        </TabsList>
        <TabsContent value="note" className="mt-4">
          <div className="glass-card p-4 sm:p-6">
            <SubmitNoteForm topics={topics} initialTopicId={initialTopicId} />
          </div>
        </TabsContent>
        <TabsContent value="question" className="mt-4">
          <div className="glass-card p-4 sm:p-6">
            <SubmitQuestionForm topics={topics} initialTopicId={initialTopicId} />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-10">
        <h2 className="font-heading mb-3 text-lg font-semibold">Your submissions</h2>
        <SubmissionsList initialSubmissions={submissions} />
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
          <HeartHandshake className="size-3.5 shrink-0" aria-hidden />
          Reviews usually land within a few days — this list updates live when a lecturer makes a
          decision.
        </p>
      </div>
    </section>
  );
}
