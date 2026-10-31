import type { Metadata } from "next";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { OutcomesMatrix } from "@/components/exam/outcomes-matrix";
import type { MasteredMap } from "@/components/exam/outcome-checklist";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Outcomes matrix",
  description:
    "Every course outcome, grouped by zone and topic — tick them off as you master them.",
};

/**
 * Outcomes matrix: server-fetches topics, outcomes and the user's progress,
 * then hands everything to the interactive matrix.
 */
export default async function OutcomesPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title="Outcomes matrix" />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const [topicsResult, outcomesResult, progressResult] = await Promise.all([
    supabase.from("topics").select("id, title, slug, zone, order_index").order("order_index"),
    supabase
      .from("outcomes")
      .select("id, code, statement, topic_id, order_index")
      .order("order_index"),
    supabase.from("user_outcome_progress").select("outcome_id, mastered"),
  ]);

  const mastered: MasteredMap = {};
  for (const row of progressResult.data ?? []) mastered[row.outcome_id] = row.mastered;

  return (
    <section>
      <PageHeader
        title="Outcomes matrix"
        description="The full syllabus, outcome by outcome. Tick what you've mastered — each one earns you +3 XP."
      />
      <OutcomesMatrix
        topics={(topicsResult.data ?? []).map((topic) => ({
          id: topic.id,
          title: topic.title,
          slug: topic.slug,
          zone: topic.zone,
          orderIndex: topic.order_index,
        }))}
        outcomes={(outcomesResult.data ?? []).map((outcome) => ({
          id: outcome.id,
          code: outcome.code,
          statement: outcome.statement,
          topicId: outcome.topic_id,
          orderIndex: outcome.order_index,
        }))}
        initialMastered={mastered}
      />
    </section>
  );
}
