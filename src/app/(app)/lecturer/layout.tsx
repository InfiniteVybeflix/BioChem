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
  if (auth.profile.role !== "lecturer" && auth.profile.role !== "admin") redirect("/dashboard");

  return (
    <section className="space-y-6">
      <PanelNav items={LECTURER_NAV} label="Lecturer panel sections" />
      {children}
    </section>
  );
}
