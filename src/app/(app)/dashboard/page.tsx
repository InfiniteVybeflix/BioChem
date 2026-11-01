import Link from "next/link";
import {
  ArrowRight,
  Atom,
  BookOpen,
  BrainCircuit,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  Flame,
  GraduationCap,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatCard } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { AdSlot } from "@/components/ads/ad-slot";
import { NewsStrip, type NewsListItem } from "@/components/news/news-cards";
import { loadNewsSurface } from "@/lib/news/queries";
import { Markdown } from "@/components/markdown/markdown";
import { getAuthContext } from "@/lib/supabase/server";
import { greetingForHour, ZONES } from "@/lib/constants";
import { daysUntil } from "@/lib/time";
import type { Database, ExamZone } from "@/types/domain";
import { dailyQuestionPayload } from "@/types/domain";

export const metadata = { title: "Dashboard" };

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type DailyQuestion = Database["public"]["Tables"]["daily_questions"]["Row"];
type PlanEvent = Database["public"]["Tables"]["plan_events"]["Row"];

export default async function DashboardPage() {
  const auth = await getAuthContext();
  if (!auth) return null;
  const { user, profile, supabase } = auth;
  if (!supabase) {
    return <SetupNotice missing="app" />;
  }

  const hour = new Date().getHours();
  const firstName = profile.full_name.split(" ")[0];

  // Streak heartbeat — idempotent per day; awards the daily-active XP.
  void supabase.rpc("touch_streak").then(
    () => undefined,
    () => undefined,
  );

  const today = new Date().toISOString().slice(0, 10);

  const [outcomesTotal, outcomesMastered, dailyQuestions, upcomingExams, recentAttempts, topics] =
    await Promise.all([
      supabase.from("outcomes").select("id", { count: "exact", head: true }),
      supabase
        .from("user_outcome_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("mastered", true),
      supabase
        .from("daily_questions")
        .select("id, payload, is_correct, answered_at")
        .eq("user_id", user.id)
        .eq("for_date", today)
        .order("created_at", { ascending: true }),
      supabase
        .from("plan_events")
        .select("id, title, date, start_time")
        .eq("user_id", user.id)
        .eq("type", "exam")
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(4) as PromiseLike<{ data: PlanEvent[] | null }>,
      supabase
        .from("exam_attempts")
        .select("id, zone, score, max_score, submitted_at")
        .eq("user_id", user.id)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(3),
      supabase.from("topics").select("id, zone").limit(1000),
    ]);

  const total = outcomesTotal.count ?? 0;
  const mastered = outcomesMastered.count ?? 0;
  const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const answeredToday = (dailyQuestions.data ?? []).filter((q) => q.answered_at).length;
  const unansweredToday = (dailyQuestions.data ?? []).find((q) => !q.answered_at);

  // News strip — only when the console news desk is enabled for the app.
  const news = await loadNewsSurface(supabase, 3);
  const newsStrip =
    news.settings.enabled && news.settings.show_in_app ? news.articles : ([] as NewsListItem[]);

  // Zone mastery counts for the quick-entry cards.
  const zoneTotals = new Map<ExamZone, number>([
    ["cat1", 0],
    ["cat2", 0],
    ["main", 0],
  ]);
  for (const topic of topics.data ?? []) {
    const current = zoneTotals.get(topic.zone);
    if (current !== undefined) zoneTotals.set(topic.zone, current + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={
          <>
            {greetingForHour(hour)}, {firstName}{" "}
            <span aria-hidden className="inline-block">
              {hour < 12 ? "☀️" : hour < 18 ? "🧪" : "🌙"}
            </span>
          </>
        }
        description={
          profile.schools && profile.year_of_study
            ? `${profile.schools.name} · Year ${profile.year_of_study}${
                profile.schools.current_academic_year
                  ? ` · ${profile.schools.current_academic_year}`
                  : ""
              } — your dashboard follows your year, but every other year's material stays open to you.`
            : "Here's where your revision stands today."
        }
        actions={
          <Button asChild className="shadow-primary/25 gap-2 shadow-lg">
            <Link href="/mocks">
              <GraduationCap className="size-4" aria-hidden />
              Take a mock exam
            </Link>
          </Button>
        }
      />

      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Study streak"
          value={`${profile.streak_count} ${profile.streak_count === 1 ? "day" : "days"}`}
          hint={`Longest: ${profile.longest_streak} days`}
          icon={<Flame className="size-4" aria-hidden />}
          tone="amber"
        />
        <StatCard
          label="Total XP"
          value={profile.xp.toLocaleString()}
          hint="Earn XP from mocks, outcomes & flashcards"
          icon={<Zap className="size-4" aria-hidden />}
          tone="primary"
        />
        <StatCard
          label="Outcomes mastered"
          value={`${mastered} / ${total}`}
          hint={`${masteryPct}% of the syllabus checklist`}
          icon={<Target className="size-4" aria-hidden />}
          tone="emerald"
        />
        <StatCard
          label="Today's questions"
          value={`${answeredToday} / ${dailyQuestions.data?.length ?? 0}`}
          hint={
            (dailyQuestions.data ?? []).length > 0
              ? unansweredToday
                ? "You have questions waiting"
                : "All done for today"
              : "Generate your set in Question of the Day"
          }
          icon={<Sparkles className="size-4" aria-hidden />}
        />
      </div>

      {/* Sponsored banner — top of the dashboard. */}
      <AdSlot placement="banner" />

      {/* News & updates strip — CMS-managed from the console news desk. */}
      {newsStrip.length > 0 ? <NewsStrip articles={newsStrip as NewsListItem[]} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: zones + question of the day */}
        <div className="space-y-6 lg:col-span-2">
          {/* Zone quick entries */}
          <section aria-labelledby="zones-heading">
            <h2 id="zones-heading" className="font-heading mb-3 text-lg font-semibold">
              Exam zones
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {ZONES.map((zone) => (
                <Link
                  key={zone.id}
                  href={zone.href}
                  className="glass-card group hover:border-primary/40 focus-ring p-4 transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-heading font-semibold">{zone.short}</p>
                    <ArrowRight
                      className="text-muted-foreground/50 group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {zoneTotals.get(zone.id) ?? 0} topics
                  </p>
                  <div
                    className="text-primary mt-3 flex items-center gap-1.5 text-xs font-medium"
                    aria-hidden
                  >
                    <BookOpen className="size-3.5" /> Notes · questions · mocks
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Question of the day */}
          <section className="glass-card p-5" aria-labelledby="daily-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="daily-heading" className="font-heading text-lg font-semibold">
                Question of the Day
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary gap-1.5">
                <Link href="/ai/daily">
                  Open <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
            {(dailyQuestions.data ?? []).length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                No questions generated yet — open Question of the Day to generate your set for
                today.
              </p>
            ) : unansweredToday ? (
              <div className="mt-3 space-y-2">
                <Markdown>{dailyQuestionPayload(unansweredToday.payload)?.stem ?? ""}</Markdown>
                <p className="text-muted-foreground text-xs">
                  Answer it and every remaining question on the daily page.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                All of today&apos;s questions answered — streak secured. 🎯
              </p>
            )}
          </section>

          {/* Recent mocks */}
          <section className="glass-card p-5" aria-labelledby="mocks-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="mocks-heading" className="font-heading text-lg font-semibold">
                Recent mocks
              </h2>
              <Button asChild variant="ghost" size="sm" className="text-primary gap-1.5">
                <Link href="/mocks">
                  All mocks <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
            {(recentAttempts.data ?? []).length === 0 ? (
              <p className="text-muted-foreground mt-2 text-sm">
                You haven&apos;t sat a mock yet — your first one takes 15 minutes and shows you
                exactly what to revise.
              </p>
            ) : (
              <ul className="divide-border/60 mt-3 divide-y">
                {(recentAttempts.data ?? []).map((attempt) => {
                  const pct =
                    Number(attempt.max_score) > 0
                      ? Math.round((Number(attempt.score) / Number(attempt.max_score)) * 100)
                      : 0;
                  return (
                    <li key={attempt.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium capitalize">
                          {attempt.zone === "cat1"
                            ? "CAT 1"
                            : attempt.zone === "cat2"
                              ? "CAT 2"
                              : "Main"}{" "}
                          mock
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {attempt.submitted_at
                            ? new Date(attempt.submitted_at).toLocaleDateString()
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} className="hidden w-24 sm:flex" aria-hidden />
                        <Badge
                          variant={pct >= 65 ? "default" : pct >= 50 ? "secondary" : "destructive"}
                        >
                          {pct}%
                        </Badge>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/mocks/${attempt.id}`}>Review</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right column: mastery + exams + quick actions */}
        <div className="space-y-6">
          <section className="glass-card p-5" aria-labelledby="mastery-heading">
            <h2 id="mastery-heading" className="font-heading text-lg font-semibold">
              Outcome mastery
            </h2>
            <div className="mt-4 flex items-end justify-between">
              <p className="font-heading text-primary text-4xl font-bold tabular-nums">
                {masteryPct}%
              </p>
              <p className="text-muted-foreground text-xs">
                {mastered} of {total} outcomes
              </p>
            </div>
            <Progress value={masteryPct} className="mt-3" />
            <Button asChild variant="outline" size="sm" className="mt-4 w-full gap-2">
              <Link href="/outcomes">
                <CalendarCheck className="size-4" aria-hidden />
                Open the checklist
              </Link>
            </Button>
          </section>

          <section className="glass-card p-5" aria-labelledby="exams-heading">
            <h2 id="exams-heading" className="font-heading text-lg font-semibold">
              Upcoming exams
            </h2>
            {(upcomingExams.data ?? []).length === 0 ? (
              <>
                <p className="text-muted-foreground mt-2 text-sm">
                  No exam dates added yet. Add your CAT and Main Exam dates to get live countdowns
                  and reminders.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full gap-2">
                  <Link href="/planner">
                    <Calendar className="size-4" aria-hidden />
                    Add in Planner
                  </Link>
                </Button>
              </>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {(upcomingExams.data ?? []).map((exam) => {
                  const days = exam.date ? daysUntil(exam.date) : 0;
                  return (
                    <li key={exam.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{exam.title}</p>
                        <p className="text-muted-foreground text-xs">{exam.date}</p>
                      </div>
                      <Badge
                        variant={days <= 7 ? "destructive" : "secondary"}
                        className="tabular-nums"
                      >
                        {days === 0 ? "Today" : `${days}d`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="glass-card p-5" aria-labelledby="quick-heading">
            <h2 id="quick-heading" className="font-heading text-lg font-semibold">
              Jump back in
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {[
                { href: "/flashcards", label: "Flashcards", icon: Atom },
                { href: "/ai/tutor", label: "AI Tutor", icon: BrainCircuit },
                { href: "/questions", label: "Questions", icon: ClipboardCheck },
                { href: "/community", label: "Community", icon: BookOpen },
              ].map((item) => (
                <Button
                  key={item.href}
                  asChild
                  variant="outline"
                  className="h-auto flex-col gap-1.5 py-3 text-xs"
                >
                  <Link href={item.href}>
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </section>

          {/* Sponsored side rail — end of the dashboard right column. */}
          <AdSlot placement="sidebar" />
        </div>
      </div>
    </div>
  );
}
