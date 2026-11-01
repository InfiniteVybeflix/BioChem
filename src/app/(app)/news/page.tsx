import { Newspaper } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { NewsGrid, type NewsListItem } from "@/components/news/news-cards";
import { getAuthContext } from "@/lib/supabase/server";
import { loadNewsSurface } from "@/lib/news/queries";

export const metadata = { title: "News & updates" };

/**
 * Signed-in news page — the in-app home of the news desk: live
 * biochemistry updates from the internet plus the campus notices the
 * operator publishes. Respects the console's news switches.
 */
export default async function NewsPage() {
  const auth = await getAuthContext();
  if (!auth) return null;
  const { supabase } = auth;
  if (!supabase) {
    return <SetupNotice missing="app" />;
  }

  const { settings, articles } = await loadNewsSurface(supabase, 60);

  const pinnedFirst = [...articles].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="News & updates"
        description="Live biochemistry stories from around the web, plus campus notices and exam announcements from your news desk."
      />

      {!settings.enabled || !settings.show_in_app ? (
        <div className="glass-card flex flex-col items-center px-6 py-14 text-center">
          <span className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-2xl">
            <Newspaper className="size-6" aria-hidden />
          </span>
          <p className="font-heading text-lg font-semibold">News is switched off</p>
          <p className="text-muted-foreground mt-1.5 max-w-md text-sm">
            The news desk is currently disabled. Check back later — campus notices and biochemistry
            updates will appear here when it&apos;s on.
          </p>
        </div>
      ) : pinnedFirst.length === 0 ? (
        <div className="glass-card flex flex-col items-center px-6 py-14 text-center">
          <span className="bg-primary/10 text-primary mb-4 flex size-12 items-center justify-center rounded-2xl">
            <Newspaper className="size-6" aria-hidden />
          </span>
          <p className="font-heading text-lg font-semibold">No updates yet</p>
          <p className="text-muted-foreground mt-1.5 max-w-md text-sm">
            The news desk hasn&apos;t published anything yet — the first biochemistry stories and
            campus notices will land here soon.
          </p>
        </div>
      ) : (
        <NewsGrid articles={pinnedFirst as NewsListItem[]} />
      )}
    </div>
  );
}
