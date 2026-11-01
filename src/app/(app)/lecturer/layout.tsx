import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { PanelNav, type PanelNavItem } from "@/components/admin/panel-nav";
import { getAuthContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Lecturer panel",
  description:
    "Publish notes, questions and past papers, build custom mocks, track the class and verify answers.",
};

const LECTURER_NAV: PanelNavItem[] = [
  { href: "/lecturer", label: "Overview" },
  { href: "/lecturer/publish", label: "Publish" },
  { href: "/lecturer/bulk", label: "Bulk upload" },
  { href: "/lecturer/mocks", label: "Custom mocks" },
  { href: "/lecturer/class", label: "Class analytics" },
  { href: "/lecturer/verify", label: "Verify answers" },
];

/**
 * Lecturer panel layout — server-side role gate. The (app) layout has already
 * enforced sign-in; this adds the staff check (lecturers and admins) before
 * any sub-page data query runs.
 */
export default async function LecturerLayout({ children }: { children: ReactNode }) {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  const { profile } = auth;
  const isStaff = profile.role === "lecturer" || profile.role === "admin";
  // Students with console-granted abilities (class rep, assistant
  // lecturer…) also reach the panel — individual pages still enforce
  // their own capabilities.
  const hasAbilities = (profile.staff_abilities ?? []).length > 0;
  if (!isStaff && !hasAbilities) redirect("/dashboard");

  return (
    <section className="space-y-6">
      <PanelNav items={LECTURER_NAV} label="Lecturer panel sections" />
      {children}
    </section>
  );
}
