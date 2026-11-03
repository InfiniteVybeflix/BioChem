import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  FolderTree,
  GraduationCap,
  School,
  SearchX,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { NoteCard, type NoteSummary } from "@/components/exam/note-card";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { zoneLabel } from "@/lib/constants";
import type { Database } from "@/types/domain";

type TopicRow = Database["public"]["Tables"]["topics"]["Row"];

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Unit not found" };
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { title: "Course unit" };
  const { data: unit } = await supabase
    .from("units")
    .select("code, name")
    .eq("id", id)
    .single();
  if (!unit) return { title: "Unit not found" };
  return {
    title: `${unit.code} · ${unit.name}`,
    description: `Topics and notes for ${unit.code} — ${unit.name}.`,
  };
}

/**
 * Unit page: the topics filed under one course unit (BIO 205 …) with the
 * published notes for the selected topic. Students land here from /units;
 * lecturers land here to see what's inside before posting more.
 */
export default async function UnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(id)) notFound();

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title="Course unit" />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const { data: unitRow } = await supabase
    .from("units")
    .select(
      "id, code, name, description, year, semester, school_id, schools(name, short_name)",
    )
    .eq("id", id)
    .single();
  if (!unitRow) notFound();
  const unit = unitRow as unknown as {
    id: string;
    code: string;
    name: string;
    description: string | null;
    year: number;
    semester: number | null;
    school_id: string;
    schools: { name?: string; short_name?: string } | null;
  };

  const { data: topicRows } = await supabase
    .from("topics")
    .select("*")
    .eq("unit_id", id)
    .order("order_index");

  const topics: TopicRow[] = topicRows ?? [];
  const topicSlug = firstParam(query.topic);
  const selectedTopic = topicSlug
    ? (topics.find((topic) => topic.slug === topicSlug) ?? null)
    : null;

  // First published note per topic — clicking a topic opens its notes
  // straight away instead of the two-step "Viewing → scroll → click" flow.
  const firstNoteByTopic = new Map<string, { slug: string; count: number }>();
  if (topics.length > 0) {
    const { data: unitNoteRows } = await supabase
      .from("notes")
      .select("slug, topic_id")
      .eq("status", "published")
      .in(
        "topic_id",
        topics.map((topic) => topic.id),
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(300);
    for (const row of unitNoteRows ?? []) {
      const entry = firstNoteByTopic.get(row.topic_id);
      if (entry) entry.count += 1;
      else firstNoteByTopic.set(row.topic_id, { slug: row.slug, count: 1 });
    }
  }

  const auth = await getAuthContext();
  const isStaff = auth
    ? can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? [])
    : false;

  let topicNotes: NoteSummary[] = [];
  let topicQuestionCount = 0;
  if (selectedTopic) {
    const [notesResult, questionsCountResult] = await Promise.all([
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
          zone: row.topic?.zone ?? "main",
        },
        contributorName: row.contributor?.full_name ?? null,
      }));
    topicQuestionCount = questionsCountResult.count ?? 0;
  }

  const schoolShort = unit.schools?.short_name || unit.schools?.name || "";
  const contributeHref = isStaff
    ? `/lecturer/publish?unit=${unit.id}${selectedTopic ? `&topic=${selectedTopic.slug}` : ""}`
    : `/submit?unit=${unit.id}${selectedTopic ? `&topic=${selectedTopic.slug}` : ""}`;

  return (
    <section>
      <Link
        href="/units"
        className="text-muted-foreground hover:text-foreground focus-ring mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All units
      </Link>

      <PageHeader
        title={`${unit.code} · ${unit.name}`}
        description={
          unit.description ||
          `Everything filed under ${unit.code} for ${schoolShort ? `${schoolShort} — ` : ""}Year ${unit.year}${
            unit.semester ? `, Semester ${unit.semester}` : ""
          }.`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <School className="size-3" aria-hidden />
              {schoolShort || "School"}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <GraduationCap className="size-3" aria-hidden />
              Year {unit.year}
              {unit.semester ? ` · Sem ${unit.semester}` : ""}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Topic list */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Topics in this unit
            </h2>
            <Badge variant="outline" className="text-[10px]">
              {topics.length}
            </Badge>
          </div>
          {topics.length === 0 ? (
            <p className="glass-card text-muted-foreground p-6 text-sm">
              No topics have been filed under this unit yet
              {isStaff ? " — publish the first note below and pick this unit's topic." : "."}
            </p>
          ) : (
            <nav aria-label={`Topics in ${unit.code}`} className="glass-card divide-border/60 divide-y">
              {topics.map((topic) => {
                const isActive = topic.slug === selectedTopic?.slug;
                const topicNote = firstNoteByTopic.get(topic.id);
                return (
                  <div key={topic.id} className="flex items-stretch justify-between gap-1">
                    <Link
                      href={
                        topicNote
                          ? `/notes/${topicNote.slug}`
                          : `/units/${unit.id}?topic=${topic.slug}#topic-panel`
                      }
                      aria-current={isActive ? "page" : undefined}
                      className={`focus-ring flex min-h-11 flex-1 items-center gap-2 p-4 text-sm font-semibold transition-colors ${
                        isActive ? "text-primary" : "hover:text-primary"
                      }`}
                    >
                      <span className="min-w-0 leading-snug">{topic.title}</span>
                      {isActive ? (
                        <span className="bg-primary/15 text-primary ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">
                          Viewing
                        </span>
                      ) : (
                        <Badge variant="outline" className="ml-auto shrink-0 text-[10px] font-normal">
                          {zoneLabel(topic.zone)}
                        </Badge>
                      )}
                    </Link>
                    {topicNote && topicNote.count > 1 ? (
                      <Link
                        href={`/units/${unit.id}?topic=${topic.slug}#topic-panel`}
                        className="text-muted-foreground hover:text-primary focus-ring flex shrink-0 flex-col justify-center px-2 text-[11px] underline-offset-2 transition-colors hover:underline"
                        aria-label={`All ${topicNote.count} notes for ${topic.title}`}
                      >
                        All {topicNote.count}
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          )}

          <Button asChild className="focus-ring mt-4 w-full">
            <Link href={contributeHref}>
              <Send className="size-4" aria-hidden />
              {isStaff ? "Publish notes to this unit" : "Contribute a note"}
            </Link>
          </Button>
        </div>

        {/* Topic panel */}
        <div id="topic-panel" className="scroll-mt-24">
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
              </div>

              <div className="mt-6">
                <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                  Published notes
                </h3>
                {topicNotes.length === 0 ? (
                  <EmptyState
                    icon={<SearchX className="size-6" aria-hidden />}
                    title="No published notes for this topic yet"
                    description={
                      isStaff
                        ? "Publish the first note straight into this unit — no review queue."
                        : "Be the first — write up your revision notes and earn XP when they're published."
                    }
                    action={
                      <Button asChild className="focus-ring">
                        <Link href={contributeHref}>
                          {isStaff ? "Publish a note" : "Contribute a note"}
                        </Link>
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
              <h2 className="font-heading flex items-center gap-2 text-lg font-semibold">
                <FolderTree className="text-primary size-5" aria-hidden />
                Pick a topic inside {unit.code}
              </h2>
              <p className="text-muted-foreground mt-2 max-w-md text-sm leading-6">
                Choose a topic from the list to see its published notes
                {isStaff ? ", then publish straight into this unit" : ""}. Everything here counts
                towards {unit.code} for {schoolShort ? `${schoolShort} — ` : ""}Year {unit.year}.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
