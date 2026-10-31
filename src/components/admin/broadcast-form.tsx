"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

type Audience = "all" | "students" | "lecturers";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

/**
 * Broadcast composer: markdown body with live preview, audience selector and
 * every signed-in user (notifications + announcement row).
 */
export function BroadcastForm({
  draft,
  onDraftUsed,
}: {
  draft?: { title: string; contentMd: string } | null;
  onDraftUsed?: () => void;
}) {
  const base = useConsoleBase();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (draft) {
      setTitle(draft.title);
      setBody(draft.contentMd);
      onDraftUsed?.();
    }
  }, [draft, onDraftUsed]);
  const [audience, setAudience] = useState<Audience>("all");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (title.trim().length < 3) {
      toast.error("Give the announcement a title");
      return;
    }
    if (body.trim().length < 5) {
      toast.error("Write the announcement body");
      return;
    }
    setSending(true);
    try {
      const response = await fetch(consoleUrl(base, "api/broadcast"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Couldn't send the broadcast",
        );
        return;
      }
      const notified =
        typeof payload === "object" && payload !== null && "notified" in payload
          ? Number((payload as { notified: unknown }).notified)
          : 0;
      toast.success(`Broadcast sent to ${notified} user${notified === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setPreview(false);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="broadcast-title">Title</Label>
        <Input
          id="broadcast-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          placeholder="e.g. Main exam dates are out"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="broadcast-body">Body (markdown)</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreview((value) => !value)}
            className="focus-ring h-9"
            aria-pressed={preview}
          >
            {preview ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
            {preview ? "Edit" : "Preview"}
          </Button>
        </div>
        {preview ? (
          <div className="scrollbar-slim border-border bg-muted/30 max-h-72 overflow-y-auto rounded-xl border p-4">
            {body.trim().length > 0 ? (
              <Markdown>{body}</Markdown>
            ) : (
              <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
            )}
          </div>
        ) : (
          <Textarea
            id="broadcast-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={
              "Write the announcement…\n\nRevised CAT 2 dates, new notes in the metabolism zone, etc."
            }
            className="min-h-40 font-mono text-sm"
          />
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="broadcast-audience">Audience</Label>
          <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
            <SelectTrigger id="broadcast-audience" aria-label="Choose the audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="students">Students</SelectItem>
              <SelectItem value="lecturers">Lecturers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" onClick={() => void send()} disabled={sending} className="focus-ring">
        {sending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Megaphone className="size-4" aria-hidden />
        )}
        {sending ? "Sending…" : "Send broadcast"}
      </Button>
      <span className="sr-only" role="status">
        {sending ? "Sending broadcast" : "Ready to broadcast"}
      </span>
    </div>
  );
}
