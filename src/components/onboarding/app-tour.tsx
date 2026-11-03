"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The welcome tour — a short guided walk around the app shown once after a
 * student finishes onboarding (and replayable from /dashboard?tour=1).
 *
 * Each stop spotlights a real navigation target so new students learn
 * "what is where" instead of reading a manual. Stops whose target cannot
 * be found or is hidden (e.g. the collapsed mobile drawer) gracefully fall
 * back to a centred card, so the tour always works on every screen size.
 */

const TOUR_FLAG_DONE = "biochem.tour.done.v1";
const TOUR_FLAG_PENDING = "biochem.tour.pending.v1";

interface TourStep {
  /** CSS selector for the element to spotlight; omit for a centred card. */
  selector?: string;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to BioChem!",
    body: "Ten seconds and you'll know where everything lives. This little tour points out the places you'll use every day — you can skip it whenever you like.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/units"]',
    title: "Course Units — your syllabus home",
    body: "Every note is filed under a topic inside your units. Open a unit, tap a topic and the notes open straight away.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/zones"]',
    title: "Exam Zones — CAT 1, CAT 2 & Main",
    body: "Your course is split the same way your exams are. Each zone gathers the topics, notes and questions that exam draws from.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/questions"]',
    title: "Question Bank — practise anything",
    body: "Browse every published question, filter by topic, difficulty or type, and attempt them one by one.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/mocks"]',
    title: "Mock Exams — the real thing, timed",
    body: "Build a timed mock from the question bank, sit it under exam conditions and watch your score trend grow after every submission.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/ai/practice"]',
    title: "AI Practice — questions on demand",
    body: "Ask the AI to generate fresh practice questions for any topic — MCQs or written answers — then reveal model answers when you're ready.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/ai/daily"]',
    title: "Question of the Day — keep the streak",
    body: "One question lands here every day. Answering it keeps your streak alive and earns XP towards the leaderboard.",
  },
  {
    selector: 'nav[aria-label="Main navigation"] a[href="/outcomes"]',
    title: "Outcomes — see what you've mastered",
    body: "Every syllabus outcome is tracked here. Tick them off as you master them and the dashboard shows exactly what to revise next.",
  },
  {
    title: "You're all set!",
    body: "That's the tour — everything else you'll discover as you go. Stuck anywhere? Support is one tap away in the sidebar.",
    cta: { label: "Start exploring", href: "/dashboard" },
  },
];

/** Dashboard header button that restarts the welcome tour on demand. */
export function TourReplayButton() {
  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={() => window.dispatchEvent(new CustomEvent("biochem:start-tour"))}
    >
      <Compass className="size-4" aria-hidden />
      Replay tour
    </Button>
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOT_PAD = 6;

function measureTarget(selector: string): Rect | null {
  const element = document.querySelector(selector);
  if (!element) return null;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function AppTour() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(180);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const step = STEPS[stepIndex] ?? STEPS[0];
  const isLast = stepIndex === STEPS.length - 1;

  const finish = useCallback(() => {
    setActive(false);
    try {
      window.localStorage.setItem(TOUR_FLAG_DONE, "1");
      window.localStorage.removeItem(TOUR_FLAG_PENDING);
    } catch {
      // Storage can be unavailable (private mode) — the tour simply won't persist.
    }
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  // Start once: after onboarding (pending flag) or explicitly via ?tour=1.
  useEffect(() => {
    let pending = false;
    let done = false;
    try {
      pending = window.localStorage.getItem(TOUR_FLAG_PENDING) === "1";
      done = window.localStorage.getItem(TOUR_FLAG_DONE) === "1";
    } catch {
      pending = false;
    }
    const explicit = new URLSearchParams(window.location.search).get("tour") === "1";
    if (explicit || (pending && !done)) start();
  }, [start]);

  // The dashboard's “Replay tour” button restarts the tour live.
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener("biochem:start-tour", onStart);
    return () => window.removeEventListener("biochem:start-tour", onStart);
  }, [start]);

  // Track the spotlight target for the current step.
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSpot(step.selector ? measureTarget(step.selector) : null);
      });
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, { capture: true });
    };
  }, [active, step.selector, stepIndex]);

  // Keep the target in view when the step changes.
  useEffect(() => {
    if (!active || !step.selector) return;
    const element = document.querySelector(step.selector);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, step.selector, stepIndex]);

  // Measure the card so clamping keeps it fully on screen.
  useEffect(() => {
    if (!active) return;
    const element = cardRef.current;
    if (element) setCardHeight(element.getBoundingClientRect().height);
  }, [active, stepIndex, spot]);

  // Focus management + Escape to close.
  useEffect(() => {
    if (!active) return;
    nextButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, stepIndex]);

  if (!active) return null;

  const goNext = () => (isLast ? finish() : setStepIndex((index) => index + 1));
  const goBack = () => setStepIndex((index) => Math.max(0, index - 1));

  const spotlighted = spot !== null;
  const mobile = typeof window !== "undefined" && window.innerWidth < 640;

  // Card placement: bottom sheet on phones; anchored to the spotlight on
  // desktop (below it when possible, otherwise above, clamped to view).
  let cardStyle: React.CSSProperties;
  if (!spotlighted) {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(26rem, calc(100vw - 2rem))",
    };
  } else if (mobile) {
    cardStyle = { bottom: "1rem", left: "1rem", right: "1rem", width: "auto" };
  } else {
    const below = spot.top + spot.height + SPOT_PAD;
    const fitsBelow = below + cardHeight + 16 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(16, spot.top - cardHeight - 12 - SPOT_PAD);
    const left = Math.min(
      Math.max(16, spot.left),
      Math.max(16, window.innerWidth - 380),
    );
    cardStyle = { top, left, width: "min(22rem, calc(100vw - 2rem))" };
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome tour">
      {/* Dim everything; the spotlight ring is a hole punched via box-shadow. */}
      <div className="fixed inset-0 z-[90] bg-black/55" aria-hidden />

      {spotlighted ? (
        <div
          className="pointer-events-none fixed z-[95] rounded-xl ring-primary/90 transition-all duration-300"
          style={{
            top: spot.top - SPOT_PAD,
            left: spot.left - SPOT_PAD,
            width: spot.width + SPOT_PAD * 2,
            height: spot.height + SPOT_PAD * 2,
            boxShadow: "0 0 0 4px var(--primary), 0 0 0 9999px rgba(0, 0, 0, 0.55)",
          }}
          aria-hidden
        />
      ) : null}

      <div
        ref={cardRef}
        style={cardStyle}
        className="bg-background fixed z-[100] rounded-2xl border p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Compass className="size-5" aria-hidden />
          </span>
          <button
            type="button"
            onClick={finish}
            aria-label="Skip tour"
            className="text-muted-foreground hover:text-foreground focus-ring -mt-1 -mr-1 rounded-lg p-1.5 transition-colors"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <h2 className="font-heading mt-3 text-lg font-semibold">{step.title}</h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-6">{step.body}</p>

        {step.cta ? (
          <Button asChild className="focus-ring mt-3 w-full gap-2">
            <Link href={step.cta.href} onClick={finish}>
              <Check className="size-4" aria-hidden />
              {step.cta.label}
            </Link>
          </Button>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((entry, index) => (
              <span
                key={entry.title}
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  index === stepIndex ? "bg-primary" : "bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button variant="ghost" size="sm" className="focus-ring gap-1" onClick={goBack}>
                <ArrowLeft className="size-3.5" aria-hidden />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="focus-ring text-muted-foreground"
                onClick={finish}
              >
                Skip
              </Button>
            )}
            {!isLast ? (
              <Button
                ref={nextButtonRef}
                size="sm"
                className="focus-ring gap-1"
                onClick={goNext}
              >
                {stepIndex === 0 ? "Let's go" : "Next"}
                <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        <p className="text-muted-foreground/70 mt-3 text-center text-[11px]">
          Step {stepIndex + 1} of {STEPS.length} · press Esc to close
        </p>
      </div>
    </div>
  );
}
