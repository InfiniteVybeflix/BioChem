import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { ZoneCard } from "@/components/exam/zone-card";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { ZONES } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

export const metadata: Metadata = {
  title: "Exam zones",
  description: "CAT 1, CAT 2 and Main Exam zones — topic trees, notes, outcomes and questions.",
};

interface ZoneStats {
  notesCount: number;
  questionsCount: number;
  outcomesCount: number;
  masteredCount: number;
}

async function countNotesInZone(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
  zone: ExamZone,
): Promise<number> {
  const { count } = await supabase
    .from("notes")
    .select("id, topic:topics!inner(zone)", { count: "exact", head: true })
    .eq("status", "published")
    .eq("topic.zone", zone);
  return count ?? 0;
}

async function countQuestionsInZone(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
  zone: ExamZone,
): Promise<number> {
  const { count } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("zone", zone)
    .eq("status", "published");
  return count ?? 0;
}

async function countOutcomesInZone(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>,
  zone: ExamZone,
): Promise<number> {
  const { count } = await supabase
    .from("outcomes")
    .select("id, topic:topics!inner(zone)", { count: "exact", head: true })
    .eq("topic.zone", zone);
  return count ?? 0;
}

/**
 * Zones overview: three big cards with real content counts and the signed-in
 * user's outcome mastery per zone.
 */
export default async function ZonesPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Exam zones"
          description="Pick your zone — everything follows the syllabus."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const auth = await getAuthContext();

  // Outcome → zone mapping (public read) powers the mastery percentages.
  const [topicsResult, outcomesResult] = await Promise.all([
    supabase.from("topics").select("id, zone"),
    supabase.from("outcomes").select("id, topic_id"),
  ]);

  const topicZone = new Map<string, ExamZone>();
  for (const topic of topicsResult.data ?? []) topicZone.set(topic.id, topic.zone);

  const outcomesByZone = new Map<ExamZone, Set<string>>(
    ZONES.map((zone) => [zone.id, new Set<string>()]),
  );
  for (const outcome of outcomesResult.data ?? []) {
    const zone = topicZone.get(outcome.topic_id);
    if (zone) outcomesByZone.get(zone)?.add(outcome.id);
  }

  // The user's mastered outcomes (empty for fresh accounts).
  const masteredByZone = new Map<ExamZone, number>(ZONES.map((zone) => [zone.id, 0]));
  if (auth) {
    const { data: progressRows } = await supabase
      .from("user_outcome_progress")
      .select("outcome_id")
      .eq("user_id", auth.user.id)
      .eq("mastered", true);
    for (const row of progressRows ?? []) {
      for (const [zone, ids] of outcomesByZone) {
        if (ids.has(row.outcome_id)) {
          masteredByZone.set(zone, (masteredByZone.get(zone) ?? 0) + 1);
          break;
        }
      }
    }
  }

  const stats = await Promise.all(
    ZONES.map(async (zone): Promise<[ExamZone, ZoneStats]> => {
      const [notesCount, questionsCount, outcomesCount] = await Promise.all([
        countNotesInZone(supabase, zone.id),
        countQuestionsInZone(supabase, zone.id),
        countOutcomesInZone(supabase, zone.id),
      ]);
      return [
        zone.id,
        {
          notesCount,
          questionsCount,
          outcomesCount,
          masteredCount: masteredByZone.get(zone.id) ?? 0,
        },
      ];
    }),
  );
  const statsByZone = new Map(stats);

  return (
    <section>
      <PageHeader
        title="Exam zones"
        description="The platform is organised the way your course is examined — pick a zone and everything inside follows the syllabus."
      />

      <div className="grid gap-5 md:grid-cols-3">
        {ZONES.map((zone) => {
          const zoneStats = statsByZone.get(zone.id) ?? {
            notesCount: 0,
            questionsCount: 0,
            outcomesCount: 0,
            masteredCount: 0,
          };
          return (
            <ZoneCard
              key={zone.id}
              zone={zone}
              notesCount={zoneStats.notesCount}
              questionsCount={zoneStats.questionsCount}
              outcomesCount={zoneStats.outcomesCount}
              masteredCount={zoneStats.masteredCount}
            />
          );
        })}
      </div>

      <p className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
        <Layers className="size-3.5 shrink-0" aria-hidden />
        Counts reflect published content only. Mastery updates as you tick outcomes in each topic.
      </p>
    </section>
  );
}
