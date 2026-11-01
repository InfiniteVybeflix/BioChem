import Link from "next/link";
import { ExternalLink, Newspaper, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NewsCategory, NewsListItem } from "@/types/domain";

export type { NewsListItem };

/**
 * Student-facing news cards — shared by the landing-page news section,
 * the in-app /news page and the dashboard strip. Presentational only;
 * the pages own the queries.
 */

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  research: "Research",
  exams: "Exams",
  campus: "Campus",
  jobs: "Jobs",
  general: "General",
};

const CATEGORY_BADGES: Record<NewsCategory, string> = {
  research: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  exams: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  campus: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  jobs: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  general: "border-border bg-muted text-muted-foreground",
};

/** "2 h ago" / "yesterday" / "3 d ago" — coarse is fine for news. */
export function newsDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} d ago`;
  return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

export function NewsCard({ article }: { article: NewsListItem }) {
  const date = newsDate(article.published_at);
  return (
    <article className="glass-card hover:border-primary/30 flex h-full flex-col p-5 transition-colors">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn("text-[10px]", CATEGORY_BADGES[article.category])}
        >
          {NEWS_CATEGORY_LABELS[article.category]}
        </Badge>
        {article.pinned ? <Pin className="text-primary size-3" aria-hidden /> : null}
        {date ? (
          <time
            dateTime={article.published_at ?? undefined}
            className="text-muted-foreground/70 ml-auto text-[11px]"
          >
            {date}
          </time>
        ) : null}
      </div>
      <h3 className="mt-3 leading-snug font-semibold">{article.title}</h3>
      {article.summary ? (
        <p className="text-muted-foreground mt-2 line-clamp-3 text-sm leading-6">
          {article.summary}
        </p>
      ) : null}
      <div className="mt-auto pt-3">
        {article.source_url ? (
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            {article.source_label || "Read the source"}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <span className="text-muted-foreground/60 text-xs">BioChem news desk</span>
        )}
      </div>
    </article>
  );
}

export function NewsGrid({ articles }: { articles: NewsListItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <NewsCard key={article.id} article={article} />
      ))}
    </div>
  );
}

/** Small strip used on the dashboard. */
export function NewsStrip({ articles }: { articles: NewsListItem[] }) {
  if (articles.length === 0) return null;
  return (
    <div className="glass-card divide-border/60 divide-y">
      <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs font-semibold tracking-wider uppercase">
        <Newspaper className="text-primary size-3.5" aria-hidden />
        Latest updates
        <Link href="/news" className="text-primary ml-auto font-normal normal-case hover:underline">
          All news →
        </Link>
      </p>
      <ul>
        {articles.map((article) => (
          <li key={article.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">{article.title}</span>
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[10px]", CATEGORY_BADGES[article.category])}
            >
              {NEWS_CATEGORY_LABELS[article.category]}
            </Badge>
            {article.source_url ? (
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open source of ${article.title}`}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
