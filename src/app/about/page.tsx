import Link from "next/link";
import { FlaskConical, Sparkles, CalendarClock, Users, Briefcase, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { PublicHeader } from "@/components/layout/public-header";

export const metadata = { title: "About" };

const PILLARS = [
  {
    icon: FlaskConical,
    title: "Exam zones that mirror your course",
    body: "CAT 1, CAT 2 and main-exam zones organise every topic, note and outcome exactly the way your lecturers examine it — with timed mock exams, instant grading and score history.",
  },
  {
    icon: Sparkles,
    title: "An AI tutor that knows your syllabus",
    body: "Ask anything in plain language. The tutor answers grounded in your course notes, explains exam-style or step-by-step, sketches the equations in proper notation, and pulls in diagrams from open scientific archives when a picture says more.",
  },
  {
    icon: CalendarClock,
    title: "A planner that keeps you honest",
    body: "Drag-and-drop timetable, exam countdowns, reminders that actually reach your phone, streaks for daily practice, and an AI week-planner that turns your goals into a schedule.",
  },
  {
    icon: Users,
    title: "A community, not a comment section",
    body: "Per-topic discussions with upvotes and lecturer-verified answers, plus realtime study groups and direct messages — encrypted, with photos, voice notes and files.",
  },
  {
    icon: Briefcase,
    title: "From lecture hall to lab bench",
    body: "A curated board of internships, entry-level roles and graduate positions, with one-tap enquiries handled by the team.",
  },
  {
    icon: ShieldCheck,
    title: "Class-owned and free",
    body: "Every note carries its author's name. Students contribute, lecturers verify, and the platform team keeps the lights on. No paywalls, no ads in your face.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PublicHeader />
      <PageHeader
        title="About BioChem"
        description="The complete biochemistry study platform — exam zones, AI tutor, planner, community and jobs in one installable app."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {PILLARS.map((pillar) => (
          <section key={pillar.title} className="glass-card p-5">
            <pillar.icon className="text-primary size-5" aria-hidden />
            <h2 className="mt-3 font-semibold">{pillar.title}</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{pillar.body}</p>
          </section>
        ))}
      </div>

      <section className="glass-card mt-6 p-5">
        <h2 className="font-semibold">Who runs BioChem?</h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          BioChem is run by the class, for the class. Lecturers publish and verify content; students
          contribute notes, questions and flashcards; and a small platform team reviews everything,
          keeps the lights on and answers support tickets. If something looks wrong, tell us —
          seriously.
        </p>
        <Link
          href="/support"
          className="text-primary mt-3 inline-block text-sm font-medium underline underline-offset-4"
        >
          Contact the team →
        </Link>
      </section>

      <p className="text-muted-foreground/70 mt-8 text-center text-xs">
        BioChem — built by Aevibron.
      </p>
    </div>
  );
}
