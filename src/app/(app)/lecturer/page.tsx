import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  BadgeCheck,
  BarChart3,
  BookOpenCheck,
  FileStack,
  Inbox,
  Megaphone,
  Send,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { classStats } from "@/lib/analytics/class";

export const metadata: Metadata = {
  title: "Lecturer overview",
  description: "Class counters, your published content and quick links to every lecturer tool.",
};

const QUICK_LINKS = [
  {
    href: "/lecturer/publish",
    label: "Publish content",
    description: "Notes, bank questions and past paper PDFs",
    icon: Send,
  },
  {
    href: "/lecturer/bulk",
    label: "Bulk upload",
    description: "Zip archives of markdown notes + JSON questions, or CSV",
    icon: Upload,
  },
  {
    href: "/lecturer/mocks",
    label: "Custom mocks",
    description: "Assemble question sets into timed class mocks",
    icon: FileStack,
  },
  {
    href: "/lecturer/class",
    label: "Class analytics",
    description: "Topic mastery, score bands and student progress",
    icon: BarChart3,
  },
  {
    href: "/lecturer/verify",
    label: "Verify answers",
    description: "Award the verified badge — students earn 15 XP",
    icon: BadgeCheck,
  },
] as const;

/** Lecturer overview — class aggregates plus this lecturer's own content. */
export default async function LecturerOverviewPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "view_class_analytics", auth.profile.staff_abilities ?? [])) redirect("/dashboard");

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return (
      <>
        <PageHeader
          title="Lecturer overview"
          description="Class counters, your published content and quick links to every lecturer tool."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const userId = auth.user.id;

  const [stats, myNotes, myAnnouncements] = await Promise.all([
    classStats(admin),
    admin
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .or(`published_by.eq.${userId},contributed_by.eq.${userId}`),
    admin
      .from("announcements")
      .select("id, title, body_md, created_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const announcements = myAnnouncements.data ?? [];

  return (
    <>
      <PageHeader
        title={`Welcome, ${auth.profile.full_name.split(" ")[0]}`}
        description="Everything you need to publish material and keep the class on track."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={stats.studentCount}
          hint={`${stats.lecturerCount} lecturer${stats.lecturerCount === 1 ? "" : "s"} on the platform`}
          icon={<Users className="size-4" aria-hidden />}
        />
        <StatCard
          label="Mocks submitted"
          value={stats.attempts30d}
          hint="Exam attempts in the last 30 days"
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
        <StatCard
          label="Average score"
          value={stats.avgMockPct === null ? "—" : `${stats.avgMockPct}%`}
          hint="Mean percentage across 30-day attempts"
          icon={<BarChart3 className="size-4" aria-hidden />}
          tone={stats.avgMockPct !== null && stats.avgMockPct < 50 ? "amber" : "emerald"}
        />
        <StatCard
          label="Your published notes"
          value={myNotes.count ?? 0}
          hint="Live in the explore grid"
          icon={<BookOpenCheck className="size-4" aria-hidden />}
        />
        <StatCard
          label="Pending submissions"
          value={stats.pendingSubmissions}
          hint="Student contributions awaiting review"
          icon={<Inbox className="size-4" aria-hidden />}
          tone={stats.pendingSubmissions > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Unverified answers"
          value={stats.unverifiedAnswers}
          hint="Community replies you can badge"
          icon={<BadgeCheck className="size-4" aria-hidden />}
          tone={stats.unverifiedAnswers > 0 ? "amber" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card p-4 sm:p-5 lg:col-span-2">
          <h2 className="font-heading text-lg font-semibold">Lecturer tools</h2>
          <ul className="divide-border/60 mt-2 divide-y">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="focus-ring group flex items-center gap-3 rounded-lg px-1 py-3 transition-all hover:translate-x-0.5 motion-reduce:transition-none"
                >
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <link.icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="group-hover:text-primary block font-medium transition-colors">
                      {link.label}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {link.description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-card p-4 sm:p-5">
          <h2 className="font-heading text-lg font-semibold">Your recent announcements</h2>
          {announcements.length === 0 ? (
            <p className="text-muted-foreground mt-4 text-sm">
              You haven&apos;t posted an announcement yet — broadcast one from Admin → Broadcast and
              it will appear here.
            </p>
          ) : (
            <ul className="divide-border/60 mt-2 divide-y">
              {announcements.map((item) => (
                <li key={item.id} className="py-3">
                  <p className="flex items-start gap-2 text-sm font-medium">
                    <Megaphone className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                    {item.title}
                  </p>
                  <p className="text-muted-foreground mt-1 line-clamp-2 pl-6 text-xs">
                    {item.body_md}
                  </p>
                  <p className="text-muted-foreground/80 mt-1 pl-6 text-xs">
                    {format(parseISO(item.created_at), "d MMM yyyy, HH:mm")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
