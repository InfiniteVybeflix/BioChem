"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  Layers,
  Loader2,
  PartyPopper,
  RotateCw,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/common/ui-bits";
import { Markdown } from "@/components/markdown/markdown";
import { queuedJson } from "@/lib/offline-queue";
import { qualityFromUiRating, sm2Review, type Sm2State } from "@/lib/sm2";
import { cn } from "@/lib/utils";

/** One card in today's review queue (state is null for never-reviewed cards). */
export interface QueueCard {
  id: string;
  frontMd: string;
  backMd: string;
  topicTitle: string | null;
  state: Sm2State | null;
}

type Rating = "again" | "hard" | "good" | "easy";

interface SessionSummary {
  reviewed: number;
  goodish: number;
  xp: number;
}

const RATING_BUTTONS: {
  rating: Rating;
  label: string;
  key: string;
  className: string;
}[] = [
  {
    rating: "again",
    label: "Again",
    key: "1",
    className:
      "border-rose-500/50 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
  },
  {
    rating: "hard",
    label: "Hard",
    key: "2",
    className:
      "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
  },
  {
    rating: "good",
    label: "Good",
    key: "3",
    className: "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20",
  },
  {
    rating: "easy",
    label: "Easy",
    key: "4",
    className:
      "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
  },
];

/** Humanised SM-2 interval: 1d, 6d, 2w, 1mo, 1.5y … */
function humanizeDays(days: number): string {
  if (days < 7) return `${Math.max(1, Math.round(days))}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** Next-interval preview for a rating button, computed locally with SM-2. */
function previewInterval(state: Sm2State | null, rating: Rating): string {
  try {
    return humanizeDays(sm2Review(state, qualityFromUiRating(rating)).intervalDays);
  } catch {
    return "—";
  }
}

const COMPACT_MARKDOWN = "[&_h1]:mt-0 [&_h1]:text-xl [&_h2]:mt-0 [&_h2]:text-lg [&_h3]:mt-0";

/**
 * SM-2 review session: flip card, rate recall in four steps, repeat. Reviews
 * are POSTed through the offline queue so they survive a dropped connection.
 */
export function ReviewSession({ cards }: { cards: QueueCard[] }) {
  const router = useRouter();
  // The session works on a snapshot of the queue prop so a background refresh
  // of the page never disturbs in-progress state.
  const [sessionCards] = useState<QueueCard[]>(() => cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const card = index < sessionCards.length ? sessionCards[index] : null;
  const total = sessionCards.length;

  const flip = useCallback(() => {
    setFlipped((prev) => !prev);
  }, []);

  const rate = useCallback(
    (rating: Rating) => {
      if (!card || busy || summary !== null || !flipped) return;

      setBusy(true);
      let earnedXp = 0;
      const goodish = rating === "good" || rating === "easy";

      void (async () => {
        try {
          const result = await queuedJson("/api/flashcards/review", "POST", {
            flashcardId: card.id,
            rating,
          });
          if (result.ok) {
            if (result.queued) {
              // Stored in IndexedDB — the replay awards XP server-side later.
              earnedXp = goodish ? 1 : 0;
            } else {
              const body = result.body as { xpAwarded?: boolean };
              earnedXp = body.xpAwarded === true ? 1 : 0;
            }
          } else {
            toast.error("Could not save this review — try again");
          }
        } catch {
          toast.error("Network error — review not saved");
        }

        setSummary((prev) =>
          prev === null
            ? { reviewed: 1, goodish: goodish ? 1 : 0, xp: earnedXp }
            : {
                reviewed: prev.reviewed + 1,
                goodish: prev.goodish + (goodish ? 1 : 0),
                xp: prev.xp + earnedXp,
              },
        );

        setFlipped(false);
        if (index + 1 >= total) {
          setIndex(total); // session complete
          router.refresh(); // refresh the due-today stat
        } else {
          setIndex(index + 1);
        }
        setBusy(false);
      })();
    },
    [busy, card, flipped, index, router, summary, total],
  );

  // Keyboard shortcuts: Space flips, 1–4 rate.
  useEffect(() => {
    if (summary !== null || total === 0) return;
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.code === "Space" || event.key === " ") {
        // Leave Space to whatever control is focused (buttons, inputs).
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("button, a, input, textarea, select")) return;
        event.preventDefault();
        flip();
        return;
      }
      const rating = RATING_BUTTONS.find((button) => button.key === event.key);
      if (rating) {
        event.preventDefault();
        rate(rating.rating);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flip, rate, summary, total]);

  const progress = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((Math.min(index, total) / total) * 100);
  }, [index, total]);

  // ---------- Empty queue ----------
  if (total === 0) {
    return (
      <EmptyState
        icon={<PartyPopper className="size-5" aria-hidden />}
        title="All caught up — nothing due today"
        description="Cards you have rated are scheduled ahead by the SM-2 algorithm. Add your own cards or generate them from a note to grow your deck."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/flashcards?tab=manage">
                <Layers className="size-4" aria-hidden />
                Manage deck
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/explore">
                <BookOpen className="size-4" aria-hidden />
                Browse notes
              </Link>
            </Button>
          </div>
        }
      />
    );
  }

  // ---------- Session summary ----------
  if (summary !== null) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<CheckCircle2 className="size-5" aria-hidden />}
          title="Session complete"
          description={`${summary.reviewed} card${summary.reviewed === 1 ? "" : "s"} reviewed — ${summary.goodish} recalled well (Good or Easy).`}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryStat label="Reviewed" value={summary.reviewed} />
          <SummaryStat label="Good / Easy" value={summary.goodish} />
          <SummaryStat label="XP earned" value={summary.xp} tone="primary" />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/flashcards?tab=manage">
              <Layers className="size-4" aria-hidden />
              Manage deck
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/explore">
              <BookOpen className="size-4" aria-hidden />
              Browse notes
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!card) {
    // Defensive: index out of bounds without a summary (should not happen).
    return (
      <EmptyState
        icon={<RotateCw className="size-5" aria-hidden />}
        title="Session finished"
        description="Nothing more to review right now."
      />
    );
  }

  // ---------- Active review ----------
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium tabular-nums">
          Card {Math.min(index + 1, total)} of {total}
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          {card.state
            ? `Ease ${card.state.ease.toFixed(2)} · seen ${card.state.repetitions}×`
            : "New card"}
        </span>
      </div>
      <Progress value={progress} aria-label={`Session progress: ${index} of ${total}`} />

      {/* ---------- Flip card ---------- */}
      <div className="[perspective:1200px]">
        <div
          role="button"
          tabIndex={0}
          aria-label={flipped ? "Show question side" : "Reveal answer"}
          aria-pressed={flipped}
          onClick={flip}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              flip();
            }
          }}
          className={cn(
            "focus-ring relative min-h-72 w-full cursor-pointer rounded-2xl transition-transform duration-500 select-none [transform-style:preserve-3d] motion-reduce:transition-none",
          )}
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >
          {/* Front */}
          <div className="glass-card scrollbar-slim absolute inset-0 flex flex-col overflow-y-auto rounded-2xl p-6 [backface-visibility:hidden]">
            {card.topicTitle ? (
              <Badge variant="outline" className="self-start">
                {card.topicTitle}
              </Badge>
            ) : null}
            <div className="flex flex-1 items-center justify-center py-4">
              <Markdown className={cn("text-center", COMPACT_MARKDOWN)}>{card.frontMd}</Markdown>
            </div>
            <p className="text-muted-foreground text-center text-xs">
              Tap the card or press Space to reveal the answer
            </p>
          </div>

          {/* Back */}
          <div className="glass-card scrollbar-slim absolute inset-0 flex [transform:rotateY(180deg)] flex-col overflow-y-auto rounded-2xl p-6 [backface-visibility:hidden]">
            {card.topicTitle ? (
              <Badge variant="outline" className="self-start">
                {card.topicTitle}
              </Badge>
            ) : null}
            <div className="flex flex-1 items-center justify-center py-4">
              <Markdown className={cn("text-center", COMPACT_MARKDOWN)}>{card.backMd}</Markdown>
            </div>
            <p className="text-muted-foreground text-center text-xs">How well did you recall it?</p>
          </div>
        </div>
      </div>

      {/* ---------- Rating buttons ---------- */}
      <div
        role="group"
        aria-label="Rate your recall"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {RATING_BUTTONS.map((button) => (
          <button
            key={button.rating}
            type="button"
            onClick={() => rate(button.rating)}
            disabled={!flipped || busy}
            aria-label={`${button.label} (next review in ${previewInterval(card.state, button.rating)})`}
            className={cn(
              "focus-ring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2.5 font-medium transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40",
              button.className,
            )}
          >
            <span className="text-sm">
              {busy && flipped ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                button.label
              )}
            </span>
            <span className="text-xs font-normal tabular-nums opacity-75">
              {previewInterval(card.state, button.rating)}
            </span>
          </button>
        ))}
      </div>

      <p className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs">
        <span>
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans">Space</kbd> flip
        </span>
        <span>
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans">1</kbd>–
          <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans">4</kbd> rate
        </span>
      </p>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary";
}) {
  return (
    <div className="glass-card p-4 text-center sm:p-5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p
        className={cn(
          "font-heading mt-1 text-2xl font-bold tabular-nums",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}
