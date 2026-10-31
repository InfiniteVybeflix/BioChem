"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  AtSign,
  Bell,
  BookOpen,
  Briefcase,
  CheckCheck,
  GraduationCap,
  Inbox as InboxIcon,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/ui-bits";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/types/domain";

/**
 * Notification inbox: type icons, unread highlights, click-to-open links,
 * "Mark all read" and a realtime channel that prepends new notifications the
 * moment they land.
 */

export interface InboxItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationQueryRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_META: Record<NotificationType, { label: string; icon: typeof Bell }> = {
  new_notes: { label: "Notes", icon: BookOpen },
  mock_results: { label: "Mock results", icon: GraduationCap },
  chat_mentions: { label: "Mentions", icon: AtSign },
  daily_questions: { label: "Daily questions", icon: Sparkles },
  announcements: { label: "Announcements", icon: Megaphone },
  jobs: { label: "Jobs", icon: Briefcase },
  system: { label: "System", icon: Bell },
};

const INBOX_FIELDS = "id, type, title, body, link, read_at, created_at";

function mapRow(row: NotificationQueryRow): InboxItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function Inbox({ initialNotifications }: { initialNotifications: InboxItem[] }) {
  const router = useRouter();
  const { supabase, userId } = useUser();
  const [items, setItems] = useState<InboxItem[]>(initialNotifications);
  const [busy, setBusy] = useState(false);

  const unread = items.filter((item) => item.readAt === null).length;

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from("notifications")
      .select(INBOX_FIELDS)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setItems(data.map(mapRow));
  }, [supabase, userId]);

  // Re-sync on mount (covers drift between the server render and mount).
  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: new notifications are prepended the moment they're inserted.
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`inbox-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationQueryRow;
          setItems((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [mapRow(row), ...prev].slice(0, 50);
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const openItem = useCallback(
    (item: InboxItem) => {
      if (item.readAt === null && supabase) {
        void supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", item.id);
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
          ),
        );
      }
      if (item.link) router.push(item.link);
    },
    [router, supabase],
  );

  const markAllRead = useCallback(async () => {
    if (!supabase || unread === 0) return;
    setBusy(true);
    const now = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
    setItems((prev) =>
      prev.map((entry) => (entry.readAt === null ? { ...entry, readAt: now } : entry)),
    );
    setBusy(false);
  }, [supabase, unread]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          <span className="font-heading text-foreground text-base font-semibold">{unread}</span>{" "}
          unread
          {items.length > 0 ? (
            <span className="text-muted-foreground/80"> · {items.length} in inbox</span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={busy || unread === 0}
          className="focus-ring"
        >
          <CheckCheck className="size-4" aria-hidden />
          {busy ? "Marking…" : "Mark all read"}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="size-6" aria-hidden />}
          title="Nothing here yet"
          description="Nothing here yet — results, mentions and daily questions land in this inbox."
        />
      ) : (
        <ul className="glass-card divide-border/60 scrollbar-slim max-h-[34rem] divide-y overflow-y-auto">
          {items.map((item) => {
            const meta = TYPE_META[item.type] ?? TYPE_META.system;
            const Icon = meta.icon;
            const unreadRow = item.readAt === null;
            const content = (
              <span
                className={cn(
                  "flex w-full items-start gap-3 p-4 text-left transition-colors sm:p-5",
                  unreadRow && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                    unreadRow ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        unreadRow && "font-semibold",
                      )}
                    >
                      {item.title}
                    </span>
                    {unreadRow ? (
                      <span
                        className="bg-primary size-2 shrink-0 rounded-full"
                        aria-label="Unread"
                      />
                    ) : null}
                  </span>
                  {item.body ? (
                    <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-sm leading-5">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground/80 mt-1 block text-xs">
                    {meta.label} ·{" "}
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </span>
            );
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="focus-ring block w-full text-left"
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 ? (
        <p className="sr-only" role="status" aria-live="polite">
          {unread} unread notifications
        </p>
      ) : null}
    </div>
  );
}
