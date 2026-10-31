"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  CircleHelp,
  Eye,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/ui-bits";
import { AuthorChip } from "@/components/community/author-chip";
import type { DiscussionRow, ProfileLite, TopicLite } from "@/components/community/types";
import { useUser } from "@/hooks/use-user";
import { useDebounce } from "@/hooks/use-debounce";
import { discussionSchema } from "@/lib/validation";
import { zoneLabel } from "@/lib/constants";

type DiscussionListRow = Pick<
  DiscussionRow,
  | "id"
  | "topic_id"
  | "user_id"
  | "title"
  | "body_md"
  | "is_answered"
  | "is_pinned"
  | "views"
  | "reply_count"
  | "last_activity_at"
  | "created_at"
>;

interface ThreadListProps {
  initialDiscussions: DiscussionListRow[];
  authors: ProfileLite[];
  topics: TopicLite[];
}

const ALL_TOPICS = "__all__";

function excerpt(bodyMd: string): string {
  const flat = bodyMd
    .replace(/[#*_`>~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

function relative(iso: string): string {
  try {
    return `${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
  } catch {
    return iso;
  }
}

export function ThreadList({ initialDiscussions, authors, topics }: ThreadListProps) {
  const { supabase, userId } = useUser();

  const [discussions, setDiscussions] = useState<DiscussionListRow[]>(initialDiscussions);
  const [knownAuthors, setKnownAuthors] = useState<Map<string, ProfileLite>>(
    () => new Map(authors.map((author) => [author.id, author])),
  );
  const [topicFilter, setTopicFilter] = useState<string>(ALL_TOPICS);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formTopicId, setFormTopicId] = useState<string>("none");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);

  const refresh = useCallback(
    async (opts: { topicId: string; unanswered: boolean; query: string }) => {
      if (!supabase) return;
      setLoading(true);
      let request = supabase
        .from("discussions")
        .select(
          "id, topic_id, user_id, title, body_md, is_answered, is_pinned, views, reply_count, last_activity_at, created_at",
        )
        .order("is_pinned", { ascending: false })
        .order("last_activity_at", { ascending: false })
        .limit(30);

      if (opts.topicId !== ALL_TOPICS) request = request.eq("topic_id", opts.topicId);
      if (opts.unanswered) request = request.eq("is_answered", false);
      if (opts.query.trim()) {
        request = request.ilike("title", `%${opts.query.trim()}%`);
      }

      const { data, error } = await request;
      if (error) {
        toast.error("Couldn't load discussions", { description: error.message });
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      setDiscussions(rows);

      // Fetch any author profiles we haven't seen yet (for chips + badges).
      const missing = [...new Set(rows.map((row) => row.user_id))].filter(
        (id) => !knownAuthors.has(id),
      );
      if (missing.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role")
          .in("id", missing);
        if (profiles) {
          setKnownAuthors((prev) => {
            const next = new Map(prev);
            for (const profile of profiles) next.set(profile.id, profile);
            return next;
          });
        }
      }
      setLoading(false);
    },
    [supabase, knownAuthors],
  );

  useEffect(() => {
    // Re-query whenever a filter changes (skips the initial server render).
    void refresh({ topicId: topicFilter, unanswered: unansweredOnly, query: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicFilter, unansweredOnly, debouncedSearch]);

  const handleCreateThread = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !userId) {
      toast.error("Sign in to start a discussion");
      return;
    }

    const parsed = discussionSchema.safeParse({
      topicId: formTopicId === "none" ? null : formTopicId,
      title: formTitle,
      bodyMd: formBody,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form and try again");
      return;
    }

    setSubmitting(true);
    const { data: inserted, error } = await supabase
      .from("discussions")
      .insert({
        user_id: userId,
        title: parsed.data.title,
        body_md: parsed.data.bodyMd,
        topic_id: parsed.data.topicId ?? null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setSubmitting(false);
      toast.error("Couldn't publish the thread", { description: error?.message });
      return;
    }

    void supabase.rpc("award_xp", { p_amount: 2, p_reason: "discussion_created" });
    void fetch("/api/community/mentions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${parsed.data.title}\n${parsed.data.bodyMd}`,
        link: `/community/${inserted.id}`,
      }),
    }).catch(() => undefined);

    setSubmitting(false);
    setDialogOpen(false);
    setFormTitle("");
    setFormBody("");
    setFormTopicId("none");
    toast.success("Thread published");

    await refresh({ topicId: topicFilter, unanswered: unansweredOnly, query: debouncedSearch });
  };

  const hasFilters = topicFilter !== ALL_TOPICS || unansweredOnly || search.trim() !== "";

  return (
    <div className="space-y-4">
      {/* Filters + new thread */}
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search threads by title…"
            aria-label="Search discussions by title"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Filter by topic">
              <SelectValue placeholder="All topics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={unansweredOnly}
              onCheckedChange={setUnansweredOnly}
              aria-label="Show unanswered threads only"
            />
            Unanswered only
          </label>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" aria-hidden />
                New thread
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={handleCreateThread} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Start a discussion</DialogTitle>
                  <DialogDescription>
                    Ask a question or share an explanation — markdown and LaTeX are supported.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="thread-topic">Topic (optional)</Label>
                  <Select value={formTopicId} onValueChange={setFormTopicId}>
                    <SelectTrigger id="thread-topic" className="w-full" aria-label="Thread topic">
                      <SelectValue placeholder="No specific topic" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific topic</SelectItem>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {zoneLabel(topic.zone)} · {topic.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thread-title">Title</Label>
                  <Input
                    id="thread-title"
                    value={formTitle}
                    onChange={(event) => setFormTitle(event.target.value)}
                    required
                    minLength={6}
                    maxLength={200}
                    placeholder="e.g. Why does the TCA cycle need oxaloacetate?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="thread-body">Body</Label>
                  <Textarea
                    id="thread-body"
                    value={formBody}
                    onChange={(event) => setFormBody(event.target.value)}
                    required
                    minLength={10}
                    maxLength={10_000}
                    rows={7}
                    placeholder={
                      "Write your question or explanation…\n\nMarkdown works: **bold**, $\\Delta G$, lists, code."
                    }
                  />
                  <p className="text-muted-foreground text-xs">
                    Markdown + LaTeX supported. Mention coursemates with @full-name to notify them.
                  </p>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting} className="gap-2">
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <CircleHelp className="size-4" aria-hidden />
                    )}
                    {submitting ? "Publishing…" : "Publish thread"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* List */}
      {loading && discussions.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : discussions.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title={
            hasFilters
              ? "No threads match your filters"
              : "No discussions yet — start the first one"
          }
          description={
            hasFilters
              ? "Try clearing the search or topic filter to see every thread."
              : "Ask the question someone else is too shy to ask. First post earns XP too."
          }
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Start a discussion
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {discussions.map((row) => {
            const author = knownAuthors.get(row.user_id) ?? null;
            const topic = row.topic_id ? (topicById.get(row.topic_id) ?? null) : null;
            return (
              <li key={row.id}>
                <Link
                  href={`/community/${row.id}`}
                  className="glass-card hover:border-primary/30 focus-ring block p-4 transition-all hover:-translate-y-0.5 sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {row.is_pinned ? (
                          <Badge className="bg-primary/15 text-primary hover:bg-primary/15 gap-1">
                            <Pin className="size-3" aria-hidden />
                            Pinned
                          </Badge>
                        ) : null}
                        {row.is_answered ? (
                          <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" aria-hidden />
                            Answered
                          </Badge>
                        ) : (
                          <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400">
                            Open
                          </Badge>
                        )}
                        {topic ? (
                          <Badge variant="secondary" className="max-w-full truncate">
                            {zoneLabel(topic.zone)} · {topic.title}
                          </Badge>
                        ) : null}
                      </div>
                      <h2 className="font-heading mt-2 truncate text-base font-semibold sm:text-lg">
                        {row.title}
                      </h2>
                      <p className="text-muted-foreground mt-1 line-clamp-1 text-sm">
                        {excerpt(row.body_md)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <AuthorChip author={author} />
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3.5" aria-hidden />
                        {row.reply_count}
                        <span className="sr-only">replies</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" aria-hidden />
                        {row.views}
                        <span className="sr-only">views</span>
                      </span>
                      <span>{relative(row.last_activity_at)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
