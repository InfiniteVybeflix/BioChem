import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileQuestion,
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

interface TopicQuestion {
  id: string;
  stem: string;
  type: string;
  difficulty: string;
  marks: number;
  zone: Database["public"]["Enums"]["exam_zone"];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { title: "Topic" };
  const { data: topic } = await supabase
    .from("topics")
    .select("title, zone")
    .eq("slug", slug)
    .single();
  if (!topic) return { title: "Topic not found" };
  return {
    title: topic.title,
    description: `Notes and practice questions for ${topic.title} (${zoneLabel(
      topic.zone,
    )} zone).`,
  };
}

/** Strips light markdown so question stems preview cleanly on cards. */
function stemPreview(stemMd: string, max = 150): string {
  const flat = stemMd
    .replace(/[#*_`>]/g, "")
    .replace(/\$\$?[^$]*\$\$?/g, "[formula]")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Topic page — the topic's own address. Everything filed under one topic
 * (published notes + practice questions) sits on this single, linkable
 * page, so clicking a topic anywhere in the app lands here instead of
 * scrolling an inline panel.
 */
export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title="Topic" />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const { data: topicRow } = await supabase
    .from("topics")
    .select(
      "id, title, description, slug, zone, unit_id, units(id, code, name, schools(short_name, name))",
    )
    .eq("slug", slug)
    .single();
  if (!topicRow) notFound();
  const topic = topicRow as unknown as TopicRow & {
    units: {
      id: string;
      code: string;
      name: string;
      schools: { short_name?: string; name?: string } | null;
    } | null;
  };

  const auth = await getAuthContext();
  const isStaff = auth
    ? can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? [])
    : false;

  const [notesResult, questionCountResult, questionRowsResult] = await Promise.all([
    supabase
      .from("notes")
      .select(
        "id, title, slug, summary, reading_minutes, views, tags, is_exam_critical, topic:topics!notes_topic_id_fkey (title, slug, zone), contributor:profiles!notes_contributed_by_fkey (full_name)",
      )
      .eq("status", "published")
      .eq("topic_id", topic.id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(48),
    supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("topic_id", topic.id)
      .eq("status", "published"),
    supabase
      .from("questions")
      .select("id, stem_md, type, difficulty, marks, zone")
      .eq("topic_id", topic.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const topicNotes: NoteSummary[] = (notesResult.data ?? [])
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

  const questionCount = questionCountResult.count ?? 0;
  const questions: TopicQuestion[] = (questionRowsResult.data ?? []).map((row) => ({
    id: row.id,
    stem: stemPreview(row.stem_md ?? ""),
    type: row.type,
    difficulty: row.difficulty,
    marks: row.marks,
    zone: row.zone,
  }));

  const unit = topic.units;
  const schoolShort = unit?.schools?.short_name || unit?.schools?.name || "";
  const contributeHref = isStaff
    ? `/lecturer/publish?unit=${unit?.id ?? ""}&topic=${topic.slug}`
    : `/submit?unit=${unit?.id ?? ""}&topic=${topic.slug}`;

  return (
    <section>
      <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        <Link
          href="/units"
          className="hover:text-foreground focus-ring inline-flex min-h-9 items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          All units
        </Link>
        {unit ? (
          <>
            <span aria-hidden>/</span>
            <Link
              href={`/units/${unit.id}`}
              className="hover:text-foreground focus-ring inline-flex min-h-9 items-center transition-colors"
            >
              {unit.code} · {unit.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden>/</span>
        <span className="text-foreground font-medium">{topic.title}</span>
      </div>

      <PageHeader
        title={topic.title}
        description={
          topic.description ||
          `Notes and practice questions filed under ${topic.title}${
            schoolShort ? ` for ${schoolShort}` : ""
          }.`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1">
              <School className="size-3" aria-hidden />
              {schoolShort || zoneLabel(topic.zone)}
            </Badge>
            {unit ? (
              <Badge variant="outline" className="gap-1">
                <GraduationCap className="size-3" aria-hidden />
                {unit.code}
              </Badge>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6">
        {/* Notes */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Published notes
            </h2>
            <div className="flex gap-2">
              <Badge variant="outline" className="gap-1">
                <BookOpen className="size-3" aria-hidden />
                {topicNotes.length} note{topicNotes.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <ClipboardCheck className="size-3" aria-hidden />
                {questionCount} question{questionCount === 1 ? "" : "s"}
              </Badge>
            </div>
          </div>
          {topicNotes.length === 0 ? (
            <EmptyState
              icon={<SearchX className="size-6" aria-hidden />}
              title="No published notes for this topic yet"
              description={
                isStaff
                  ? "Publish the first note straight into this topic — no review queue."
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

        {/* Questions */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Practice questions
            </h2>
            {questionCount > 0 ? (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link href={`/questions?topic=${topic.slug}`}>
                  Practice all {questionCount} in the question bank
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>
          {questionCount === 0 ? (
            <EmptyState
              icon={<FileQuestion className="size-6" aria-hidden />}
              title="No published questions for this topic yet"
              description="When past papers and CAT questions are filed under this topic, they'll appear here for practice."
              action={
                <Button asChild variant="outline">
                  <Link href="/questions">Browse the question bank</Link>
                </Button>
              }
            />
          ) : (
            <div className="glass-card divide-border/60 divide-y">
              {questions.map((question) => (
                <div
                  key={question.id}
                  className="flex items-start justify-between gap-3 p-4 sm:p-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm leading-6">{question.stem}</p>
                    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="uppercase tracking-wide">{zoneLabel(question.zone)}</span>
                      <span aria-hidden>·</span>
                      <span className="capitalize">{question.type.replace(/_/g, " ")}</span>
                      <span aria-hidden>·</span>
                      <span className="capitalize">{question.difficulty}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {question.marks} mark{question.marks === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="shrink-0">
                    <Link href={`/questions?topic=${topic.slug}`} aria-label="Practise this topic">
                      Practise
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </div>
              ))}
              {questionCount > questions.length ? (
                <div className="text-muted-foreground px-4 py-3 text-center text-xs sm:px-5">
                  Showing the 5 newest of {questionCount} questions —{" "}
                  <Link
                    href={`/questions?topic=${topic.slug}`}
                    className="text-primary hover:underline"
                  >
                    open the question bank for all of them
                  </Link>
                  .
                </div>
              ) : null}
            </div>
          )}
        </div>

        {isStaff ? (
          <div className="flex justify-center">
            <Button asChild variant="outline" className="gap-2">
              <Link href={contributeHref}>
                <Send className="size-4" aria-hidden />
                Publish notes to this topic
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
