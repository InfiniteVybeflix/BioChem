"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Topbar bell: unread count + recent items, realtime-updated. */
export function NotificationBell() {
  const { supabase, userId } = useUser();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    setItems(data ?? []);
    setUnread((data ?? []).filter((item) => item.read_at === null).length);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  const markAllRead = useCallback(async () => {
    if (!supabase) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    void load();
  }, [supabase, load]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="focus-ring relative"
          aria-label={`Notifications (${unread} unread)`}
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span
              className={cn(
                "bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
              )}
              aria-hidden
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="text-primary focus-ring flex items-center gap-1 rounded text-xs font-medium hover:underline"
            >
              <CheckCheck className="size-3" aria-hidden /> Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">
            Nothing yet — your mock results, mentions and daily questions land here.
          </p>
        ) : (
          <ul className="scrollbar-slim max-h-96 overflow-y-auto">
            {items.map((item) => {
              const content = (
                <span
                  className={cn(
                    "block px-3 py-2.5 text-sm",
                    item.read_at === null && "bg-primary/5 font-medium",
                  )}
                >
                  <span className="block truncate">{item.title}</span>
                  {item.body ? (
                    <span className="text-muted-foreground block truncate text-xs font-normal">
                      {item.body}
                    </span>
                  ) : null}
                </span>
              );
              return (
                <li key={item.id}>
                  {item.link ? <Link href={item.link}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
        <DropdownMenuSeparator />
        <div className="p-2">
          <Button asChild variant="ghost" size="sm" className="text-primary w-full">
            <Link href="/notifications">Open inbox & settings</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
