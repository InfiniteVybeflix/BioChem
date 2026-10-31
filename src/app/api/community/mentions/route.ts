import { z } from "zod";
import { jsonOk, jsonError, handleRoute, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/push";
import { extractMentionTokens } from "@/components/community/types";

const mentionRequestSchema = z.object({
  text: z.string().min(1).max(12_000),
  link: z.string().min(1).max(300),
});

/** Keeps only characters that are safe inside a quoted PostgREST or() filter. */
function sanitizePhrase(value: string): string | null {
  const cleaned = value
    .replace(/[^A-Za-z .'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

/**
 * Expands a @token into candidate phrases ("jane", "jane doe", …) so
 * multi-word full names can be matched exactly (case-insensitive).
 */
function candidatePhrases(token: string): string[] {
  const words = token.split(/\s+/).slice(0, 4);
  const phrases: string[] = [];
  for (let take = words.length; take >= 1; take -= 1) {
    const phrase = sanitizePhrase(words.slice(0, take).join(" "));
    if (phrase) phrases.push(phrase.toLowerCase());
  }
  return phrases;
}

/**
 * POST /api/community/mentions
 * Scans `text` for @FullName mentions, matches them against profiles
 * (exact, case-insensitive — via the RLS client since profiles are
 * public-read) and notifies every matched user except the author.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => null);
    const parsed = mentionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid mention request", 400);
    }

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const tokens = extractMentionTokens(parsed.data.text);
    if (tokens.length === 0) return jsonOk({ mentioned: 0 });

    // Unique candidate phrases across all tokens (bounded by the extractor cap).
    const phraseSets = tokens.map(candidatePhrases);
    const allPhrases = [...new Set(phraseSets.flat())];
    if (allPhrases.length === 0) return jsonOk({ mentioned: 0 });

    const orFilter = allPhrases.map((phrase) => `full_name.ilike."${phrase}"`).join(",");
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .or(orFilter);
    if (error) return jsonError(error.message, 500);

    const byExactName = new Map<string, string[]>(); // lowercase name → user ids
    for (const profile of profiles ?? []) {
      const key = profile.full_name.toLowerCase();
      const ids = byExactName.get(key) ?? [];
      ids.push(profile.id);
      byExactName.set(key, ids);
    }

    const mentionedIds = new Set<string>();
    for (const phrases of phraseSets) {
      // Longest phrase wins ("jane doe" beats a user literally named "jane").
      for (const phrase of phrases) {
        const ids = byExactName.get(phrase);
        if (ids && ids.length > 0) {
          for (const id of ids) {
            if (id !== auth.ctx.userId) mentionedIds.add(id);
          }
          break;
        }
      }
    }

    if (mentionedIds.size > 0) {
      await notifyUsers([...mentionedIds], "chat_mentions", {
        title: `${auth.ctx.profile.full_name} mentioned you`,
        body: parsed.data.text.slice(0, 100),
        link: parsed.data.link,
      });
    }

    return jsonOk({ mentioned: mentionedIds.size });
  });
}
