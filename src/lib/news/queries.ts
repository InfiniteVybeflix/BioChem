import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isNewsCategory,
  newsSettings,
  type Database,
  type NewsListItem,
  type NewsSettings,
} from "@/types/domain";

/**
 * Public news queries — shared by the landing page, the /news page and
 * the dashboard strip. Respects the CMS switches: nothing is rendered
 * unless the news module is enabled (and each surface's own switch).
 */

export interface NewsSurface {
  settings: NewsSettings;
  articles: NewsListItem[];
  /** True when auto-search is on and the configured interval has elapsed. */
  refreshDue: boolean;
}

interface NewsRow {
  id: string;
  title: string;
  summary: string;
  category: string;
  source_url: string | null;
  source_label: string | null;
  pinned: boolean;
  published_at: string | null;
}

function toListItem(row: NewsRow): NewsListItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: isNewsCategory(row.category) ? row.category : "general",
    source_url: row.source_url,
    source_label: row.source_label,
    pinned: row.pinned,
    published_at: row.published_at,
  };
}

type DbClient = SupabaseClient<Database>;

/**
 * Latest published articles (pinned first).
 */
export async function loadPublishedNews(
  client: DbClient,
  limit: number,
): Promise<NewsListItem[]> {
  const { data } = await client
    .from("news_articles")
    .select("id, title, summary, category, source_url, source_label, pinned, published_at")
    .eq("status", "published")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return ((data ?? []) as unknown as NewsRow[]).map(toListItem);
}

/** Settings + articles in one call. Empty list when the module is off. */
export async function loadNewsSurface(
  client: DbClient,
  limit: number,
): Promise<NewsSurface> {
  const { data: settingsRow } = await client
    .from("site_settings")
    .select("value")
    .eq("key", "news")
    .maybeSingle();
  const settings = newsSettings(settingsRow?.value ?? null);
  if (!settings.enabled) return { settings, articles: [], refreshDue: false };
  const articles = await loadPublishedNews(client, limit);
  // Due for a background refresh? (auto-search on + interval elapsed)
  const last = settings.last_auto_run ? new Date(settings.last_auto_run).getTime() : 0;
  const refreshDue =
    settings.auto_search && Date.now() - last > settings.interval_hours * 3_600_000;
  return { settings, articles, refreshDue };
}
