import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Eye, Flame } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PublicHeader } from "@/components/layout/public-header";
import { SetupNotice } from "@/components/common/setup-notice";
import { Markdown } from "@/components/markdown/markdown";
import { OutcomeChecklist } from "@/components/exam/outcome-checklist";
import { NoteActions } from "@/components/exam/note-actions";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { zoneLabel } from "@/lib/constants";
import type { Database } from "@/types/domain";

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type OutcomeRow = Database["public"]["Tables"]["outcomes"]["Row"];

interface NoteWithRelations {
  note: NoteRow;
  topic: {
    id: string;
    title: string;
    slug: string;
    zone: Database["public"]["Enums"]["exam_zone"];
  } | null;
  contributor: { full_name: string } | null;
}

async function fetchNoteBySlug(slug: string): Promise<NoteWithRelations | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("notes")
    .select(
      "*, topic:topics!notes_topic_id_fkey (id, title, slug, zone), contributor:profiles!notes_contributed_by_fkey (full_name)",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  return {
    note: data,
    topic: data.topic ?? null,
    contributor: data.contributor ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await fetchNoteBySlug(slug);
  if (!result || result.note.status !== "published") return { title: "Note not found" };
  return {
    title: result.note.title,
    description:
      result.note.summary ??
      `A ${zoneLabel(result.topic?.zone ?? "cat1")} biochemistry note on ${result.topic?.title ?? "biochemistry"}.`,
  };
}

/**
 * Public note viewer (guests can read published notes). Signed-in users get
 * the topic outcomes checklist with mastery tracking and the AI action bar.
 */
export default async function NotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="flex min-h-dvh flex-col">
        <PublicHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
          <SetupNotice missing="app" />
        </main>
      </div>
    );
  }

  const result = await fetchNoteBySlug(slug);
  if (!result || !result.topic) notFound();

  const { note, topic, contributor } = result;

  // Published notes are public; drafts/pending are owner- or staff-only (RLS
  // already hides them from everyone else — this is the defence in depth).
  if (note.status !== "published") {
    const auth = await getAuthContext();
    const isOwner = auth?.user.id === note.contributed_by;
    const isStaff = auth
      ? auth.profile.role === "lecturer" || auth.profile.role === "admin"
      : false;
    if (!isOwner && !isStaff) notFound();
  } else {
    // Fire-and-forget view counter (never blocks the render).
    void supabase.rpc("increment_note_views", { p_note_id: note.id }).then(
      () => undefined,
      () => undefined, // a failed view count must never break the page
    );
  }

  // Outcomes for this topic + the viewer's mastery map.
  const { data: outcomeRows } = await supabase
    .from("outcomes")
    .select("*")
    .eq("topic_id", topic.id)
    .order("order_index");
  const outcomes: OutcomeRow[] = outcomeRows ?? [];

  const mastered: Record<string, boolean> = {};
  if (outcomes.length > 0) {
    const auth = await getAuthContext();
    if (auth) {
      const { data: progressRows } = await supabase
        .from("user_outcome_progress")
        .select("outcome_id, mastered")
        .eq("user_id", auth.user.id)
        .in(
          "outcome_id",
          outcomes.map((outcome) => outcome.id),
        );
      for (const row of progressRows ?? []) mastered[row.outcome_id] = row.mastered;
    }
  }

  const contentPreview = `${note.title}\n\n${note.content_md.slice(0, 4000)}`;
  const contributorName = contributor?.full_name ?? "BioChem staff";
  const initials = contributorName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={`/zones/${topic.zone}`}
          className="text-muted-foreground hover:text-foreground focus-ring mb-5 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to {zoneLabel(topic.zone)}
        </Link>

        <article>
          <header>
            <h1 className="font-heading max-w-3xl text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              {note.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{zoneLabel(topic.zone)}</Badge>
              <Badge variant="outline" className="text-primary">
                {topic.title}
              </Badge>
              {note.is_exam_critical ? (
                <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  <Flame className="size-3" aria-hidden />
                  Exam critical
                </Badge>
              ) : null}
              {note.status !== "published" ? (
                <Badge variant="destructive">{note.status}</Badge>
              ) : null}
            </div>

            <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                <span className="tabular-nums">{note.reading_minutes} min read</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="size-4" aria-hidden />
                <span className="tabular-nums">{note.views} views</span>
              </span>
              <span className="flex items-center gap-2">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                Contributed by{" "}
                <span className="text-foreground/80 font-medium">{contributorName}</span>
              </span>
            </div>

            <div className="border-border/60 mt-6 border-y py-4">
              <NoteActions noteId={note.id} contentPreview={contentPreview} />
            </div>
          </header>

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="max-w-3xl">
              {note.summary ? (
                <p className="border-primary/40 text-muted-foreground mb-6 border-l-2 pl-4 text-[15px] leading-7 italic">
                  {note.summary}
                </p>
              ) : null}
              <Markdown>{note.content_md}</Markdown>
            </div>

            <aside className="self-start lg:sticky lg:top-24">
              <OutcomeChecklist
                outcomes={outcomes.map((outcome) => ({
                  id: outcome.id,
                  code: outcome.code,
                  statement: outcome.statement,
                }))}
                initialMastered={mastered}
              />
            </aside>
          </div>
        </article>
      </main>
    </div>
  );
}
