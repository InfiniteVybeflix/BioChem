import Link from "next/link";
import {
  ArrowRight,
  Atom,
  BookOpen,
  BrainCircuit,
  Calendar,
  ClipboardCheck,
  Download,
  FlaskConical,
  GraduationCap,
  Layers,
  MessagesSquare,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ZONES, APP_NAME } from "@/lib/constants";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { landingSettings } from "@/types/domain";

const FEATURES = [
  {
    icon: Layers,
    title: "Exam zones that match your course",
    description:
      "CAT 1, CAT 2 and Main Exam zones — each with a topic tree, LaTeX-rendered notes and an outcomes checklist tracking exactly what you must know.",
  },
  {
    icon: BrainCircuit,
    title: "AI tutor grounded in your notes",
    description:
      "Ask anything. Get answers that cite your actual course notes, in exam-answer, ELI5 or step-by-step mode — with full conversation memory.",
  },
  {
    icon: Atom,
    title: "Flashcards with real spaced repetition",
    description:
      "An SM-2 scheduling engine builds your daily review queue. Cards you struggle with come back sooner; mastered ones fade out.",
  },
  {
    icon: GraduationCap,
    title: "Mock exams with instant grading",
    description:
      "Configurable timers, auto-graded answers, question-by-question review and a score-history chart that shows your trajectory.",
  },
  {
    icon: Calendar,
    title: "Planner that actually plans",
    description:
      "Drag-and-drop timetable, exam countdowns, reminder alarms — and an AI assistant that fills your free evenings with the right revision.",
  },
  {
    icon: MessagesSquare,
    title: "Community with lecturer-verified answers",
    description:
      "Per-topic discussions, upvotes, @mentions and a realtime course chat room — with badges marking answers your lecturers verified.",
  },
  {
    icon: Trophy,
    title: "Credit where it's due",
    description:
      "Every contributed note carries its author's name, and the leaderboard ranks the classmates who lift the whole year group.",
  },
  {
    icon: Download,
    title: "Installable & offline-friendly",
    description:
      "A real PWA: notes, questions and attempted mocks cache for offline study, with background sync when you reconnect.",
  },
];

export default async function LandingPage() {
  // CMS-driven hero copy + the supported-schools list (both editable
  // live from the operations console; the platform starts empty).
  const supabase = await getSupabaseServerClient();
  let hero = {
    hero_title: "Master biochemistry.\nTogether.",
    hero_subtitle:
      "Exam zones, an AI tutor grounded in your own notes, spaced-repetition flashcards, mock exams, a smart planner and a verified-answer community — one installable app for your entire course.",
    schools_blurb: "BioChem is live for students at these schools.",
  };
  let schools: { id: string; name: string; short_name: string; country: string }[] = [];
  if (supabase) {
    const [{ data: settingsRow }, { data: schoolRows }] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "landing").maybeSingle(),
      supabase
        .from("schools")
        .select("id, name, short_name, country")
        .eq("is_active", true)
        .order("name")
        .limit(24),
    ]);
    if (settingsRow) hero = { ...hero, ...landingSettings(settingsRow.value) };
    schools = schoolRows ?? [];
  }
  const [heroLine1, ...heroRest] = hero.hero_title.split("\n");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Nav */}
      <header className="border-border/50 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="focus-ring flex items-center gap-2.5 rounded-lg"
            aria-label={`${APP_NAME} home`}
          >
            <span className="from-primary to-primary/70 text-primary-foreground shadow-primary/25 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
              <FlaskConical className="size-5" aria-hidden />
            </span>
            <span className="font-heading text-lg font-bold tracking-tight">
              Bio<span className="text-primary">Chem</span>
            </span>
          </Link>
          <nav
            className="text-muted-foreground hidden items-center gap-6 text-sm font-medium md:flex"
            aria-label="Page sections"
          >
            <a href="#zones" className="hover:text-foreground transition-colors">
              Zones
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <Link href="/explore" className="hover:text-foreground transition-colors">
              Browse notes
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="shadow-primary/25 shadow-lg">
              <Link href="/signup">
                Get started
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/8 text-primary gap-1.5 rounded-full px-3 py-1"
            >
              <Sparkles className="size-3.5" aria-hidden />
              Built by students, for the whole class
            </Badge>
            <h1 className="font-heading mt-6 text-4xl leading-[1.05] font-bold tracking-tight sm:text-6xl">
              {heroLine1}
              {heroRest.length > 0 ? (
                <>
                  <br />
                  <span className="text-gradient">{heroRest.join(" ")}</span>
                </>
              ) : null}
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-xl text-base text-balance sm:text-lg">
              {hero.hero_subtitle}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="shadow-primary/25 h-12 gap-2 px-7 text-base shadow-xl"
              >
                <Link href="/signup">
                  Start studying free
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 gap-2 px-7 text-base">
                <Link href="/explore">
                  <BookOpen className="size-4" aria-hidden />
                  Browse public notes
                </Link>
              </Button>
            </div>
            <p className="text-muted-foreground mt-4 text-xs">
              Guest browsing is free — sign in to attempt mocks, track outcomes and chat.
            </p>
          </div>

          {/* Floating equation cards — decorative design elements */}
          <div
            className="pointer-events-none absolute top-24 left-[6%] hidden animate-[orb-drift_18s_ease-in-out_infinite_alternate] lg:block"
            aria-hidden
          >
            <div className="glass-card text-primary/80 px-4 py-3 font-mono text-sm">
              v = <span className="italic">V</span>
              <sub>max</sub>[S] / (<span className="italic">K</span>
              <sub>m</sub> + [S])
            </div>
          </div>
          <div
            className="pointer-events-none absolute top-40 right-[7%] hidden animate-[orb-drift_22s_ease-in-out_infinite_alternate-reverse] lg:block"
            aria-hidden
          >
            <div className="glass-card text-primary/80 px-4 py-3 font-mono text-sm">
              ΔG = ΔG°′ + RT ln Q
            </div>
          </div>
          <div
            className="pointer-events-none absolute bottom-10 left-[14%] hidden animate-[orb-drift_26s_ease-in-out_infinite_alternate] lg:block"
            aria-hidden
          >
            <div className="glass-card text-primary/80 px-4 py-3 font-mono text-sm">
              glucose + 2 NAD⁺ → 2 pyruvate + 2 ATP
            </div>
          </div>
        </section>

        {/* Supported schools — driven by the operations console */}
        {schools.length > 0 ? (
          <section
            className="mx-auto max-w-6xl px-4 pb-4 sm:px-6"
            aria-labelledby="schools-heading"
          >
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="schools-heading"
                className="font-heading text-2xl font-bold tracking-tight sm:text-3xl"
              >
                Supported schools
              </h2>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                {hero.schools_blurb}
              </p>
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
              {schools.map((school) => (
                <li
                  key={school.id}
                  className="glass-card flex items-center gap-2 rounded-full px-4 py-2 text-sm"
                >
                  <GraduationCap className="text-primary size-4" aria-hidden />
                  <span className="font-medium">{school.name}</span>
                  <span className="text-muted-foreground text-xs">· {school.short_name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Zones */}
        <section
          id="zones"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
          aria-labelledby="zones-heading"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="zones-heading"
              className="font-heading text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Three zones. One goal.
            </h2>
            <p className="text-muted-foreground mt-3">
              The platform is organised the way your course is examined — pick your zone and
              everything inside follows the syllabus.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {ZONES.map((zone, index) => (
              <Link
                key={zone.id}
                href="/explore"
                className="glass-card group hover:border-primary/40 hover:shadow-primary/10 focus-ring p-6 transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-primary/12 font-heading text-primary flex size-11 items-center justify-center rounded-xl text-sm font-bold">
                    0{index + 1}
                  </span>
                  <ArrowRight
                    className="text-muted-foreground/50 group-hover:text-primary size-5 transition-all group-hover:translate-x-1"
                    aria-hidden
                  />
                </div>
                <h3 className="font-heading mt-4 text-xl font-semibold">{zone.label}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{zone.description}</p>
                <p className="text-primary mt-4 text-xs font-medium">
                  Topic tree · notes · outcomes · question bank · mocks →
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
          aria-labelledby="features-heading"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="features-heading"
              className="font-heading text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Everything your revision needs
            </h2>
            <p className="text-muted-foreground mt-3">
              No half-built tools. Each feature is complete, connected and works on your phone.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="glass-card hover:border-primary/30 p-5 transition-colors"
              >
                <span className="bg-primary/12 text-primary flex size-10 items-center justify-center rounded-xl">
                  <feature.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{feature.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
          aria-labelledby="how-heading"
        >
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="how-heading"
              className="font-heading text-3xl font-bold tracking-tight sm:text-4xl"
            >
              From zero to contributing in 5 minutes
            </h2>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: ClipboardCheck,
                title: "Create your free account",
                text: "Sign up with your university email. Your dashboard, streak and outcome tracker start instantly.",
              },
              {
                icon: Users,
                title: "Study & practise",
                text: "Work through zone notes, tick outcomes as you master them, drill flashcards and sit timed mocks.",
              },
              {
                icon: BookOpen,
                title: "Give back",
                text: "Upload your own notes and questions. Lecturers review them, and your name goes on every published note.",
              },
            ].map((step, index) => (
              <li key={step.title} className="glass-card relative p-6">
                <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-xs font-bold">
                  Step {index + 1}
                </span>
                <span className="bg-primary/12 text-primary flex size-11 items-center justify-center rounded-xl">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <h3 className="font-heading mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="glass-card relative overflow-hidden p-8 text-center sm:p-14">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--orb-1),transparent_65%)]"
              aria-hidden
            />
            <h2 className="font-heading relative text-3xl font-bold tracking-tight sm:text-4xl">
              Your classmates are already revising here
            </h2>
            <p className="text-muted-foreground relative mx-auto mt-3 max-w-xl">
              Free forever, no ads in your face (sponsors are opt-in), and your data stays with your
              class. Install it like an app and study offline.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="shadow-primary/25 h-12 gap-2 px-8 text-base shadow-xl"
              >
                <Link href="/signup">
                  Create your account
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-border/60 bg-background/60 border-t backdrop-blur-xl">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
          <p className="flex items-center gap-2">
            <FlaskConical className="text-primary size-4" aria-hidden />
            {APP_NAME} — the complete biochemistry study platform.
          </p>
          <nav className="flex gap-5" aria-label="Footer">
            <Link href="/explore" className="hover:text-foreground">
              Notes
            </Link>
            <Link href="/jobs" className="hover:text-foreground">
              Jobs
            </Link>
            <Link href="/about" className="hover:text-foreground">
              About
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <p className="text-muted-foreground/70 text-xs">Built by Aevibron</p>
        </div>
      </footer>
    </div>
  );
}
