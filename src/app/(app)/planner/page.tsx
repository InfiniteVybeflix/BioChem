import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { PlannerView } from "@/components/planner/planner-view";
import { PomodoroTimer } from "@/components/planner/pomodoro-timer";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Planner — BioChem" };

/**
 * Planner hub: timetable, month calendar, exam countdowns and the AI week
 * planner. All plan_events are the signed-in user's own (RLS-enforced).
 */
export default async function PlannerPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Planner"
          description="Timetable, exams and an AI week planner in one place."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const [{ data: events }, { data: plans }] = await Promise.all([
    supabase.from("plan_events").select("*").order("start_time", { ascending: true }),
    supabase
      .from("study_plans")
      .select("id, user_id, title, source, raw_input, plan, active, created_at, updated_at")
      .eq("active", true)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title="Planner"
        description="Timetable, exams and an AI week planner in one place."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
        <PlannerView initialEvents={events ?? []} activePlans={plans ?? []} />
        <aside className="space-y-4">
          <PomodoroTimer />
          <div className="glass-card p-5">
            <h3 className="font-semibold">Focus rules that work</h3>
            <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-4 text-sm">
              <li>One topic per pomodoro — write it down before you start.</li>
              <li>Phone face-down, notifications off, timer visible.</li>
              <li>During breaks: stand, water, eyes off screens.</li>
              <li>After four rounds, take the long one — you earned it.</li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
