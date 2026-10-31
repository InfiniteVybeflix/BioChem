import { handleRoute, jsonOk } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NextResponse } from "next/server";

/**
 * GET /api/search?q=… — PUBLIC search endpoint used by the ⌘K palette and the
 * full /search page. RLS limits guests to published content. Fails soft: when
 * Supabase is unconfigured (or a full-text query errors) the caller receives
 * empty arrays with `configured: false` / falls back to ilike matching.
 */

interface SearchHit {
  notes: { id: string; title: string; slug: string }[];
  questions: { id: string; stem_md: string }[];
  discussions: { id: string; title: string }[];
}

const EMPTY: SearchHit = { notes: [], questions: [], discussions: [] };

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

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("q") ?? "").trim();
    if (raw.length < 2) return jsonOk(EMPTY);

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonOk({ ...EMPTY, configured: false });

    const ftsQuery = sanitizeForFts(raw);
    const likeQuery = sanitizeForIlike(raw);

    // --- Notes: generated tsvector column, ilike fallback on error ---
    let notes: SearchHit["notes"] = [];
    {
      if (ftsQuery.length >= 2) {
        const { data, error } = await supabase
          .from("notes")
          .select("id, title, slug")
          .eq("status", "published")
          .textSearch("search", ftsQuery, { type: "websearch", config: "english" })
          .limit(5);
        if (!error && data) {
          notes = data;
        } else {
          const { data: fallback } = await supabase
            .from("notes")
            .select("id, title, slug")
            .eq("status", "published")
            .or(`title.ilike.%${likeQuery}%,summary.ilike.%${likeQuery}%`)
            .limit(5);
          notes = fallback ?? [];
        }
      } else {
        const { data } = await supabase
          .from("notes")
          .select("id, title, slug")
          .eq("status", "published")
          .or(`title.ilike.%${likeQuery}%,summary.ilike.%${likeQuery}%`)
          .limit(5);
        notes = data ?? [];
      }
    }

    // --- Questions: stem/explanation tsvector, stem ilike fallback ---
    let questions: SearchHit["questions"] = [];
    {
      if (ftsQuery.length >= 2) {
        const { data, error } = await supabase
          .from("questions")
          .select("id, stem_md")
          .eq("status", "published")
          .textSearch("search", ftsQuery, { type: "websearch", config: "english" })
          .limit(5);
        if (!error && data) {
          questions = data;
        } else {
          const { data: fallback } = await supabase
            .from("questions")
            .select("id, stem_md")
            .eq("status", "published")
            .ilike("stem_md", `%${likeQuery}%`)
            .limit(5);
          questions = fallback ?? [];
        }
      } else {
        const { data } = await supabase
          .from("questions")
          .select("id, stem_md")
          .eq("status", "published")
          .ilike("stem_md", `%${likeQuery}%`)
          .limit(5);
        questions = data ?? [];
      }
    }

    // --- Discussions: title tsvector, title/body ilike fallback ---
    let discussions: SearchHit["discussions"] = [];
    {
      if (ftsQuery.length >= 2) {
        const { data, error } = await supabase
          .from("discussions")
          .select("id, title")
          .textSearch("title", ftsQuery, { type: "websearch", config: "english" })
          .limit(5);
        if (!error && data) {
          discussions = data;
        } else {
          const { data: fallback } = await supabase
            .from("discussions")
            .select("id, title")
            .or(`title.ilike.%${likeQuery}%,body_md.ilike.%${likeQuery}%`)
            .limit(5);
          discussions = fallback ?? [];
        }
      } else {
        const { data } = await supabase
          .from("discussions")
          .select("id, title")
          .or(`title.ilike.%${likeQuery}%,body_md.ilike.%${likeQuery}%`)
          .limit(5);
        discussions = data ?? [];
      }
    }

    return jsonOk({ notes, questions, discussions, configured: true });
  });
}
