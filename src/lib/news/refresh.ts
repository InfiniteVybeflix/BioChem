import {
  isNewsCategory,
  newsSettings,
  toJson,
  type NewsCategory,
  type NewsSettings,
  type NewsSource,
} from "@/types/domain";
import { gatewayChat, gatewayConfigured } from "@/lib/ai/gateway";

/**
 * BioChem news pipeline — live updates from the internet.
 *
 * 1. Fetch every enabled RSS/Atom source (real feeds, real timestamps).
 * 2. Filter items against the operator's interest keywords.
 * 3. De-duplicate against what is already stored (dedupe_key = item link).
 * 4. When the AI gateway is configured, digest the raw items into
 *    student-facing articles (title, summary, content, category);
 *    otherwise store the raw feed items as they arrived.
 * 5. Insert as published (auto_publish on) or as drafts for review,
 *    and stamp the run onto the settings JSON.
 *
 * Runs from the console ("Update now"), from the Vercel cron route
 * (/api/cron/news) and lazily from the student-facing pages when the
 * configured interval has elapsed.
 */

interface FeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  sourceLabel: string;
}

export interface RefreshResult {
  added: number;
  published: number;
  skipped: number;
  sourcesOk: number;
  sourcesFailed: number;
  aiDigested: boolean;
  error?: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_ITEMS_PER_SOURCE = 8;
const MAX_ITEMS_PER_RUN = 14;

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return match ? match[1] : null;
}

function firstLink(block: string): string | null {
  // RSS: <link>text</link> · Atom: <link href="…" … />
  const rss = firstTag(block, "link");
  if (rss && stripTags(rss)) return stripTags(rss);
  const atom = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return atom ? decodeEntities(atom[1]) : null;
}

/** Minimal, dependency-free RSS 2.0 / Atom parser — enough for headlines. */
export function parseFeed(xml: string, sourceLabel: string): FeedItem[] {
  const blocks =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ??
    xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ??
    [];
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = firstTag(block, "title");
    const link = firstLink(block);
    if (!title || !link) continue;
    const rawSummary =
      firstTag(block, "description") ?? firstTag(block, "summary") ?? firstTag(block, "content") ?? "";
    const date =
      firstTag(block, "pubDate") ?? firstTag(block, "published") ?? firstTag(block, "updated");
    const parsedDate = date ? new Date(stripTags(date)) : null;
    items.push({
      title: stripTags(title).slice(0, 300),
      link: link.split("#")[0],
      summary: stripTags(rawSummary).slice(0, 1200),
      publishedAt:
        parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
      sourceLabel,
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

async function fetchFeed(source: NewsSource): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BioChem-News/1.0 (+https://biokem.vercel.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return parseFeed(xml, source.label);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function keywordList(interests: string): string[] {
  return interests
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 2);
}

function matchesInterests(item: FeedItem, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

interface DraftArticle {
  title: string;
  summary: string;
  content_md: string;
  category: NewsCategory;
  source_url: string | null;
  source_label: string | null;
}

const DIGEST_SYSTEM = `You are the news desk of BioChem, a biochemistry study platform for Kenyan university students.

You receive raw headlines/summaries fetched live from science news feeds. Turn them into student-facing news articles.

For each item output a JSON object:
- "title": punchy, self-contained headline (max 90 chars).
- "summary": one-sentence hook a student would click (max 220 chars).
- "content_md": 2-4 short paragraphs in Markdown a 2nd-year biochemistry student understands. Connect the finding to course concepts (enzymes, metabolism, molecular biology, lab techniques) when natural; end with a one-line "Why it matters" bullet. Be faithful to the source — never invent facts, numbers or quotes.
- "category": one of research | exams | campus | jobs | general.

Rules:
- Keep the given source_url and source_label exactly.
- Write in clear English (Kenyan university audience).
- Respond with ONLY a JSON array — no markdown fences, no commentary.`;

/** Digest raw feed items into student articles via the AI gateway. */
async function aiDigest(items: FeedItem[]): Promise<DraftArticle[]> {
  const payload = items.map((item) => ({
    title: item.title,
    summary: item.summary.slice(0, 400),
    source_url: item.link,
    source_label: item.sourceLabel,
  }));
  const result = await gatewayChat(
    "tutor",
    [
      { role: "system", content: DIGEST_SYSTEM },
      {
        role: "user",
        content: `Write the news articles now:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    { temperature: 0.3, maxTokens: 12_000 },
  );

  const fenced = result.content.match(/\[[\s\S]*\]/);
  if (!fenced) throw new Error("The AI response was not a JSON list");
  const parsed: unknown = JSON.parse(fenced[0]);
  if (!Array.isArray(parsed)) throw new Error("The AI response was not a JSON list");

  return parsed.map((entry): DraftArticle | null => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const title = typeof record["title"] === "string" ? record["title"].trim() : "";
      const sourceUrl = typeof record["source_url"] === "string" ? record["source_url"] : null;
      const sourceLabel =
        typeof record["source_label"] === "string" ? record["source_label"] : null;
      if (title.length < 6 || !sourceUrl) return null;
      const categoryRaw =
        typeof record["category"] === "string" ? record["category"].toLowerCase() : "general";
      return {
        title: title.slice(0, 300),
        summary: typeof record["summary"] === "string" ? record["summary"].trim().slice(0, 400) : "",
        content_md: typeof record["content_md"] === "string" ? record["content_md"].trim() : "",
        category: isNewsCategory(categoryRaw) ? categoryRaw : "general",
        source_url: sourceUrl,
        source_label: sourceLabel,
      } satisfies DraftArticle;
    }).filter((entry): entry is DraftArticle => entry !== null);
}

function rawArticle(item: FeedItem): DraftArticle {
  return {
    title: item.title,
    summary: item.summary.slice(0, 300),
    content_md: item.summary
      ? `${item.summary}\n\n- Source: [${item.sourceLabel}](${item.link})`
      : `Read the full story at [${item.sourceLabel}](${item.link}).`,
    category: "research",
    source_url: item.link,
    source_label: item.sourceLabel,
  };
}

type AdminClient = NonNullable<
  ReturnType<typeof import("@/lib/supabase/admin").getSupabaseAdminClient>
>;

/** Persist the run stamp onto the news settings row. */
async function stampRun(
  admin: AdminClient,
  settings: NewsSettings,
  patch: Partial<Pick<NewsSettings, "last_run_at" | "last_run_result" | "last_auto_run">>,
): Promise<void> {
  const next = { ...settings, ...patch };
  await admin
    .from("site_settings")
    .upsert(
      { key: "news", value: toJson(next), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

export async function loadNewsSettings(admin: AdminClient): Promise<NewsSettings> {
  const { data } = await admin.from("site_settings").select("value").eq("key", "news").maybeSingle();
  return newsSettings(data?.value ?? null);
}

/**
 * Run the full pipeline. `mode: "auto"` only proceeds when auto_search
 * is enabled and the configured interval has elapsed since the last
 * automatic run; `mode: "manual"` always runs.
 */
export async function refreshNews(
  admin: AdminClient,
  mode: "auto" | "manual",
  overrides?: Partial<Pick<NewsSettings, "auto_publish">>,
): Promise<{ ran: boolean; result?: RefreshResult }> {
  const settings = await loadNewsSettings(admin);

  if (mode === "auto") {
    if (!settings.auto_search || !settings.enabled) return { ran: false };
    if (settings.last_auto_run) {
      const elapsed = Date.now() - new Date(settings.last_auto_run).getTime();
      if (elapsed < settings.interval_hours * 3_600_000) return { ran: false };
    }
  }

  const result = await runPipeline(admin, settings, overrides);
  const nowIso = new Date().toISOString();
  await stampRun(admin, settings, {
    last_run_at: nowIso,
    last_auto_run: mode === "auto" ? nowIso : settings.last_auto_run,
    last_run_result: `${result.added} new · ${result.published} published · ${
      result.sourcesOk
    }/${result.sourcesOk + result.sourcesFailed} sources${
      result.error ? ` · ${result.error}` : ""
    }`,
  });
  return { ran: true, result };
}

async function runPipeline(
  admin: AdminClient,
  settings: NewsSettings,
  overrides?: Partial<Pick<NewsSettings, "auto_publish">>,
): Promise<RefreshResult> {
  const enabledSources = settings.sources.filter((source) => source.enabled && source.url);
  const result: RefreshResult = {
    added: 0,
    published: 0,
    skipped: 0,
    sourcesOk: 0,
    sourcesFailed: 0,
    aiDigested: false,
  };
  if (enabledSources.length === 0) {
    result.error = "No sources enabled";
    return result;
  }

  // Already-stored links — never import the same story twice.
  const { data: existing } = await admin.from("news_articles").select("dedupe_key");
  const seen = new Set((existing ?? []).map((row) => row.dedupe_key));

  const feedResults = await Promise.all(enabledSources.map((source) => fetchFeed(source)));
  const keywords = keywordList(settings.interests);

  const candidates: FeedItem[] = [];
  feedResults.forEach((items) => {
    if (items.length > 0) result.sourcesOk += 1;
    else result.sourcesFailed += 1;
    for (const item of items) {
      if (seen.has(item.link)) {
        result.skipped += 1;
        continue;
      }
      if (!matchesInterests(item, keywords)) continue;
      seen.add(item.link); // also dedupes inside the batch
      candidates.push(item);
      if (candidates.length >= MAX_ITEMS_PER_RUN) break;
    }
  });
  if (candidates.length === 0) return result;

  // AI digest when the gateway is configured — otherwise raw items.
  let articles: DraftArticle[] = [];
  if (gatewayConfigured()) {
    try {
      articles = await aiDigest(candidates);
      result.aiDigested = true;
    } catch (error) {
      console.error("[news] AI digest failed, falling back to raw items:", error);
    }
  }
  if (articles.length === 0) {
    articles = candidates.map(rawArticle);
  }

  const publish = overrides?.auto_publish ?? settings.auto_publish;
  const nowIso = new Date().toISOString();
  for (const article of articles) {
    const { error } = await admin.from("news_articles").insert({
      title: article.title,
      summary: article.summary,
      content_md: article.content_md,
      category: article.category,
      source_url: article.source_url,
      source_label: article.source_label,
      status: publish ? "published" : "draft",
      auto: true,
      dedupe_key: article.source_url,
      published_at: publish ? nowIso : null,
    });
    if (error) {
      // Unique-violation on dedupe_key → another run beat us to it.
      if (!error.message.toLowerCase().includes("duplicate")) {
        console.error("[news] insert failed:", error.message);
      }
      continue;
    }
    result.added += 1;
    if (publish) result.published += 1;
  }
  return result;
}
