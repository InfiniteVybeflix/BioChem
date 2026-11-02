import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { dbErrorResponse, zodFieldMessage } from "@/lib/admin/api-errors";
import { gatewayChat, gatewayConfigured, type GatewayMessage } from "@/lib/ai/gateway";
import { parseDraftArticle, type DraftArticlePayload } from "@/lib/ai/json";
import { refreshNews } from "@/lib/news/refresh";
import { newsSettings, toJson, type NewsCategory, type NewsSettings } from "@/types/domain";

/**
 * Console news desk — live biochemistry updates from the internet plus
 * hand-written campus notices.
 *
 *   GET   → { settings, articles[], configured }
 *   POST  { action: "settings", patch }        — partial settings update
 *   POST  { action: "create", …article }       — hand-written article
 *   POST  { action: "update", id, …partial }
 *   POST  { action: "delete", id }
 *   POST  { action: "draft", text }            — AI drafts from pasted text/URL
 *   POST  { action: "ingest", urls }           — load pages, preview what they're about
 *   POST  { action: "refresh" }                — fetch sources now (returns found items)
 */

const categorySchema = z.enum(["research", "exams", "campus", "jobs", "general"]);

const sourceSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url("Source must be a valid URL").max(500),
  enabled: z.boolean(),
});

const settingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  show_on_landing: z.boolean().optional(),
  show_in_app: z.boolean().optional(),
  auto_search: z.boolean().optional(),
  auto_publish: z.boolean().optional(),
  interval_hours: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).optional(),
  interests: z.string().max(400).optional(),
  sources: z.array(sourceSchema).max(12).optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(4, "Give the article a headline").max(300),
  summary: z.string().trim().max(400).default(""),
  content_md: z.string().trim().max(40_000).default(""),
  category: categorySchema.default("general"),
  source_url: z
    .string()
    .trim()
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  source_label: z.string().trim().max(120).nullable().optional(),
  image_url: z
    .string()
    .trim()
    .url()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  status: z.enum(["draft", "published"]).default("draft"),
  pinned: z.boolean().default(false),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.string().uuid(),
  title: z.string().trim().min(4).max(300).optional(),
  summary: z.string().trim().max(400).optional(),
  content_md: z.string().trim().max(40_000).optional(),
  category: categorySchema.optional(),
  source_url: z.string().trim().url().nullable().optional(),
  source_label: z.string().trim().max(120).nullable().optional(),
  image_url: z.string().trim().url().nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
  pinned: z.boolean().optional(),
});

const draftSchema = z.object({
  action: z.literal("draft"),
  text: z.string().trim().min(20, "Paste the article text or a link").max(60_000),
});

const ingestSchema = z.object({
  action: z.literal("ingest"),
  urls: z
    .array(z.string().trim().url("Each link must be a valid URL").max(2_000))
    .min(1, "Add at least one link")
    .max(5, "Load at most 5 links at a time"),
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), patch: settingsPatchSchema }),
  z.object({ action: z.literal("create") }).merge(createSchema),
  updateSchema,
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  draftSchema,
  ingestSchema,
  z.object({ action: z.literal("refresh") }),
]);

export interface NewsArticleRow {
  id: string;
  title: string;
  summary: string;
  content_md: string;
  category: NewsCategory;
  source_url: string | null;
  source_label: string | null;
  image_url: string | null;
  status: string;
  pinned: boolean;
  auto: boolean;
  published_at: string | null;
  created_at: string;
}

interface RawNewsRow {
  id: string;
  title: string;
  summary: string;
  content_md: string;
  category: string;
  source_url: string | null;
  source_label: string | null;
  image_url: string | null;
  status: string;
  pinned: boolean;
  auto: boolean;
  published_at: string | null;
  created_at: string;
}

function toRow(row: RawNewsRow): NewsArticleRow {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content_md: row.content_md,
    category: (["research", "exams", "campus", "jobs", "general"] as readonly string[]).includes(
      row.category,
    )
      ? (row.category as NewsCategory)
      : "general",
    source_url: row.source_url,
    source_label: row.source_label,
    image_url: row.image_url,
    status: row.status,
    pinned: row.pinned,
    auto: row.auto,
    published_at: row.published_at,
    created_at: row.created_at,
  };
}

const COLUMNS =
  "id, title, summary, content_md, category, source_url, source_label, image_url, status, pinned, auto, published_at, created_at";

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const [{ data: settingsRow }, { data: articles, error }] = await Promise.all([
    admin.from("site_settings").select("value").eq("key", "news").maybeSingle(),
    admin
      .from("news_articles")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (error) {
    return dbErrorResponse("load the news desk", error);
  }

  return Response.json({
    settings: newsSettings(settingsRow?.value ?? null),
    articles: (articles ?? []).map(toRow),
    configured: gatewayConfigured(),
  });
}

/** Fetch an external page and reduce it to readable text + metadata. */
interface PageExtract {
  ok: boolean;
  error?: string;
  title: string;
  siteLabel: string;
  description: string;
  text: string;
  wordCount: number;
  image_url: string | null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function metaContent(html: string, name: string): string {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return "";
}

async function fetchPage(url: string): Promise<PageExtract> {
  const failed = (error: string): PageExtract => ({
    ok: false,
    error,
    title: "",
    siteLabel: "",
    description: "",
    text: "",
    wordCount: 0,
    image_url: null,
  });
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return failed("Only http(s) links work");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: {
        "User-Agent": "BioChem-News/1.0 (+https://biokem.vercel.app)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!response.ok) return failed(`The site answered ${response.status}`);
    const html = (await response.text()).slice(0, 900_000);

    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const title = decodeEntities(titleTag).replace(/\s+/g, " ").trim();
    const siteLabel = decodeEntities(parsed.hostname.replace(/^www\./, ""));
    const description = metaContent(html, "og:description") || metaContent(html, "description");
    const ogImage = metaContent(html, "og:image");
    const image_url = ogImage
      ? new URL(ogImage, parsed).toString().slice(0, 2_000)
      : null;

    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]*>/g, " ");
    const text = decodeEntities(body).replace(/\s+/g, " ").trim();
    return {
      ok: true,
      title,
      siteLabel,
      description: description.slice(0, 600),
      text,
      wordCount: text ? text.split(" ").length : 0,
      image_url,
    };
  } catch (error) {
    return failed(
      error instanceof Error && error.name === "AbortError"
        ? "The site took too long to answer"
        : "The page could not be loaded",
    );
  }
}

const DRAFT_SYSTEM = `You write the BioChem news desk articles. BioChem is a biochemistry study platform for Kenyan university students.

You receive raw material (pasted text or extracted from a URL). Produce ONE student-facing article as JSON:
- "title": punchy, self-contained headline (max 90 chars).
- "summary": one-sentence hook (max 220 chars).
- "content_md": 2-5 short Markdown paragraphs a 2nd-year biochemistry student understands; connect to course concepts when natural; end with a one-line "Why it matters" bullet. Be faithful — never invent facts.
- "category": research | exams | campus | jobs | general.
- "source_label": short source name (publication/site) if evident, else "".

Respond with ONLY the JSON object — no markdown fences, no commentary.`;

/**
 * Ask the AI for the draft with automatic retries. A model response
 * that isn't valid JSON (fences, chatter, truncation) is retried with
 * a stricter instruction — the operator should never see raw JSON
 * errors, let alone click "retry" a handful of times.
 */
async function draftWithRetries(
  material: string,
  sourceUrl: string | null,
): Promise<{ draft?: DraftArticlePayload & { source_url: string | null }; error?: string }> {
  let lastError = "The AI could not draft the article";
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const messages: GatewayMessage[] = [
      { role: "system", content: DRAFT_SYSTEM },
      {
        role: "user",
        content:
          attempt === 0
            ? `Material:\n"""\n${material.slice(0, 12_000)}\n"""`
            : `Material:\n"""\n${material.slice(0, 12_000)}\n"""\n\nIMPORTANT: your previous reply was not usable JSON. Answer with ONLY one valid JSON object — start with { and end with } — no fences, no extra words, complete every field.`,
      },
    ];
    try {
      const result = await gatewayChat("tutor", messages, {
        temperature: 0.3,
        maxTokens: 4_000,
      });
      const outcome = parseDraftArticle(result.content);
      const isLastAttempt = attempt === attempts - 1;
      if (outcome.value && (isLastAttempt || !outcome.truncated)) {
        return { draft: { ...outcome.value, source_url: sourceUrl } };
      }
      lastError = outcome.error ?? "The AI response was cut off";
      console.warn(`[news] draft attempt ${attempt + 1} unusable: ${lastError}`);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "The AI draft failed";
      console.warn(`[news] draft attempt ${attempt + 1} failed: ${lastError}`);
    }
  }
  return { error: lastError };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: zodFieldMessage(parsed.error) ?? "Invalid news payload" },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "settings") {
    const { data: current } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "news")
      .maybeSingle();
    const merged: NewsSettings = { ...newsSettings(current?.value ?? null), ...body.patch };
    const { error } = await admin
      .from("site_settings")
      .upsert(
        { key: "news", value: toJson(merged), updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) return dbErrorResponse("save the news settings", error);
    return Response.json({ ok: true, settings: merged });
  }

  if (body.action === "create") {
    const { data, error } = await admin
      .from("news_articles")
      .insert({
        title: body.title,
        summary: body.summary,
        content_md: body.content_md,
        category: body.category,
        source_url: body.source_url ?? null,
        source_label: body.source_label ?? null,
        image_url: body.image_url ?? null,
        status: body.status,
        pinned: body.pinned,
        auto: false,
        published_at: body.status === "published" ? new Date().toISOString() : null,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) {
      return dbErrorResponse("create the article", error ?? null);
    }
    return Response.json({ ok: true, article: toRow(data) });
  }

  if (body.action === "update") {
    const patch: Partial<{
      title: string;
      summary: string;
      content_md: string;
      category: string;
      source_url: string | null;
      source_label: string | null;
      image_url: string | null;
      status: string;
      pinned: boolean;
      published_at: string | null;
      updated_at: string;
    }> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.summary !== undefined) patch.summary = body.summary;
    if (body.content_md !== undefined) patch.content_md = body.content_md;
    if (body.category !== undefined) patch.category = body.category;
    if (body.source_url !== undefined) patch.source_url = body.source_url ?? null;
    if (body.source_label !== undefined) patch.source_label = body.source_label ?? null;
    if (body.image_url !== undefined) patch.image_url = body.image_url ?? null;
    if (body.status !== undefined) {
      patch.status = body.status;
      // Publishing stamps the time; unpublishing keeps the old stamp.
      if (body.status === "published") patch.published_at = new Date().toISOString();
    }
    if (body.pinned !== undefined) patch.pinned = body.pinned;

    const { data, error } = await admin
      .from("news_articles")
      .update(patch)
      .eq("id", body.id)
      .select(COLUMNS)
      .single();
    if (error || !data) {
      return dbErrorResponse("update the article", error ?? null);
    }
    return Response.json({ ok: true, article: toRow(data) });
  }

  if (body.action === "delete") {
    const { error } = await admin.from("news_articles").delete().eq("id", body.id);
    if (error) return dbErrorResponse("delete the article", error);
    return Response.json({ ok: true });
  }

  if (body.action === "draft") {
    if (!gatewayConfigured()) {
      return Response.json(
        { error: "The AI gateway is not configured on this deployment" },
        { status: 503 },
      );
    }
    let material = body.text;
    let sourceUrl: string | null = null;
    let fallbackTitle = "";
    let fallbackSummary = "";
    let fallbackLabel = "";
    let fallbackImage: string | null = null;
    if (/^https?:\/\//i.test(material)) {
      sourceUrl = material;
      const page = await fetchPage(material);
      if (!page.ok || page.text.length < 60) {
        return Response.json(
          {
            error: `Could not read that page${page.error ? ` (${page.error})` : ""} — paste the article text instead`,
          },
          { status: 422 },
        );
      }
      fallbackTitle = page.title;
      fallbackSummary = page.description;
      fallbackLabel = page.siteLabel;
      fallbackImage = page.image_url;
      material = page.text;
    }
    const result = await draftWithRetries(material, sourceUrl);
    if (!result.draft) {
      return Response.json({ error: `AI draft failed: ${result.error}` }, { status: 502 });
    }
    return Response.json({
      ok: true,
      draft: {
        ...result.draft,
        title: result.draft.title.slice(0, 300),
        // Stay inside the create/update limits so Publish never bounces
        // the draft back with a length error.
        summary: (result.draft.summary || fallbackSummary).slice(0, 400),
        source_label: (result.draft.source_label || fallbackLabel).slice(0, 120),
        image_url: fallbackImage,
      },
      source_page: sourceUrl
        ? { title: fallbackTitle, label: fallbackLabel, description: fallbackSummary }
        : null,
    });
  }

  if (body.action === "ingest") {
    // Load each URL and report what the page is about — no AI, no
    // database writes. The operator reviews the previews, then turns
    // any of them into a draft with the AI.
    const previews = await Promise.all(
      body.urls.map(async (url) => {
        const page = await fetchPage(url);
        if (!page.ok) {
          return { url, ok: false as const, error: page.error ?? "Could not load the page" };
        }
        const previewText = page.text.slice(0, 900);
        return {
          url,
          ok: true as const,
          title: page.title || url,
          site_label: page.siteLabel,
          description: page.description,
          text_preview: previewText,
          word_count: page.wordCount,
          image_url: page.image_url,
        };
      }),
    );
    return Response.json({ ok: true, previews });
  }

  // refresh — fetch the sources now and report every found item.
  try {
    const { ran, result } = await refreshNews(admin, "manual");
    return Response.json({ ok: true, ran, result: result ?? null });
  } catch (error) {
    console.error("[news] manual refresh crashed:", error);
    return Response.json(
      { error: "The news fetch crashed — open System → Database setup if this repeats" },
      { status: 502 },
    );
  }
}
