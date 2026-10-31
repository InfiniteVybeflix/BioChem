import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AuthedShell } from "@/components/layout/authed-shell";
import { getAuthContext } from "@/lib/supabase/server";
import { syncAcademicYear } from "@/lib/schools";

/**
 * Layout for every authenticated page. Session + profile are resolved on
 * the server, then the three gates run in order:
 *
 *   1. suspended  → back to sign-in with a clear message (no shell).
 *   2. staff not yet activated → the pending-approval holding page.
 *   3. student who hasn't onboarded → the school/year wizard.
 *
 * Finally, students get the academic-year sync (a cheap, idempotent
 * RPC that moves them up a year when their school's timeline says so)
 * before the shell renders — so the dashboard is always personalised
 * to their current year.
 */
export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/login");
  }

  const { profile } = auth;

  if (profile.suspended) {
    redirect(
      "/login?message=" +
        encodeURIComponent(
          "This account has been suspended. Contact support if you believe that's a mistake.",
        ),
    );
  }

  if (profile.role === "lecturer" && !profile.approved) {
    redirect("/pending-approval");
  }

  if (profile.role === "student" && !profile.onboarding_done) {
    redirect("/onboarding");
  }

  if (profile.role === "student" && profile.school_id) {
    await syncAcademicYear();
  }

  return <AuthedShell profile={profile}>{children}</AuthedShell>;
}
