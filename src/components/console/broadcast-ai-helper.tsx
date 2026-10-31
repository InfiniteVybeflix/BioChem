"use client";

import { useState } from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console-side AI drafting for broadcasts: describe the announcement,
 * the assistant drafts it, and one click drops it into the composer.
 */

interface AssistantDraft {
  title: string;
  summary: string;
  contentMd: string;
}

export function BroadcastAiHelper({ onUse }: { onUse: (draft: AssistantDraft) => void }) {
  const base = useConsoleBase();
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const draft_ = async () => {
    if (instruction.trim().length < 5) {
      toast.error("Describe the announcement first");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "announcement", instruction }),
      });
      const data: { draft?: AssistantDraft; error?: string } = await response.json();
      if (!response.ok || !data.draft) {
        toast.error(data.error ?? "The assistant is unavailable");
        return;
      }
      setDraft(data.draft);
      setInstruction("");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="text-primary size-4" aria-hidden />
        <h3 className="text-sm font-semibold">Draft with AI</h3>
      </div>
      <p className="text-muted-foreground text-xs">
        Describe what needs announcing — the assistant writes it; you review, edit and send.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="ai-instruction">The gist</Label>
        <Textarea
          id="ai-instruction"
          rows={2}
          maxLength={4000}
          placeholder="e.g. CAT 1 mocks open Monday, remind year 2 students to revise enzyme kinetics"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </div>
      <Button size="sm" className="gap-2" disabled={busy} onClick={() => void draft_()}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {busy ? "Drafting…" : "Draft announcement"}
      </Button>

      {draft ? (
        <div className="border-border/60 space-y-3 rounded-xl border p-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wide uppercase">Draft</p>
            <p className="text-sm font-semibold">{draft.title}</p>
          </div>
          <div className="max-h-48 overflow-y-auto text-sm">
            <Markdown>{draft.contentMd}</Markdown>
          </div>
          <Button
            size="sm"
            onClick={() => {
              onUse(draft);
              setDraft(null);
            }}
          >
            Use this in the composer
          </Button>
        </div>
      ) : null}
    </div>
  );
}
