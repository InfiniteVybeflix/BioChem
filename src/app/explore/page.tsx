import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { ExploreBrowser } from "@/components/exam/explore-browser";
import type { NoteSummary } from "@/components/exam/note-card";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Explore notes",
  description: "Browse every published biochemistry note — free, no account needed.",
};

/**
 * Public note browsing. Server-renders the first page of published notes plus
 * the topic list, then hands off to the interactive ExploreBrowser.
 */
export default async function ExplorePage() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PublicHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
          <PageHeader title="Explore notes" description="Published notes from the whole class." />
          <SetupNotice missing="app" />
        </main>
      </div>
    );
  }

  const [auth, notesResult, topicsResult] = await Promise.all([
    getAuthContext(),
    supabase
      .from("notes")
      .select(
        "id, title, slug, summary, reading_minutes, views, tags, is_exam_critical, topic:topics!notes_topic_id_fkey (title, slug, zone), contributor:profiles!notes_contributed_by_fkey (full_name)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(48),
    supabase.from("topics").select("id, title, slug, zone").order("order_index"),
  ]);

  const notes: NoteSummary[] = (notesResult.data ?? [])
    .filter((row) => row.topic !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      readingMinutes: row.reading_minutes,
      views: row.views,
      tags: row.tags,
      isExamCritical: row.is_exam_critical,
      topic: {
        title: row.topic?.title ?? "",
        slug: row.topic?.slug ?? "",
        zone: row.topic?.zone ?? "cat1",
      },
      contributorName: row.contributor?.full_name ?? null,
    }));

  const topics = (topicsResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    zone: row.zone,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader signedIn={auth !== null} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <PageHeader
          title="Explore notes"
          description="Every published note across CAT 1, CAT 2 and Main Exam zones — free to read, no account needed. Sign in to track outcomes and generate flashcards."
        />
        <ExploreBrowser initialNotes={notes} topics={topics} />
        <p className="text-muted-foreground mt-10 flex items-center justify-center gap-2 text-center text-xs">
          <BookOpen className="size-3.5" aria-hidden />
          Reading is open to everyone — contribute your own notes to earn XP and leaderboard credit.
        </p>
      </main>
    </div>
  );
}
