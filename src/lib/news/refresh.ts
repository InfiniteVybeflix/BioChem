import {
  isNewsCategory,
  newsSettings,
  toJson,
  type NewsCategory,
  type NewsSettings,
  type NewsSource,
} from "@/types/domain";
import { gatewayChat, gatewayConfigured, type GatewayMessage } from "@/lib/ai/gateway";
import { parseDigestArticles, type DigestArticlePayload } from "@/lib/ai/json";

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
 * Runs from the console ("Fetch now"), from the Vercel cron route
 * (/api/cron/news) and lazily from the landing page when the
 * configured interval has elapsed.
 */

interface FeedItem {
  title: string;
  link: string;
  summary: string;
  publishedAt: string | null;
  sourceLabel: string;
}

/** One article the pipeline created this run — shown in the review panel. */
export interface RefreshedItem {
  id: string;
  title: string;
  summary: string;
  source_url: string | null;
  source_label: string | null;
  status: "draft" | "published";
  category: NewsCategory;
}

export interface RefreshResult {
  added: number;
  published: number;
  skipped: number;
  sourcesOk: number;
  sourcesFailed: number;
  /** Which sources failed, so "Fetch now" can say exactly what was unreachable. */
  failedSources: string[];
  aiDigested: boolean;
  /** The articles this run created — the review panel lists them. */
  items: RefreshedItem[];
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
- "source_url": the item link, unchanged.
- "source_label": the item's source name, unchanged.

Rules:
- Keep every given source_url and source_label exactly.
- Write in clear English (Kenyan university audience).
- Respond with ONLY a JSON array — no markdown fences, no commentary.`;

/**
 * Digest raw feed items into student articles via the AI gateway.
 * Retries once with a stricter instruction when the reply isn't a
 * usable JSON list; each item is then validated independently so one
 * bad entry never sinks the batch.
 */
async function aiDigest(items: FeedItem[]): Promise<DraftArticle[]> {
  const payload = items.map((item) => ({
    title: item.title,
    summary: item.summary.slice(0, 400),
    source_url: item.link,
    source_label: item.sourceLabel,
  }));
  const baseMessages: GatewayMessage[] = [
    { role: "system", content: DIGEST_SYSTEM },
    {
      role: "user",
      content: `Write the news articles now:\n${JSON.stringify(payload, null, 2)}`,
    },
  ];

  let lastError = "The AI response was not a JSON list";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const messages: GatewayMessage[] =
        attempt === 0
          ? baseMessages
          : [
              { role: "system", content: DIGEST_SYSTEM },
              {
                role: "user",
                content: `${JSON.stringify(payload, null, 2)}\n\nIMPORTANT: your previous reply was not usable JSON. Respond with ONLY a valid JSON array — start with [ and end with ] — one object per item, no fences, no commentary.`,
              },
            ];
      const result = await gatewayChat("tutor", messages, {
        temperature: 0.3,
        maxTokens: 12_000,
      });
      const outcome = parseDigestArticles(result.content);
      const isLastAttempt = attempt === 1;
      if (outcome.value && (isLastAttempt || !outcome.truncated)) {
        return outcome.value.map((entry: DigestArticlePayload) => ({
          title: entry.title.slice(0, 300),
          summary: entry.summary,
          content_md: entry.content_md,
          category: isNewsCategory(entry.category) ? entry.category : "general",
          source_url: entry.source_url,
          source_label: entry.source_label,
        }));
      }
      lastError = outcome.error ?? "The AI response was cut off";
      console.warn(`[news] digest attempt ${attempt + 1} unusable: ${lastError}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The AI digest failed";
      console.warn(`[news] digest attempt ${attempt + 1} failed: ${lastError}`);
    }
  }
  throw new Error(lastError);
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
    failedSources: [],
    aiDigested: false,
    items: [],
  };
  if (enabledSources.length === 0) {
    result.error = "No sources enabled — add at least one RSS source";
    return result;
  }

  // Already-stored links — never import the same story twice.
  const { data: existing, error: existingError } = await admin
    .from("news_articles")
    .select("dedupe_key");
  if (existingError) {
    result.error = existingError.message.includes("does not exist")
      ? "The news table isn't set up — open System → Database setup"
      : existingError.message;
    return result;
  }
  const seen = new Set((existing ?? []).map((row) => row.dedupe_key));

  const feedResults = await Promise.all(
    enabledSources.map(async (source) => ({ source, items: await fetchFeed(source) })),
  );
  const keywords = keywordList(settings.interests);

  const candidates: FeedItem[] = [];
  for (const { source, items } of feedResults) {
    if (items.length > 0) {
      result.sourcesOk += 1;
    } else {
      result.sourcesFailed += 1;
      result.failedSources.push(source.label);
    }
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
  }
  if (candidates.length === 0) {
    if (result.sourcesFailed > 0 && result.sourcesOk === 0) {
      result.error = `All ${result.sourcesFailed} source(s) were unreachable`;
    }
    return result;
  }

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
    const { data, error } = await admin
      .from("news_articles")
      .insert({
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
      })
      .select("id, title, summary, source_url, source_label, status, category")
      .single();
    if (error || !data) {
      // Unique-violation on dedupe_key → another run beat us to it.
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        console.error("[news] insert failed:", error.message);
        if (error.message.includes("does not exist") && !result.error) {
          result.error = "The news table isn't set up — open System → Database setup";
        }
      }
      continue;
    }
    result.added += 1;
    if (publish) result.published += 1;
    result.items.push({
      id: data.id,
      title: data.title,
      summary: data.summary,
      source_url: data.source_url,
      source_label: data.source_label,
      status: data.status === "published" ? "published" : "draft",
      category: isNewsCategory(data.category) ? data.category : "general",
    });
  }
  return result;
}
