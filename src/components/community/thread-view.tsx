"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronUp,
  CornerDownRight,
  Eye,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { Markdown } from "@/components/markdown/markdown";
import { AuthorChip } from "@/components/community/author-chip";
import type {
  DiscussionRow,
  ProfileLite,
  ReplyView,
  TopicLite,
} from "@/components/community/types";
import { useUser } from "@/hooks/use-user";
import { replySchema } from "@/lib/validation";
import { zoneLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ThreadViewProps {
  discussion: DiscussionRow;
  author: ProfileLite | null;
  topic: TopicLite | null;
  initialReplies: ReplyView[];
  initialReplyUpvoteIds: string[];
  initialDiscussionUpvotes: number;
  initialDiscussionUpvoted: boolean;
  viewerId: string | null;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function ThreadView({
  discussion: initialDiscussion,
  author,
  topic,
  initialReplies,
  initialReplyUpvoteIds,
  initialDiscussionUpvotes,
  initialDiscussionUpvoted,
  viewerId,
}: ThreadViewProps) {
  const { supabase, can, profile } = useUser();

  const [discussion, setDiscussion] = useState(initialDiscussion);
  const [replies, setReplies] = useState<ReplyView[]>(initialReplies);
  const profilesRef = useRef<Map<string, ProfileLite>>(
    new Map(
      [author, ...initialReplies.map((view) => view.author)]
        .filter((candidate): candidate is ProfileLite => candidate !== null)
        .map((candidate) => [candidate.id, candidate]),
    ),
  );
  const [replyUpvoteIds, setReplyUpvoteIds] = useState<Set<string>>(
    () => new Set(initialReplyUpvoteIds),
  );
  const [discussionUpvotes, setDiscussionUpvotes] = useState(initialDiscussionUpvotes);
  const [discussionUpvoted, setDiscussionUpvoted] = useState(initialDiscussionUpvoted);
  const [replyTo, setReplyTo] = useState<{ replyId: string; authorName: string } | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const isAuthor = viewerId !== null && viewerId === discussion.user_id;
  const canVerify = can("verify_answers");

  /** (Re)loads replies + any profiles / upvotes we haven't seen yet. */
  const loadReplies = useCallback(async () => {
    if (!supabase || !viewerId) return;
    setRefreshing(true);

    const { data: replyRows, error } = await supabase
      .from("discussion_replies")
      .select("*")
      .eq("discussion_id", discussion.id)
      .order("created_at", { ascending: true });

    if (error) {
      setRefreshing(false);
      return;
    }

    const rows = replyRows ?? [];
    const current = profilesRef.current;
    const missingIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.user_id, row.verified_by])
          .filter((id): id is string => id !== null && !current.has(id)),
      ),
    ];

    const profilesTask =
      missingIds.length > 0
        ? supabase.from("profiles").select("id, full_name, avatar_url, role").in("id", missingIds)
        : null;
    const upvotesTask =
      rows.length > 0
        ? supabase
            .from("reply_upvotes")
            .select("reply_id")
            .eq("user_id", viewerId)
            .in(
              "reply_id",
              rows.map((row) => row.id),
            )
        : null;

    const [profilesResult, upvotesResult] = await Promise.all([profilesTask, upvotesTask]);

    let merged = current;
    if (profilesResult?.data && profilesResult.data.length > 0) {
      merged = new Map(current);
      for (const row of profilesResult.data) merged.set(row.id, row);
      profilesRef.current = merged;
    }

    if (upvotesResult?.data) {
      setReplyUpvoteIds(new Set(upvotesResult.data.map((row) => row.reply_id)));
    }

    setReplies(
      rows.map((row) => ({
        reply: row,
        author: merged.get(row.user_id) ?? null,
        verifiedByName: row.verified_by ? (merged.get(row.verified_by)?.full_name ?? null) : null,
      })),
    );
    setRefreshing(false);
  }, [supabase, viewerId, discussion.id]);

  // Realtime: new replies from anyone land instantly.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`thread-${discussion.id}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "discussion_replies",
          filter: `discussion_id=eq.${discussion.id}`,
        },
        (payload) => {
          const newRow = payload.new as { user_id: string };
          if (newRow.user_id !== viewerId) toast.info("New reply");
          void loadReplies();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, discussion.id, viewerId, loadReplies]);

  const sortedReplies = useMemo(() => {
    // Verified answers float to the top; otherwise chronological.
    return [...replies].sort((a, b) => {
      if (a.reply.is_verified !== b.reply.is_verified) return a.reply.is_verified ? -1 : 1;
      return a.reply.created_at.localeCompare(b.reply.created_at);
    });
  }, [replies]);

  const repliesById = useMemo(() => {
    const map = new Map<string, ReplyView>();
    for (const view of replies) map.set(view.reply.id, view);
    return map;
  }, [replies]);

  const toggleDiscussionUpvote = async () => {
    if (!supabase || !viewerId) {
      toast.error("Sign in to upvote");
      return;
    }
    const liked = discussionUpvoted;
    // Optimistic flip.
    setDiscussionUpvoted(!liked);
    setDiscussionUpvotes((count) => count + (liked ? -1 : 1));

    const { error } = liked
      ? await supabase
          .from("discussion_upvotes")
          .delete()
          .eq("discussion_id", discussion.id)
          .eq("user_id", viewerId)
      : await supabase
          .from("discussion_upvotes")
          .insert({ discussion_id: discussion.id, user_id: viewerId });

    if (error) {
      setDiscussionUpvoted(liked);
      setDiscussionUpvotes((count) => count + (liked ? 1 : -1));
      toast.error("Couldn't record your upvote", { description: error.message });
    }
  };

  const toggleReplyUpvote = async (view: ReplyView) => {
    if (!supabase || !viewerId) {
      toast.error("Sign in to upvote");
      return;
    }
    const liked = replyUpvoteIds.has(view.reply.id);
    const nextSet = new Set(replyUpvoteIds);
    if (liked) nextSet.delete(view.reply.id);
    else nextSet.add(view.reply.id);
    setReplyUpvoteIds(nextSet);
    setReplies((prev) =>
      prev.map((item) =>
        item.reply.id === view.reply.id
          ? { ...item, reply: { ...item.reply, upvotes: item.reply.upvotes + (liked ? -1 : 1) } }
          : item,
      ),
    );

    const { error } = liked
      ? await supabase
          .from("reply_upvotes")
          .delete()
          .eq("reply_id", view.reply.id)
          .eq("user_id", viewerId)
      : await supabase.from("reply_upvotes").insert({ reply_id: view.reply.id, user_id: viewerId });

    if (error) {
      setReplyUpvoteIds(replyUpvoteIds);
      setReplies((prev) =>
        prev.map((item) =>
          item.reply.id === view.reply.id
            ? { ...item, reply: { ...item.reply, upvotes: item.reply.upvotes + (liked ? 1 : -1) } }
            : item,
        ),
      );
      toast.error("Couldn't record your upvote", { description: error.message });
    }
  };

  const toggleAnswered = async () => {
    if (!supabase || !isAuthor) return;
    const next = !discussion.is_answered;
    setDiscussion((prev) => ({ ...prev, is_answered: next }));
    const { error } = await supabase
      .from("discussions")
      .update({ is_answered: next })
      .eq("id", discussion.id);
    if (error) {
      setDiscussion((prev) => ({ ...prev, is_answered: !next }));
      toast.error("Couldn't update the thread", { description: error.message });
      return;
    }
    toast.success(next ? "Marked as answered" : "Reopened the thread");
  };

  const verifyReply = async (view: ReplyView) => {
    if (!supabase || !viewerId || !canVerify || view.reply.is_verified) return;
    const { error } = await supabase
      .from("discussion_replies")
      .update({ is_verified: true, verified_by: viewerId })
      .eq("id", view.reply.id);
    if (error) {
      toast.error("Couldn't verify the reply", { description: error.message });
      return;
    }

    setReplies((prev) =>
      prev.map((item) =>
        item.reply.id === view.reply.id
          ? {
              ...item,
              reply: { ...item.reply, is_verified: true, verified_by: viewerId },
              verifiedByName: profile?.full_name ?? null,
            }
          : item,
      ),
    );

    const { error: xpError } = await supabase.rpc("award_xp_to", {
      p_user: view.reply.user_id,
      p_amount: 15,
      p_reason: "reply_verified",
    });
    if (xpError) {
      toast.error("Verified, but the XP award failed", { description: xpError.message });
      return;
    }
    toast.success(`Answer verified — ${view.author?.full_name ?? "the author"} earned 15 XP`);
  };

  const startReply = (view: ReplyView) => {
    setReplyTo({ replyId: view.reply.id, authorName: view.author?.full_name ?? "coursemate" });
    setComposerBody(`@${view.author?.full_name ?? "coursemate"} `);
    composerRef.current?.focus();
  };

  const submitReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !viewerId) {
      toast.error("Sign in to reply");
      return;
    }

    const parsed = replySchema.safeParse({
      bodyMd: composerBody,
      parentReplyId: replyTo?.replyId ?? null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your reply and try again");
      return;
    }

    setSending(true);
    const { error } = await supabase.from("discussion_replies").insert({
      discussion_id: discussion.id,
      user_id: viewerId,
      parent_reply_id: parsed.data.parentReplyId ?? null,
      body_md: parsed.data.bodyMd,
    });

    if (error) {
      setSending(false);
      toast.error("Couldn't post the reply", { description: error.message });
      return;
    }

    // Notify @mentioned coursemates (best-effort).
    void fetch("/api/community/mentions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: parsed.data.bodyMd,
        link: `/community/${discussion.id}`,
      }),
    }).catch(() => undefined);

    setSending(false);
    setComposerBody("");
    setReplyTo(null);
    toast.success("Reply posted");
    await loadReplies();
  };

  const authorName = author?.full_name ?? "Unknown student";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="focus-ring gap-2">
          <Link href="/community">
            <ArrowLeft className="size-4" aria-hidden />
            All discussions
          </Link>
        </Button>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Eye className="size-3.5" aria-hidden />
          {discussion.views + 1} views
        </span>
      </div>

      {/* Original post */}
      <article className="glass-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {discussion.is_pinned ? (
            <Badge className="bg-primary/15 text-primary gap-1">Pinned</Badge>
          ) : null}
          {topic ? (
            <Badge variant="secondary">
              {zoneLabel(topic.zone)} · {topic.title}
            </Badge>
          ) : null}
          {discussion.is_answered ? (
            <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3" aria-hidden />
              Answered
            </Badge>
          ) : (
            <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Open
            </Badge>
          )}
        </div>

        <h1 className="font-heading mt-3 text-xl font-bold tracking-tight sm:text-2xl">
          {discussion.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <AuthorChip author={author} size="md" />
          <p className="text-muted-foreground text-xs">asked {relative(discussion.created_at)}</p>
        </div>

        <Separator className="my-4" />

        <Markdown>{discussion.body_md}</Markdown>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={discussionUpvoted ? "default" : "outline"}
            size="sm"
            onClick={toggleDiscussionUpvote}
            aria-pressed={discussionUpvoted}
            aria-label={discussionUpvoted ? "Remove your upvote" : "Upvote this thread"}
            className="focus-ring gap-1.5"
          >
            <ChevronUp className="size-4" aria-hidden />
            {discussionUpvotes}
            <span className="sr-only">upvotes</span>
          </Button>
          {isAuthor ? (
            <Button
              type="button"
              variant={discussion.is_answered ? "outline" : "default"}
              size="sm"
              onClick={toggleAnswered}
              className="focus-ring gap-1.5"
              aria-label={discussion.is_answered ? "Undo answered mark" : "Mark as answered"}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              {discussion.is_answered ? "Undo answered" : "Mark as answered"}
            </Button>
          ) : null}
          <span className="text-muted-foreground ml-auto inline-flex items-center gap-1.5 text-xs">
            <MessageSquare className="size-3.5" aria-hidden />
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
      </article>

      {/* Replies */}
      <section aria-label="Replies" className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">
          {replies.length > 0
            ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`
            : "Replies"}
        </h2>

        {refreshing && replies.length === 0 ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : sortedReplies.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-6" aria-hidden />}
            title="No replies yet"
            description="Be the first to help — share what you know below."
          />
        ) : (
          <ul className="space-y-3">
            {sortedReplies.map((view) => {
              const liked = replyUpvoteIds.has(view.reply.id);
              const parent = view.reply.parent_reply_id
                ? repliesById.get(view.reply.parent_reply_id)
                : null;
              return (
                <li
                  key={view.reply.id}
                  id={`reply-${view.reply.id}`}
                  className={cn(
                    "glass-card scroll-mt-24 p-4",
                    parent && "ml-0 sm:ml-6",
                    view.reply.is_verified && "border-emerald-500/40",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AuthorChip author={view.author} />
                      {view.reply.is_verified ? (
                        <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="size-3" aria-hidden />
                          Lecturer-verified
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {relative(view.reply.created_at)}
                    </span>
                  </div>

                  {parent ? (
                    <a
                      href={`#reply-${parent.reply.id}`}
                      className="text-primary focus-ring mt-2 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                    >
                      <CornerDownRight className="size-3" aria-hidden />
                      replying to @{parent.author?.full_name ?? "coursemate"}
                    </a>
                  ) : null}

                  <div className="mt-2">
                    <Markdown>{view.reply.body_md}</Markdown>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={liked ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleReplyUpvote(view)}
                      aria-pressed={liked}
                      aria-label={
                        liked ? "Remove your upvote from this reply" : "Upvote this reply"
                      }
                      className="focus-ring gap-1.5"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                      {view.reply.upvotes}
                      <span className="sr-only">upvotes</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startReply(view)}
                      className="focus-ring gap-1.5"
                    >
                      <CornerDownRight className="size-4" aria-hidden />
                      Reply
                    </Button>
                    {canVerify && !view.reply.is_verified ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => verifyReply(view)}
                        className="focus-ring gap-1.5 border-emerald-500/40 text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400"
                      >
                        <BadgeCheck className="size-4" aria-hidden />
                        Verify
                      </Button>
                    ) : null}
                    {view.reply.is_verified && view.verifiedByName ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        Verified by {view.verifiedByName}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Composer */}
      <form
        onSubmit={submitReply}
        className="glass-card space-y-3 p-4 sm:p-6"
        aria-label="Reply composer"
      >
        <div className="space-y-2">
          <Label htmlFor="reply-body">
            {replyTo ? `Replying to ${replyTo.authorName}` : "Add your reply"}
          </Label>
          {replyTo ? (
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-muted-foreground focus-ring text-xs underline underline-offset-2"
            >
              Not replying to anyone — clear
            </button>
          ) : null}
          <Textarea
            id="reply-body"
            ref={composerRef}
            value={composerBody}
            onChange={(event) => setComposerBody(event.target.value)}
            required
            minLength={2}
            maxLength={10_000}
            rows={5}
            placeholder={
              "Share your explanation…\n\nMarkdown + LaTeX supported. Use @full-name to mention someone."
            }
          />
          <p className="text-muted-foreground text-xs">
            Markdown + LaTeX supported. Mention coursemates with @full-name to notify them.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {replyTo ? (
            <span className="text-muted-foreground mr-auto text-xs">
              Replying to @{replyTo.authorName}
            </span>
          ) : null}
          <Button type="submit" disabled={sending} className="gap-2">
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {sending ? "Posting…" : "Post reply"}
          </Button>
        </div>
      </form>
    </div>
  );
}
