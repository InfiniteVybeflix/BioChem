import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set up your profile",
  robots: { index: false, follow: false },
};

/**
 * First-run onboarding: pick your school, pick your year of study.
 * Students then get a dashboard personalised to their year (with full
 * access to every other year's material), and the platform can roll
 * everyone forward automatically when the academic year turns.
 *
 * ⚠️ This route must live OUTSIDE the (app) group. The (app) layout
 * redirects every un-onboarded student to /onboarding — if this page
 * were inside that group, it would redirect to itself forever
 * (ERR_TOO_MANY_REDIRECTS, blank screen). The same applies to
 * /pending-approval. Both pages do their own auth below instead.
 *
 * Auth and the schools list resolve in parallel — the wizard renders
 * from server data with no client waterfall, so first paint is fast.
 */
export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/onboarding");

  const [auth, schoolsResult] = await Promise.all([
    getAuthContext(),
    supabase
      .from("schools")
      .select("id, name, short_name, country, max_years, current_academic_year, year_advance_at")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (!auth) redirect("/login?next=/onboarding");

  return (
    <section className="mx-auto max-w-xl py-10">
      <OnboardingWizard
        role={auth.profile.role}
        initialName={auth.profile.full_name}
        schools={schoolsResult.data ?? []}
      />
    </section>
  );
}
