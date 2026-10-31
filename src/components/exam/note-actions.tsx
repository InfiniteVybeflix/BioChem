"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, ChevronDown, MessageCircle, Printer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExplainDialog, EXPLAIN_MODES, type ExplainMode } from "@/components/exam/explain-dialog";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

interface FlashcardsResponse {
  ok: boolean;
  error: string | null;
  flashcards: number | null;
}

async function postFlashcards(noteId: string, count: number): Promise<FlashcardsResponse> {
  try {
    const response = await fetch("/api/ai/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, count }),
    });
    const parsed: unknown = await response.json().catch(() => null);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      return {
        ok: response.ok,
        error: typeof record.error === "string" ? record.error : null,
        flashcards: typeof record.flashcards === "number" ? record.flashcards : null,
      };
    }
    return { ok: response.ok, error: null, flashcards: null };
  } catch {
    return {
      ok: false,
      error: "Network error — check your connection and try again.",
      flashcards: null,
    };
  }
}

function signInToast(message: string) {
  toast.error(message, {
    action: {
      label: "Sign in",
      onClick: () => {
        window.location.assign("/login");
      },
    },
  });
}

/**
 * Note viewer action bar: AI flashcard generation and the explain dropdown
 * (exam answer / ELI5 / step-by-step).
 */
export function NoteActions({
  noteId,
  contentPreview,
}: {
  noteId: string;
  contentPreview: string;
}) {
  const router = useRouter();
  const { userId } = useUser();
  const [flashcardsPending, setFlashcardsPending] = useState(false);
  const [explainMode, setExplainMode] = useState<ExplainMode | null>(null);

  const handleFlashcards = async () => {
    if (!userId) {
      signInToast("Sign in to generate flashcards from this note");
      return;
    }
    setFlashcardsPending(true);
    const result = await postFlashcards(noteId, 8);
    setFlashcardsPending(false);

    if (result.ok) {
      const count = result.flashcards ?? 8;
      toast.success(`${count} flashcards added to your deck`, {
        description: "They're scheduled with SM-2 spaced repetition.",
        action: {
          label: "Review now",
          onClick: () => {
            router.push("/flashcards");
          },
        },
      });
    } else {
      toast.error(result.error ?? "Flashcard generation failed — try again in a moment.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={handleFlashcards}
        disabled={flashcardsPending}
        className="focus-ring"
      >
        <Sparkles className="size-4" aria-hidden />
        {flashcardsPending ? "Generating…" : "Generate flashcards"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="focus-ring">
            <BrainCircuit className="size-4" aria-hidden />
            Explain with AI
            <ChevronDown className="size-4 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {EXPLAIN_MODES.map((mode) => (
            <DropdownMenuItem
              key={mode.value}
              onSelect={() => {
                if (!userId) {
                  signInToast("Sign in to use the AI tutor");
                  return;
                }
                setExplainMode(mode.value);
              }}
              className="gap-2"
            >
              <BrainCircuit className="text-primary size-4" aria-hidden />
              <span className="flex flex-col">
                <span>{mode.label}</span>
                <span className="text-muted-foreground text-xs">{mode.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ExplainDialog
        open={explainMode !== null}
        onOpenChange={(open) => {
          if (!open) setExplainMode(null);
        }}
        mode={explainMode ?? "exam"}
        noteId={noteId}
        content={contentPreview}
      />
    </div>
  );
}
