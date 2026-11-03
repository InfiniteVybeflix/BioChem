"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  MessageSquarePlus,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Sidebar / sheet conversation list for Nova.
 * Real operations only: rename (PATCH), archive / unarchive (the
 * `archived` column), delete (cascade), and client-side search across the
 * loaded conversations.
 */

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  archived?: boolean;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onArchive,
  className,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [showArchived, setShowArchived] = useState(false);

  const needle = query.trim().toLowerCase();
  const { active, archived } = useMemo(() => {
    const match = (conversation: ConversationSummary) =>
      needle.length === 0 || conversation.title.toLowerCase().includes(needle);
    return {
      active: conversations.filter((conversation) => !conversation.archived && match(conversation)),
      archived: conversations.filter((conversation) => conversation.archived && match(conversation)),
    };
  }, [conversations, needle]);

  const targetTitle = (id: string): string =>
    conversations.find((conversation) => conversation.id === id)?.title || "Untitled";

  const submitRename = async () => {
    if (!renameId) return;
    const title = renameValue.trim();
    if (title.length === 0) return;
    setRenaming(true);
    try {
      await onRename(renameId, title);
      setRenameId(null);
    } finally {
      setRenaming(false);
    }
  };

  const row = (conversation: ConversationSummary, isArchived: boolean) => (
    <li key={conversation.id}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg border border-transparent transition-all",
          conversation.id === activeId
            ? "border-primary/40 bg-primary/10"
            : "hover:border-border hover:bg-muted/40",
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(conversation.id)}
          className="focus-ring min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left"
          aria-current={conversation.id === activeId ? "true" : undefined}
        >
          <span
            className={cn(
              "block truncate text-sm font-medium",
              isArchived && "text-muted-foreground",
            )}
          >
            {conversation.title || "Untitled conversation"}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {relative(conversation.updated_at)}
          </span>
        </button>
        <div className="mr-1 flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="focus-ring text-muted-foreground size-7 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => {
              setRenameId(conversation.id);
              setRenameValue(conversation.title || "");
            }}
            aria-label={`Rename conversation "${conversation.title || "Untitled"}"`}
            title="Rename"
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="focus-ring text-muted-foreground size-7 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => void onArchive(conversation.id, !isArchived)}
            aria-label={
              isArchived
                ? `Unarchive conversation "${conversation.title || "Untitled"}"`
                : `Archive conversation "${conversation.title || "Untitled"}"`
            }
            title={isArchived ? "Unarchive" : "Archive"}
          >
            {isArchived ? (
              <ArchiveRestore className="size-3.5" aria-hidden />
            ) : (
              <Archive className="size-3.5" aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="focus-ring text-muted-foreground hover:text-rose-600 size-7 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => setConfirmDeleteId(conversation.id)}
            aria-label={`Delete conversation "${conversation.title || "Untitled"}"`}
            title="Delete"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </li>
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <Button onClick={onNew} className="focus-ring w-full justify-start gap-2">
        <MessageSquarePlus className="size-4" aria-hidden />
        New conversation
      </Button>

      {conversations.length > 3 ? (
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations…"
            className="focus-ring h-9 pl-8 text-sm"
            aria-label="Search conversations"
          />
        </div>
      ) : null}

      <nav aria-label="Nova conversations" className="min-h-0 flex-1">
        {active.length === 0 && archived.length === 0 ? (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            {needle.length > 0 ? "No conversations match your search." : "No conversations yet — ask your first question below."}
          </p>
        ) : (
          <div className="scrollbar-slim max-h-[26rem] space-y-3 overflow-y-auto pr-1">
            <ul className="space-y-1">
              {active.map((conversation) => row(conversation, false))}
            </ul>

            {archived.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => setShowArchived((open) => !open)}
                  className="focus-ring text-muted-foreground hover:text-foreground flex w-full items-center gap-1 rounded px-1 py-1 text-xs font-medium uppercase tracking-wide"
                  aria-expanded={showArchived}
                >
                  <ChevronDown
                    className={cn("size-3.5 transition-transform", !showArchived && "-rotate-90")}
                    aria-hidden
                  />
                  Archived ({archived.length})
                </button>
                {showArchived ? <ul className="mt-1 space-y-1">{archived.map((conversation) => row(conversation, true))}</ul> : null}
              </div>
            ) : null}
          </div>
        )}
      </nav>

      {/* Rename dialog */}
      <Dialog
        open={renameId !== null}
        onOpenChange={(open) => {
          if (!open) setRenameId(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Give this thread a name you will recognise later.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submitRename();
            }}
            maxLength={120}
            autoFocus
            aria-label="Conversation name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button onClick={() => void submitRename()} disabled={renaming || renameValue.trim().length === 0}>
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{confirmDeleteId ? targetTitle(confirmDeleteId) : ""}&quot; and all its messages
              will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async () => {
                if (!confirmDeleteId) return;
                setDeleting(true);
                try {
                  await onDelete(confirmDeleteId);
                } finally {
                  setDeleting(false);
                  setConfirmDeleteId(null);
                }
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
