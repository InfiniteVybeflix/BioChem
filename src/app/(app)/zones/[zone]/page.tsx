import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Atom, BookOpen, ClipboardCheck, GraduationCap, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, EmptyState } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { TopicTree, type NestedTopic } from "@/components/exam/topic-tree";
import { NoteCard, type NoteSummary } from "@/components/exam/note-card";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { nestTopics, ZONES, zoneLabel } from "@/lib/constants";
import type { Database, ExamZone } from "@/types/domain";

type TopicRow = Database["public"]["Tables"]["topics"]["Row"];

function isZone(value: string): value is ExamZone {
  return value === "cat1" || value === "cat2" || value === "main";
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ zone: string }>;
}): Promise<Metadata> {
  const { zone } = await params;
  if (!isZone(zone)) return { title: "Zone not found" };
  return {
    title: `${zoneLabel(zone)} zone`,
    description: `Topics, notes and outcomes for ${zoneLabel(zone)}.`,
  };
}

/**
 * Zone page: topic tree + (when ?topic=slug is set) that topic's published
 * notes, question count and outcome progress.
 */
export default async function ZonePage({
  params,
  searchParams,
}: {
  params: Promise<{ zone: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ zone: rawZone }, query] = await Promise.all([params, searchParams]);
  if (!isZone(rawZone)) notFound();
  const zone = rawZone;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title={`${zoneLabel(zone)} zone`} />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const zoneDefinition = ZONES.find((item) => item.id === zone);

  const { data: topicRows } = await supabase
    .from("topics")
    .select("*")
    .eq("zone", zone)
    .order("order_index");

  const topics = topicRows ?? [];
  const tree: NestedTopic[] = nestTopics(topics);
  const topicIds = topics.map((topic) => topic.id);

  // Outcomes for the whole zone (mastery + per-topic progress).
  const { data: outcomeRows } = topicIds.length
    ? await supabase
        .from("outcomes")
        .select("id, topic_id, code, statement, order_index")
        .in("topic_id", topicIds)
        .order("order_index")
    : { data: [] };

  const outcomes = outcomeRows ?? [];

  const auth = await getAuthContext();
  const masteredSet = new Set<string>();
  if (auth && outcomes.length > 0) {
    const { data: progressRows } = await supabase
      .from("user_outcome_progress")
      .select("outcome_id")
      .eq("user_id", auth.user.id)
      .eq("mastered", true)
      .in(
        "outcome_id",
        outcomes.map((outcome) => outcome.id),
      );
    for (const row of progressRows ?? []) masteredSet.add(row.outcome_id);
  }

  const zoneMastered = outcomes.filter((outcome) => masteredSet.has(outcome.id)).length;
  const zoneMasteryPct =
    outcomes.length > 0 ? Math.round((zoneMastered / outcomes.length) * 100) : 0;

  // Selected topic (?topic=slug).
  const topicSlug = firstParam(query.topic);
  const selectedTopic: TopicRow | null = topicSlug
    ? (topics.find((topic) => topic.slug === topicSlug) ?? null)
    : null;

  let topicNotes: NoteSummary[] = [];
  let topicQuestionCount = 0;
  let topicOutcomes: Database["public"]["Tables"]["outcomes"]["Row"][] = [];

  if (selectedTopic) {
    const [notesResult, questionsCountResult, topicOutcomesResult] = await Promise.all([
      supabase
        .from("notes")
        .select(
          "id, title, slug, summary, reading_minutes, views, tags, is_exam_critical, topic:topics!notes_topic_id_fkey (title, slug, zone), contributor:profiles!notes_contributed_by_fkey (full_name)",
        )
        .eq("status", "published")
        .eq("topic_id", selectedTopic.id)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(24),
      supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", selectedTopic.id)
        .eq("status", "published"),
      supabase.from("outcomes").select("*").eq("topic_id", selectedTopic.id).order("order_index"),
    ]);

    topicNotes = (notesResult.data ?? [])
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
          zone: row.topic?.zone ?? zone,
        },
        contributorName: row.contributor?.full_name ?? null,
      }));
    topicQuestionCount = questionsCountResult.count ?? 0;
    topicOutcomes = topicOutcomesResult.data ?? [];
  }

  const topicMastered = topicOutcomes.filter((outcome) => masteredSet.has(outcome.id)).length;
  const topicMasteryPct =
    topicOutcomes.length > 0 ? Math.round((topicMastered / topicOutcomes.length) * 100) : 0;

  return (
    <section>
      <Link
        href="/zones"
        className="text-muted-foreground hover:text-foreground focus-ring mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All zones
      </Link>

      <PageHeader
        title={`${zoneLabel(zone)} zone`}
        description={zoneDefinition?.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="focus-ring">
              <Link href={`/questions?zone=${zone}`}>
                <ClipboardCheck className="size-4" aria-hidden />
                Question bank
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="focus-ring">
              <Link href={`/mocks?zone=${zone}`}>
                <GraduationCap className="size-4" aria-hidden />
                Start a mock
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="focus-ring">
              <Link
                href={selectedTopic ? `/flashcards?topic=${selectedTopic.slug}` : "/flashcards"}
              >
                <Atom className="size-4" aria-hidden />
                Flashcards
              </Link>
            </Button>
          </div>
        }
      />

      {/* Zone mastery */}
      <div className="glass-card mb-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Zone outcome mastery</p>
          <p className="text-muted-foreground text-sm">
            <span className="text-primary font-semibold tabular-nums">{zoneMasteryPct}%</span> ·{" "}
            <span className="tabular-nums">
              {zoneMastered} of {outcomes.length}
            </span>{" "}
            outcomes mastered
          </p>
        </div>
        <Progress
          value={zoneMasteryPct}
          className="mt-3"
          aria-label={`${zoneMasteryPct}% zone mastery`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Topic tree */}
        <div>
          <h2 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
            Topics
          </h2>
          <TopicTree nodes={tree} zone={zone} activeSlug={topicSlug} />
        </div>

        {/* Topic panel */}
        <div>
          {selectedTopic ? (
            <article>
              <div className="glass-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-heading text-xl font-bold">{selectedTopic.title}</h2>
                    {selectedTopic.description ? (
                      <p className="text-muted-foreground mt-1.5 text-sm leading-6">
                        {selectedTopic.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <ClipboardCheck className="size-3" aria-hidden />
                      {topicQuestionCount} question{topicQuestionCount === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <BookOpen className="size-3" aria-hidden />
                      {topicNotes.length} note{topicNotes.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>

                {topicOutcomes.length > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Outcome mastery</span>
                      <span className="text-primary font-semibold tabular-nums">
                        {topicMasteryPct}%
                      </span>
                    </div>
                    <Progress
                      value={topicMasteryPct}
                      className="mt-1.5"
                      aria-label={`${topicMasteryPct}% topic mastery`}
                    />
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      <span className="text-foreground/80 font-medium tabular-nums">
                        {topicMastered}
                      </span>{" "}
                      of <span className="tabular-nums">{topicOutcomes.length}</span> outcomes
                      mastered ·{" "}
                      <Link href="/outcomes" className="text-primary underline underline-offset-2">
                        tick them off
                      </Link>
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-6">
                <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                  Published notes
                </h3>
                {topicNotes.length === 0 ? (
                  <EmptyState
                    icon={<SearchX className="size-6" aria-hidden />}
                    title="No published notes for this topic yet"
                    description="Be the first — write up your revision notes and earn XP when they're published."
                    action={
                      <Button asChild className="focus-ring">
                        <Link href="/submit">Contribute a note</Link>
                      </Button>
                    }
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {topicNotes.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                )}
              </div>
            </article>
          ) : (
            <div className="glass-card flex h-full flex-col justify-center p-6 sm:p-8">
              <h2 className="font-heading text-lg font-semibold">
                Pick a topic to focus your revision
              </h2>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
                Choose a topic from the tree to see its published notes, how many exam questions are
                waiting, and your outcome mastery for it. Or jump straight into practice with the
                quick actions above.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm" className="focus-ring">
                  <Link href={`/questions?zone=${zone}`}>
                    <ClipboardCheck className="size-4" aria-hidden />
                    Practise {zoneLabel(zone)} questions
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="focus-ring">
                  <Link href="/outcomes">Outcomes matrix</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
