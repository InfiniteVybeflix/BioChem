import { NewsManager } from "@/components/console/news-manager";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { loadNewsSettings } from "@/lib/news/refresh";
import type { NewsCategory } from "@/types/domain";

/**
 * Console — News desk. Live biochemistry updates from the internet
 * (AI auto-search over RSS sources) plus hand-written campus notices.
 */

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

const CATEGORIES: readonly NewsCategory[] = ["research", "exams", "campus", "jobs", "general"];

export default async function ConsoleNewsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [settings, { data: articles }] = await Promise.all([
    loadNewsSettings(admin),
    admin
      .from("news_articles")
      .select(
        "id, title, summary, content_md, category, source_url, source_label, image_url, status, pinned, auto, published_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rows = (articles ?? []).map((row) => {
    const record = row as RawNewsRow;
    return {
      ...record,
      category: (CATEGORIES as readonly string[]).includes(record.category)
        ? (record.category as NewsCategory)
        : "general",
    };
  });

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">News desk</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Biochemistry live updates from the internet and your own campus notices — on the landing
        page, the in-app news page and the student dashboard.
      </p>
      <div className="mt-4">
        <NewsManager initialSettings={settings} initialArticles={rows} aiConfigured={gatewayConfigured()} />
      </div>
    </div>
  );
}
