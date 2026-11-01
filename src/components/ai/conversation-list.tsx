"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";

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

/** Sidebar / sheet conversation list for the AI tutor. */

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  className,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename?: (id: string, title: string) => Promise<void>;
  className?: string;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Rename dialog state.
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);

  const relative = (iso: string): string => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return iso;
    }
  };

  const openRename = (conversation: ConversationSummary) => {
    setRenameId(conversation.id);
    setRenameTitle(conversation.title || "");
  };

  const submitRename = async () => {
    if (!renameId || !onRename) return;
    const title = renameTitle.trim();
    if (title.length === 0) return;
    setRenaming(true);
    try {
      await onRename(renameId, title);
    } finally {
      setRenaming(false);
      setRenameId(null);
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <Button onClick={onNew} className="focus-ring w-full justify-start gap-2">
        <MessageSquarePlus className="size-4" aria-hidden />
        New conversation
      </Button>

      <nav aria-label="Tutor conversations" className="min-h-0 flex-1">
        {conversations.length === 0 ? (
          <p className="text-muted-foreground px-1 py-6 text-center text-sm">
            No conversations yet — ask your first question below.
          </p>
        ) : (
          <ul className="scrollbar-slim max-h-96 space-y-1 overflow-y-auto">
            {conversations.map((conversation) => (
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
                    <span className="block truncate text-sm font-medium">
                      {conversation.title || "Untitled conversation"}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {relative(conversation.updated_at)}
                    </span>
                  </button>
                  {onRename ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="focus-ring text-muted-foreground size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => openRename(conversation)}
                      aria-label={`Rename conversation "${conversation.title || "Untitled"}"`}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="focus-ring text-muted-foreground mr-1 size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => setConfirmId(conversation.id)}
                    aria-label={`Delete conversation "${conversation.title || "Untitled"}"`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
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
            <DialogDescription>Give this chat a name you&apos;ll recognise.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitRename();
              }
            }}
            maxLength={80}
            autoFocus
            aria-label="Conversation title"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameId(null)} disabled={renaming}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitRename()}
              disabled={renaming || renameTitle.trim().length === 0}
            >
              {renaming ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The conversation and all its messages will be permanently removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={async () => {
                if (!confirmId) return;
                setDeleting(true);
                try {
                  await onDelete(confirmId);
                } finally {
                  setDeleting(false);
                  setConfirmId(null);
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
