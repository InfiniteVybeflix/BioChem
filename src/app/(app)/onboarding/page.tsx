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
 */
export default async function OnboardingPage() {
  const supabase = await getSupabaseServerClient();
  const auth = supabase ? await getAuthContext() : null;
  if (!auth) redirect("/login?next=/onboarding");

  const { data: schools } = supabase
    ? await supabase
        .from("schools")
        .select("id, name, short_name, country, max_years, current_academic_year, year_advance_at")
        .eq("is_active", true)
        .order("name")
    : { data: [] };

  return (
    <section className="mx-auto max-w-xl py-10">
      <OnboardingWizard
        role={auth.profile.role}
        initialName={auth.profile.full_name}
        schools={schools ?? []}
      />
    </section>
  );
}
