import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { gatewayChat, gatewayConfigured } from "@/lib/ai/gateway";
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
 *   POST  { action: "refresh" }                — fetch sources now
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

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), patch: settingsPatchSchema }),
  z.object({ action: z.literal("create") }).merge(createSchema),
  updateSchema,
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
  draftSchema,
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
    return Response.json({ error: "Could not load the news desk" }, { status: 502 });
  }

  return Response.json({
    settings: newsSettings(settingsRow?.value ?? null),
    articles: (articles ?? []).map(toRow),
    configured: gatewayConfigured(),
  });
}

/** Fetch an external article URL and reduce it to readable text for the AI. */
async function urlToText(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: { "User-Agent": "BioChem-News/1.0 (+https://biokem.vercel.app)" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 12_000);
  } catch {
    return null;
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

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid news payload" },
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
    if (error) return Response.json({ error: "Could not save the news settings" }, { status: 502 });
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
      return Response.json({ error: "Could not create the article" }, { status: 502 });
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
      return Response.json({ error: "Could not update the article" }, { status: 502 });
    }
    return Response.json({ ok: true, article: toRow(data) });
  }

  if (body.action === "delete") {
    const { error } = await admin.from("news_articles").delete().eq("id", body.id);
    if (error) return Response.json({ error: "Could not delete the article" }, { status: 502 });
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
    if (/^https?:\/\//i.test(material)) {
      sourceUrl = material;
      const extracted = await urlToText(material);
      if (!extracted || extracted.length < 60) {
        return Response.json(
          { error: "Could not read that page — paste the article text instead" },
          { status: 422 },
        );
      }
      material = extracted;
    }
    try {
      const result = await gatewayChat(
        "tutor",
        [
          { role: "system", content: DRAFT_SYSTEM },
          { role: "user", content: `Material:\n"""\n${material.slice(0, 12_000)}\n"""` },
        ],
        { temperature: 0.3, maxTokens: 4_000 },
      );
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("The AI response was not JSON");
      const record = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const title = typeof record["title"] === "string" ? record["title"] : "";
      if (title.length < 4) throw new Error("The AI returned no usable draft");
      const categoryRaw =
        typeof record["category"] === "string" ? record["category"].toLowerCase() : "general";
      return Response.json({
        ok: true,
        draft: {
          title: title.slice(0, 300),
          summary: typeof record["summary"] === "string" ? record["summary"].slice(0, 400) : "",
          content_md: typeof record["content_md"] === "string" ? record["content_md"] : "",
          category: ["research", "exams", "campus", "jobs", "general"].includes(categoryRaw)
            ? categoryRaw
            : "general",
          source_url: sourceUrl,
          source_label: typeof record["source_label"] === "string" ? record["source_label"] : "",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI draft failed";
      return Response.json({ error: `AI draft failed: ${message}` }, { status: 502 });
    }
  }

  // refresh — fetch the sources now.
  const { ran, result } = await refreshNews(admin, "manual");
  return Response.json({ ok: true, ran, result: result ?? null });
}
