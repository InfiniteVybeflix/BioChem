"use client";

import { formatDistanceToNow } from "date-fns";
import { MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  className,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
  className?: string;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const relative = (iso: string): string => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return iso;
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
