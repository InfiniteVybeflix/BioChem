import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/common/setup-notice";
import { ThreadView } from "@/components/community/thread-view";
import type { ProfileLite, ReplyView, TopicLite } from "@/components/community/types";
import { getSupabaseServerClient, getAuthContext } from "@/lib/supabase/server";
import type { ExamZone } from "@/types/domain";

export const metadata = { title: "Discussion — BioChem" };

/**
 * Thread detail: original post + replies (with verification status) and the
 * viewer's upvote sets so the client can render toggles without a second
 * round-trip. The view counter increments fire-and-forget.
 */
export default async function ThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return <SetupNotice missing="app" />;
  }

  const { data: discussion } = await supabase
    .from("discussions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!discussion) notFound();

  const { data: replyRows } = await supabase
    .from("discussion_replies")
    .select("*")
    .eq("discussion_id", id)
    .order("created_at", { ascending: true });

  const replies = replyRows ?? [];

  // Everyone whose profile is displayed: thread author, reply authors,
  // and the staff members who verified replies.
  const profileIds = new Set<string>([
    discussion.user_id,
    ...replies.map((reply) => reply.user_id),
    ...replies.map((reply) => reply.verified_by).filter((value): value is string => value !== null),
  ]);
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role")
    .in("id", [...profileIds]);
  const profilesById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));

  let topic: TopicLite | null = null;
  if (discussion.topic_id) {
    const { data: topicRow } = await supabase
      .from("topics")
      .select("id, zone, title, slug")
      .eq("id", discussion.topic_id)
      .maybeSingle();
    if (topicRow) {
      topic = {
        id: topicRow.id,
        zone: topicRow.zone as ExamZone,
        title: topicRow.title,
        slug: topicRow.slug,
      };
    }
  }

  const replyViews: ReplyView[] = replies.map((reply) => ({
    reply,
    author: profilesById.get(reply.user_id) ?? null,
    verifiedByName: reply.verified_by
      ? (profilesById.get(reply.verified_by)?.full_name ?? null)
      : null,
  }));

  // Viewer-specific state (auth is guaranteed by the (app) layout).
  const auth = await getAuthContext();
  const viewerId = auth?.user.id ?? null;

  const replyIds = replies.map((reply) => reply.id);

  const countPromise = supabase
    .from("discussion_upvotes")
    .select("user_id", { count: "exact", head: true })
    .eq("discussion_id", id);
  const minePromise = viewerId
    ? supabase
        .from("discussion_upvotes")
        .select("user_id")
        .eq("discussion_id", id)
        .eq("user_id", viewerId)
        .maybeSingle()
    : null;
  const replyUpvotePromise =
    viewerId && replyIds.length > 0
      ? supabase
          .from("reply_upvotes")
          .select("reply_id")
          .eq("user_id", viewerId)
          .in("reply_id", replyIds)
      : null;

  const [countResult, mineResult, replyUpvoteResult] = await Promise.all([
    countPromise,
    minePromise,
    replyUpvotePromise,
  ]);

  const discussionUpvoteCount = countResult.count ?? 0;
  const myDiscussionUpvote = Boolean(mineResult?.data);
  const myReplyUpvoteIds = new Set((replyUpvoteResult?.data ?? []).map((row) => row.reply_id));

  // Fire-and-forget view counter.
  void supabase.rpc("increment_discussion_views", { p_discussion_id: id });

  const authorProfile: ProfileLite | null = profilesById.get(discussion.user_id) ?? null;

  return (
    <ThreadView
      discussion={discussion}
      author={authorProfile}
      topic={topic}
      initialReplies={replyViews}
      initialReplyUpvoteIds={[...myReplyUpvoteIds]}
      initialDiscussionUpvotes={discussionUpvoteCount}
      initialDiscussionUpvoted={myDiscussionUpvote}
      viewerId={viewerId}
    />
  );
}
