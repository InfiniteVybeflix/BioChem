import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { AdSlot } from "@/components/ads/ad-slot";
import { ThreadList } from "@/components/community/thread-list";
import type { ProfileLite, TopicLite } from "@/components/community/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ExamZone } from "@/types/domain";

export const metadata = { title: "Discussions — BioChem" };

/**
 * Community hub: discussion threads, newest activity first with pinned
 * threads floated to the top. Related author/topic rows are fetched
 * separately (typed client embeds are unavailable for these relations).
 */
export default async function CommunityPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Discussions"
          description="Ask questions, share explanations, help coursemates."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const [{ data: discussions }, { data: topics }] = await Promise.all([
    supabase
      .from("discussions")
      .select(
        "id, topic_id, user_id, title, body_md, is_answered, is_pinned, views, reply_count, last_activity_at, created_at",
      )
      .order("last_activity_at", { ascending: false })
      .limit(30),
    supabase.from("topics").select("id, zone, title, slug").order("order_index"),
  ]);

  const authorIds = [...new Set((discussions ?? []).map((row) => row.user_id))];
  const { data: authorRows } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url, role").in("id", authorIds)
    : { data: [] as ProfileLite[] };

  const authors: ProfileLite[] = authorRows ?? [];
  const topicList: TopicLite[] = (topics ?? []).map((topic) => ({
    id: topic.id,
    zone: topic.zone as ExamZone,
    title: topic.title,
    slug: topic.slug,
  }));

  // Pinned threads first, newest activity within each group.
  const sorted = [...(discussions ?? [])].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return b.last_activity_at.localeCompare(a.last_activity_at);
  });

  return (
    <>
      <PageHeader
        title="Discussions"
        description="Ask questions, share explanations, help coursemates."
        actions={
          <span className="border-border/70 bg-card/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur">
            <MessagesSquare className="text-primary size-3.5" aria-hidden />
            {discussions?.length ?? 0} recent threads
          </span>
        }
      />
      <ThreadList initialDiscussions={sorted} authors={authors} topics={topicList} />

      {/* Sponsored events slot. */}
      <AdSlot placement="events" />
    </>
  );
}
