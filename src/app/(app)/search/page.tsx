import type { Metadata } from "next";
import { getSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { SearchResults, type SearchResultsData } from "@/components/common/search-results";

export const metadata: Metadata = {
  title: "Search",
  description: "Search published notes, exam questions and community discussions.",
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Strips websearch operators that commonly trigger tsquery syntax errors. */
function sanitizeForFts(query: string): string {
  return query
    .replace(/["'()\\]|:(?!\w)|[&|!*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapes %, _ and \ so ilike patterns treat the query as literal text. */
function sanitizeForIlike(query: string): string {
  return query.replace(/[\\%_]/g, " ").trim();
}

const NOTE_SELECT =
  "id, title, slug, summary, reading_minutes, topic:topics!notes_topic_id_fkey (title, zone)";

/**
 * Full search page — runs the same three queries as /api/search directly on
 * the server (RLS limits guests to published content) with a limit of 20
 * results per section.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const query = firstParam(params.q).trim().slice(0, 120);

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Search"
          description="Find notes, questions and discussions across BioChem."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const results: SearchResultsData = { notes: [], questions: [], discussions: [] };
  const ftsQuery = sanitizeForFts(query);
  const likeQuery = sanitizeForIlike(query);

  if (query.length >= 2 && supabase) {
    // --- Notes ---
    {
      const rows = await searchNotes(supabase, ftsQuery, likeQuery);
      results.notes = rows.map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        summary: row.summary,
        readingMinutes: row.reading_minutes,
        topicTitle: row.topic?.title ?? null,
        zone: row.topic?.zone ?? null,
      }));
    }

    // --- Questions ---
    {
      const rows = await searchQuestions(supabase, ftsQuery, likeQuery);
      results.questions = rows.map((row) => ({
        id: row.id,
        stemMd: row.stem_md,
        marks: row.marks,
      }));
    }

    // --- Discussions ---
    {
      const rows = await searchDiscussions(supabase, ftsQuery, likeQuery);
      results.discussions = rows.map((row) => ({
        id: row.id,
        title: row.title,
        replyCount: row.reply_count,
      }));
    }
  }

  return (
    <section>
      <PageHeader
        title="Search"
        description="Find published notes, exam questions and community discussions in one place."
      />
      <SearchResults query={query} results={results} />
    </section>
  );
}

/** Notes search: full-text on the generated column with an ilike fallback. */
async function searchNotes(
  supabase: SupabaseServerClient,
  ftsQuery: string,
  likeQuery: string,
): Promise<
  {
    id: string;
    title: string;
    slug: string;
    summary: string | null;
    reading_minutes: number;
    topic: { title: string; zone: "cat1" | "cat2" | "main" } | null;
  }[]
> {
  if (ftsQuery.length >= 2) {
    const { data, error } = await supabase
      .from("notes")
      .select(NOTE_SELECT)
      .eq("status", "published")
      .textSearch("search", ftsQuery, { type: "websearch", config: "english" })
      .limit(20);
    if (!error && data) return data;
  }
  const { data } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("status", "published")
    .or(`title.ilike.%${likeQuery}%,summary.ilike.%${likeQuery}%`)
    .limit(20);
  return data ?? [];
}

/** Question search: stem/explanation tsvector with a stem ilike fallback. */
async function searchQuestions(
  supabase: SupabaseServerClient,
  ftsQuery: string,
  likeQuery: string,
): Promise<{ id: string; stem_md: string; marks: number }[]> {
  if (ftsQuery.length >= 2) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, stem_md, marks")
      .eq("status", "published")
      .textSearch("search", ftsQuery, { type: "websearch", config: "english" })
      .limit(20);
    if (!error && data) return data;
  }
  const { data } = await supabase
    .from("questions")
    .select("id, stem_md, marks")
    .eq("status", "published")
    .ilike("stem_md", `%${likeQuery}%`)
    .limit(20);
  return data ?? [];
}

/** Discussion search: title tsvector with a title/body ilike fallback. */
async function searchDiscussions(
  supabase: SupabaseServerClient,
  ftsQuery: string,
  likeQuery: string,
): Promise<{ id: string; title: string; reply_count: number }[]> {
  if (ftsQuery.length >= 2) {
    const { data, error } = await supabase
      .from("discussions")
      .select("id, title, reply_count")
      .textSearch("title", ftsQuery, { type: "websearch", config: "english" })
      .limit(20);
    if (!error && data) return data;
  }
  const { data } = await supabase
    .from("discussions")
    .select("id, title, reply_count")
    .or(`title.ilike.%${likeQuery}%,body_md.ilike.%${likeQuery}%`)
    .limit(20);
  return data ?? [];
}
