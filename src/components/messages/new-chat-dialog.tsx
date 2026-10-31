"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * New-chat composer: search any classmate and start a direct chat, or
 * create a study group with multiple members. Everyone at your school
 * (plus staff) is reachable by name.
 */

interface DirectoryUser {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

export function NewChatDialog({
  open,
  onOpenChange,
  currentUserId,
  currentUserName,
  onStartDirect,
  onCreateGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string | null;
  currentUserName: string;
  onStartDirect: (otherUserId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<{ id: string } | null>;
}) {
  const supabase = getSupabaseBrowserClient();
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !supabase || directory.length > 0) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role, avatar_url")
        .neq("suspended", true)
        .limit(500);
      setDirectory((data ?? []).filter((user) => user.id !== currentUserId) as DirectoryUser[]);
    })();
  }, [open, supabase, directory.length, currentUserId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return directory.slice(0, 30);
    return directory.filter((user) => user.full_name.toLowerCase().includes(needle)).slice(0, 30);
  }, [directory, search]);

  const startDirect = (otherUserId: string) => {
    onOpenChange(false);
    onStartDirect(otherUserId);
  };

  const createGroup = async () => {
    if (groupName.trim().length < 2) {
      toast.error("Give the group a name");
      return;
    }
    if (selected.size === 0) {
      toast.error("Pick at least one member");
      return;
    }
    setBusy(true);
    const conversation = await onCreateGroup(groupName.trim(), [...selected]);
    setBusy(false);
    if (conversation) {
      toast.success("Study group created");
      onOpenChange(false);
      setGroupName("");
      setSelected(new Set());
    } else {
      toast.error("Couldn't create the group — try again");
    }
  };

  const toggleMember = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>
            Direct messages and study groups, encrypted end-to-end.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="direct">
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1 gap-1.5">
              <MessageCircle className="size-3.5" aria-hidden /> Direct
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1 gap-1.5">
              <Users className="size-3.5" aria-hidden /> Study group
            </TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="mt-4 space-y-3">
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                aria-label="Search people"
                placeholder="Search by name…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="text-muted-foreground py-6 text-center text-sm">
                  {directory.length === 0 ? "Loading people…" : "No matches"}
                </li>
              ) : null}
              {filtered.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => startDirect(user.id)}
                    className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors"
                  >
                    <span className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                      {user.full_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.full_name}</span>
                      <span className="text-muted-foreground text-xs capitalize">{user.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="group" className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                placeholder="e.g. Enzymes kinetics revision"
                maxLength={80}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
            </div>
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                aria-label="Search people to add"
                placeholder="Add members…"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {filtered.map((user) => {
                const isSelected = selected.has(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => toggleMember(user.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                        {user.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{user.full_name}</span>
                        <span className="text-muted-foreground text-xs capitalize">
                          {user.role}
                        </span>
                      </span>
                      {isSelected ? (
                        <span className="text-primary text-xs font-semibold">Added</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button
              className="w-full gap-2"
              disabled={busy || groupName.trim().length < 2 || selected.size === 0}
              onClick={() => void createGroup()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Create group with {selected.size} member{selected.size === 1 ? "" : "s"}
            </Button>
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground/70 text-center text-xs">
          Chatting as <strong>{currentUserName || "you"}</strong>
        </p>
      </DialogContent>
    </Dialog>
  );
}
