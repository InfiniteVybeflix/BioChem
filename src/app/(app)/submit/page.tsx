import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitNoteForm } from "@/components/exam/submit-note-form";
import { SubmitQuestionForm } from "@/components/exam/submit-question-form";
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
 */
export default async function SubmitPage() {
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

  const [topicsResult, submissionsResult] = await Promise.all([
    supabase.from("topics").select("id, title, slug, zone").order("order_index"),
    supabase
      .from("submissions")
      .select("id, type, title, status, review_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const topics = (topicsResult.data ?? []).map((topic) => ({
    id: topic.id,
    title: topic.title,
    slug: topic.slug,
    zone: topic.zone,
  }));

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
            <SubmitNoteForm topics={topics} />
          </div>
        </TabsContent>
        <TabsContent value="question" className="mt-4">
          <div className="glass-card p-4 sm:p-6">
            <SubmitQuestionForm topics={topics} />
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
