"use client";

import { useEffect, useState } from "react";
import { BrainCircuit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/markdown/markdown";
import { toast } from "sonner";

export type ExplainMode = "exam" | "eli5" | "steps";

export const EXPLAIN_MODES: { value: ExplainMode; label: string; description: string }[] = [
  {
    value: "exam",
    label: "Exam answer",
    description: "How to answer this in the exam, for full marks",
  },
  { value: "eli5", label: "ELI5", description: "Explain it like I'm five — plain and simple" },
  {
    value: "steps",
    label: "Step-by-step",
    description: "Walk through the reasoning one step at a time",
  },
];

interface ExplainResponse {
  ok: boolean;
  explanation: string | null;
  error: string | null;
}

async function postExplain(payload: {
  content: string;
  mode: ExplainMode;
  noteId: string;
}): Promise<ExplainResponse> {
  try {
    const response = await fetch("/api/ai/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const parsed: unknown = await response.json().catch(() => null);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        ok: response.ok,
        explanation: typeof record.explanation === "string" ? record.explanation : null,
        error: typeof record.error === "string" ? record.error : null,
      };
    }
    return {
      ok: response.ok,
      explanation: null,
      error: response.ok ? null : "The tutor couldn't answer right now — try again in a moment.",
    };
  } catch {
    return {
      ok: false,
      explanation: null,
      error: "Network error — check your connection and try again.",
    };
  }
}

/**
 * AI explanation dialog: POSTs the note content to /api/ai/explain in the
 * chosen mode and renders the returned markdown (+ LaTeX). Explanations are
 * cached per mode while the dialog is alive.
 */
export function ExplainDialog({
  open,
  onOpenChange,
  mode,
  noteId,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ExplainMode;
  noteId: string;
  content: string;
}) {
  const modeDefinition = EXPLAIN_MODES.find((item) => item.value === mode) ?? EXPLAIN_MODES[0];
  const [cache, setCache] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (cache[mode]) return;

    let cancelled = false;
    setPending(true);
    setError(null);

    const run = async () => {
      const result = await postExplain({ content, mode, noteId });
      if (cancelled) return;
      setPending(false);
      if (result.ok && result.explanation) {
        setCache((previous) => ({ ...previous, [mode]: result.explanation ?? "" }));
      } else {
        const message = result.error ?? "The tutor couldn't answer right now.";
        setError(message);
        toast.error(message);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [open, mode, content, noteId, cache]);

  const explanation = cache[mode];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="text-primary size-5" aria-hidden />
            {modeDefinition.label}
          </DialogTitle>
          <DialogDescription>{modeDefinition.description}</DialogDescription>
        </DialogHeader>

        <div className="scrollbar-slim max-h-[60dvh] overflow-y-auto pr-1">
          {pending ? (
            <div className="space-y-3" aria-busy="true" aria-label="Generating explanation">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-8/12" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-9/12" />
            </div>
          ) : error ? (
            <div className="bg-destructive/10 text-destructive rounded-lg p-4 text-sm" role="alert">
              {error}
            </div>
          ) : explanation ? (
            <Markdown>{explanation}</Markdown>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
