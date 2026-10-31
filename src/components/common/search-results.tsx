"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, FileText, MessagesSquare, Search, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/ui-bits";
import { zoneLabel } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

/** Full-search-page result rows (serialisable server → client). */
export interface SearchNoteHit {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  readingMinutes: number;
  topicTitle: string | null;
  zone: ExamZone | null;
}

export interface SearchQuestionHit {
  id: string;
  stemMd: string;
  marks: number;
}

export interface SearchDiscussionHit {
  id: string;
  title: string;
  replyCount: number;
}

export interface SearchResultsData {
  notes: SearchNoteHit[];
  questions: SearchQuestionHit[];
  discussions: SearchDiscussionHit[];
}

/** Strips markdown/LaTeX noise from a question stem for compact display. */
function plainStem(stem: string): string {
  return stem
    .replace(/[$*_>~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search results view: auto-focusing input (Enter re-runs the query) plus
 * Notes / Questions / Discussions sections with per-section counts.
 */
export function SearchResults({ query, results }: { query: string; results: SearchResultsData }) {
  const router = useRouter();
  const [draft, setDraft] = useState(query);
  const trimmed = query.trim();
  const total = results.notes.length + results.questions.length + results.discussions.length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next.length > 0) router.push(`/search?q=${encodeURIComponent(next)}`);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} role="search" aria-label="Search BioChem" className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            autoFocus
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search notes, questions and discussions…"
            aria-label="Search query"
            className="h-11 pl-9 text-[15px]"
          />
        </div>
        <Button type="submit" className="focus-ring h-11 px-5">
          Search
        </Button>
      </form>

      {trimmed.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden />}
          title="Search BioChem"
          description="Type at least two characters to search published notes, exam questions and community discussions."
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" aria-hidden />}
          title={`No results for “${trimmed}”`}
          description="Try a topic like “glycolysis” or “enzyme kinetics”."
        />
      ) : (
        <>
          {/* --- Notes --- */}
          <section aria-labelledby="search-notes-heading">
            <h2
              id="search-notes-heading"
              className="font-heading mb-3 flex items-center gap-2 text-lg font-semibold"
            >
              <FileText className="text-primary size-4.5" aria-hidden />
              Notes
              <Badge variant="secondary">{results.notes.length}</Badge>
            </h2>
            {results.notes.length === 0 ? (
              <p className="glass-card text-muted-foreground p-4 text-sm">No matching notes.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {results.notes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.slug}`}
                    className="glass-card group focus-ring hover:border-primary/40 p-4 transition-all hover:-translate-y-0.5 motion-reduce:transition-none sm:p-5"
                  >
                    <h3 className="font-heading group-hover:text-primary text-base leading-snug font-semibold transition-colors">
                      {note.title}
                    </h3>
                    {note.summary ? (
                      <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm leading-6">
                        {note.summary}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {note.topicTitle ? (
                        <Badge variant="secondary">{note.topicTitle}</Badge>
                      ) : null}
                      {note.zone ? <Badge variant="outline">{zoneLabel(note.zone)}</Badge> : null}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {note.readingMinutes} min read
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* --- Questions --- */}
          <section aria-labelledby="search-questions-heading">
            <h2
              id="search-questions-heading"
              className="font-heading mb-3 flex items-center gap-2 text-lg font-semibold"
            >
              <ClipboardCheck className="text-primary size-4.5" aria-hidden />
              Questions
              <Badge variant="secondary">{results.questions.length}</Badge>
            </h2>
            {results.questions.length === 0 ? (
              <p className="glass-card text-muted-foreground p-4 text-sm">No matching questions.</p>
            ) : (
              <ul className="glass-card divide-border/60 divide-y">
                {results.questions.map((question) => {
                  const stem = plainStem(question.stemMd);
                  return (
                    <li key={question.id}>
                      <Link
                        href={`/questions?q=${encodeURIComponent(stem.slice(0, 80))}`}
                        className="focus-ring hover:bg-muted/40 flex items-start gap-3 p-4 transition-colors"
                      >
                        <ClipboardCheck
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="line-clamp-2 text-sm leading-6">{stem}</span>
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {question.marks} mark{question.marks === 1 ? "" : "s"} · open in the
                            question bank
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* --- Discussions --- */}
          <section aria-labelledby="search-discussions-heading">
            <h2
              id="search-discussions-heading"
              className="font-heading mb-3 flex items-center gap-2 text-lg font-semibold"
            >
              <MessagesSquare className="text-primary size-4.5" aria-hidden />
              Discussions
              <Badge variant="secondary">{results.discussions.length}</Badge>
            </h2>
            {results.discussions.length === 0 ? (
              <p className="glass-card text-muted-foreground p-4 text-sm">
                No matching discussions.
              </p>
            ) : (
              <ul className="glass-card divide-border/60 divide-y">
                {results.discussions.map((discussion) => (
                  <li key={discussion.id}>
                    <Link
                      href={`/community/${discussion.id}`}
                      className="focus-ring hover:bg-muted/40 flex items-center justify-between gap-3 p-4 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{discussion.title}</span>
                        <span className="text-muted-foreground mt-0.5 block text-xs">
                          {discussion.replyCount} repl{discussion.replyCount === 1 ? "y" : "ies"} ·
                          open the thread
                        </span>
                      </span>
                      <MessagesSquare
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
