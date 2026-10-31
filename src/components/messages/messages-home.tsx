"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageCircle, MessagesSquare, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/ui-bits";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import {
  createDirectConversation,
  createGroupConversation,
  joinLounge,
  loadConversations,
  type ConversationSummary,
} from "@/lib/chat/conversations";
import { NewChatDialog } from "@/components/messages/new-chat-dialog";

/**
 * The messages home: every conversation of the signed-in user, plus
 * the open Community Lounge and the New-chat composer (direct or
 * study group). Selecting a conversation opens its realtime window.
 */
export function MessagesHome() {
  const router = useRouter();
  const { supabase, userId, profile } = useUser();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loungeBusy, setLoungeBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    const summaries = await loadConversations(supabase, userId);
    setConversations(summaries);
  }, [supabase, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live updates: a new message in any conversation bumps it up the list.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("conv-list");
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_conversations" },
      () => void refresh(),
    );
    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  const openLounge = async () => {
    if (!supabase || !userId) return;
    setLoungeBusy(true);
    const lounge = await joinLounge(supabase, userId);
    setLoungeBusy(false);
    if (!lounge) {
      toast.error("Couldn't open the lounge — try again");
      return;
    }
    router.push(`/messages/${lounge.id}`);
  };

  const startDirect = async (otherUserId: string) => {
    if (!supabase || !userId) return;
    const conversation = await createDirectConversation(supabase, userId, otherUserId);
    if (!conversation) {
      toast.error("Couldn't start the chat — try again");
      return;
    }
    router.push(`/messages/${conversation.id}`);
  };

  const createGroup = async (name: string, memberIds: string[]) => {
    if (!supabase || !userId) return null;
    const conversation = await createGroupConversation(supabase, userId, name, memberIds);
    if (conversation) void refresh();
    return conversation;
  };

  const filtered = (conversations ?? []).filter((entry) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      (entry.otherName ?? entry.conversation.name ?? "").toLowerCase().includes(needle) ||
      (entry.conversation.kind === "lounge" && "community lounge".includes(needle))
    );
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Messages</h1>
          <p className="text-muted-foreground text-sm">
            Direct chats, study groups and the community lounge — all encrypted, all realtime.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">New chat</span>
        </Button>
      </div>

      <button
        type="button"
        onClick={() => void openLounge()}
        disabled={loungeBusy}
        className="glass-card hover:border-primary/40 flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          {loungeBusy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Users className="size-5" aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Community Lounge</span>
          <span className="text-muted-foreground block text-xs">
            The open room for the whole class — share notes, voice notes and files
          </span>
        </span>
      </button>

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          aria-label="Search conversations"
          placeholder="Search conversations…"
          className="pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {conversations === null ? (
        <div className="flex justify-center py-10">
          <Loader2
            className="text-muted-foreground size-6 animate-spin"
            aria-label="Loading conversations"
          />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="size-8" aria-hidden />}
          title={search ? "Nothing matches" : "No conversations yet"}
          description={
            search
              ? "Try a different name."
              : "Start a direct chat or create a study group — everyone in your class is reachable."
          }
          action={
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Start a chat
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((entry) => {
            const isLounge = entry.conversation.kind === "lounge";
            const title =
              entry.conversation.kind === "direct"
                ? (entry.otherName ?? "Direct chat")
                : (entry.conversation.name ?? "Study group");
            return (
              <li key={entry.conversation.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/messages/${entry.conversation.id}`)}
                  className="glass-card hover:border-primary/40 flex w-full items-center gap-3 p-3.5 text-left transition-colors"
                >
                  <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                    {isLounge ? (
                      <Users className="text-muted-foreground size-5" aria-hidden />
                    ) : entry.conversation.kind === "group" ? (
                      <MessagesSquare className="text-muted-foreground size-5" aria-hidden />
                    ) : (
                      <MessageCircle className="text-muted-foreground size-5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{title}</span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {formatDistanceToNow(new Date(entry.lastAt), { addSuffix: true })}
                      </span>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {entry.conversation.kind === "direct"
                        ? "Direct message"
                        : `${entry.memberCount} member${entry.memberCount === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  {entry.unread ? (
                    <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="Unread" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <NewChatDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentUserId={userId}
        currentUserName={profile?.full_name ?? ""}
        onStartDirect={(otherId) => void startDirect(otherId)}
        onCreateGroup={createGroup}
      />
    </div>
  );
}
