import { redirect } from "next/navigation";
import { CalendarCheck, History, Layers } from "lucide-react";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/common/setup-notice";
import { PageHeader, StatCard } from "@/components/common/ui-bits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManageDeck } from "@/components/flashcards/manage-deck";
import { ReviewSession, type QueueCard } from "@/components/flashcards/review-session";
import { todayIso, type Sm2State } from "@/lib/sm2";

const QUEUE_LIMIT = 30;
const CANDIDATE_PAGE_SIZE = 60;
const MAX_CANDIDATE_PAGES = 3;

/** Card columns shared by the due + new-card queries (topics joined for badges). */
interface CardRow {
  id: string;
  front_md: string;
  back_md: string;
  topics: { title: string } | null;
}

/**
 * Flashcards page — the SM-2 study deck.
 *
 * The review queue is a logical LEFT JOIN of visible published flashcards with
 * the user's `flashcard_reviews`, evaluated as two server-side queries so the
 * result can be ordered by review due date:
 *   1. reviews where `due_date <= today` (most overdue first), and
 *   2. never-reviewed cards that fill the remaining slots.
 * Cards are visible when published AND (public OR created by this user) —
 * students' manually-added private cards are part of their own deck.
 */
export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Flashcards"
          description="Spaced-repetition review with the SM-2 algorithm — due cards first, every day."
        />
        <SetupNotice missing="app" />
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayIso();
  const visibleFilter = `visibility.eq.public,created_by.eq.${user.id}`;

  // ---------- 1. The user's due reviews (most overdue first) ----------
  const { data: dueReviews, count: dueCount } = await supabase
    .from("flashcard_reviews")
    .select("flashcard_id, ease, interval_days, repetitions, lapses", {
      count: "exact",
    })
    .eq("user_id", user.id)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(QUEUE_LIMIT);

  // ---------- 2. Deck stats ----------
  const [{ count: reviewedCount }, { count: deckCount }] = await Promise.all([
    supabase
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .or(visibleFilter),
  ]);

  // ---------- 3. Card rows for the due reviews ----------
  const dueRows = (dueReviews ?? []).map((review) => review.flashcard_id);
  const dueCards: CardRow[] = [];
  if (dueRows.length > 0) {
    const { data } = await supabase
      .from("flashcards")
      .select("id, front_md, back_md, topics(title)")
      .eq("status", "published")
      .or(visibleFilter)
      .in("id", dueRows);
    dueCards.push(...(data ?? []));
  }
  const dueCardById = new Map(dueCards.map((card) => [card.id, card]));

  // ---------- 4. Never-reviewed cards filling the remaining slots ----------
  const needed = QUEUE_LIMIT - dueCards.length;
  const newCards: CardRow[] = [];
  if (needed > 0) {
    for (let page = 0; page < MAX_CANDIDATE_PAGES && newCards.length < needed; page += 1) {
      const from = page * CANDIDATE_PAGE_SIZE;
      const { data: candidates } = await supabase
        .from("flashcards")
        .select("id, front_md, back_md, topics(title)")
        .eq("status", "published")
        .or(visibleFilter)
        .order("created_at", { ascending: true })
        .range(from, from + CANDIDATE_PAGE_SIZE - 1);
      const rows = candidates ?? [];
      if (rows.length === 0) break;

      // Drop candidates the user has already reviewed — they are scheduled.
      const { data: reviewed } = await supabase
        .from("flashcard_reviews")
        .select("flashcard_id")
        .eq("user_id", user.id)
        .in(
          "flashcard_id",
          rows.map((row) => row.id),
        );
      const reviewedSet = new Set((reviewed ?? []).map((row) => row.flashcard_id));

      for (const row of rows) {
        if (newCards.length >= needed) break;
        if (!reviewedSet.has(row.id)) newCards.push(row);
      }
    }
  }

  // ---------- 5. Merge: due cards (by due date) then new cards ----------
  const queue: QueueCard[] = [];
  for (const review of dueReviews ?? []) {
    const card = dueCardById.get(review.flashcard_id);
    if (!card) continue; // card no longer visible — skip
    const state: Sm2State = {
      ease: review.ease,
      intervalDays: review.interval_days,
      repetitions: review.repetitions,
      lapses: review.lapses,
    };
    queue.push({
      id: card.id,
      frontMd: card.front_md,
      backMd: card.back_md,
      topicTitle: card.topics?.title ?? null,
      state,
    });
  }
  for (const card of newCards) {
    queue.push({
      id: card.id,
      frontMd: card.front_md,
      backMd: card.back_md,
      topicTitle: card.topics?.title ?? null,
      state: null, // never reviewed — SM-2 defaults apply on first rating
    });
  }

  const stats = {
    dueToday: dueCount ?? 0,
    deckSize: deckCount ?? 0,
    reviewedAllTime: reviewedCount ?? 0,
  };

  const tabParam = await searchParams;
  const rawTab = Array.isArray(tabParam.tab) ? tabParam.tab[0] : tabParam.tab;
  const initialTab = rawTab === "manage" ? "manage" : "review";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flashcards"
        description="Spaced-repetition review with the SM-2 algorithm — due cards first, every day."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Due today"
          value={stats.dueToday}
          hint={`Reviewing up to ${QUEUE_LIMIT} per session`}
          icon={<CalendarCheck className="size-4" aria-hidden />}
          tone={stats.dueToday > 0 ? "primary" : "default"}
        />
        <StatCard
          label="Your deck"
          value={stats.deckSize}
          hint="Public cards + your own"
          icon={<Layers className="size-4" aria-hidden />}
        />
        <StatCard
          label="Reviewed all-time"
          value={stats.reviewedAllTime}
          hint="Every card you have rated"
          icon={<History className="size-4" aria-hidden />}
        />
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="review" className="flex-1 sm:flex-none">
            Review
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex-1 sm:flex-none">
            Manage deck
          </TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4">
          <ReviewSession cards={queue} />
        </TabsContent>
        <TabsContent value="manage" className="mt-4">
          <ManageDeck />
        </TabsContent>
      </Tabs>
    </div>
  );
}
