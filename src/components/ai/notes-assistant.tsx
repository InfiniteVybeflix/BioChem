"use client";

import { useState, type FormEvent } from "react";
import { Bot, FileCheck2, Loader2, Scissors, Send, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { slugify } from "@/lib/content/schema";

/**
 * The staff AI writing assistant — a working conversation, not a
 * chatbot. Drafts come back with real action buttons:
 *
 *   Publish to my students → writes the note (status published, the
 *     lecturer's name on it) through the normal RLS-checked path.
 *   Make it shorter / Add more depth → reworks the current draft.
 *   Regenerate → same brief, fresh take.
 *
 * After publishing, the lecturer can hand the note straight to the
 * flashcard generator.
 */

interface AssistantAction {
  id: string;
  label: string;
}

interface AssistantState {
  reply: string;
  draft: { title: string; summary: string; contentMd: string } | null;
  actions: AssistantAction[];
}

export function NotesAssistant({
  topics,
}: {
  topics: { id: string; title: string; zone: string }[];
}) {
  const { supabase, userId } = useUser();
  const [topicId, setTopicId] = useState<string>(topics[0]?.id ?? "");
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<AssistantState | null>(null);
  const [pending, setPending] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const topic = topics.find((entry) => entry.id === topicId);

  const call = async (mode: "note" | "shorten" | "expand" | "announcement", content?: string) => {
    if (!instruction.trim() && mode === "note") {
      toast.error("Tell the assistant what the note should cover");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          instruction,
          topicTitle: topic?.title ?? "",
          content,
        }),
      });
      const data: AssistantState & { error?: string } = await response.json();
      if (!response.ok) {
        toast.error(data.error ?? "The assistant is unavailable");
        return;
      }
      setState(data);
      if (data.draft) setInstruction("");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setPending(false);
    }
  };

  const publish = async () => {
    if (!supabase || !state?.draft || !topicId || !userId) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase
        .from("notes")
        .insert({
          topic_id: topicId,
          title: state.draft.title,
          slug: `${slugify(state.draft.title)}-${Date.now().toString(36)}`,
          summary: state.draft.summary || null,
          content_md: state.draft.contentMd,
          status: "published",
          is_exam_critical: false,
          published_by: userId,
          published_at: new Date().toISOString(),
          reading_minutes: Math.max(1, Math.round(state.draft.contentMd.split(/\s+/).length / 180)),
          tags: [],
        })
        .select("id")
        .single();

      if (error || !data) {
        toast.error("Couldn't publish the note", { description: error?.message });
        return;
      }
      toast.success(`"${state.draft.title}" is live for your students`);

      const makeFlashcards = window.confirm(
        "Published. Generate a flashcard deck from this note for your students?",
      );
      if (makeFlashcards) {
        const flashcardResponse = await fetch("/api/ai/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: data.id, count: 8 }),
        });
        if (flashcardResponse.ok) {
          toast.success("Flashcard deck generated");
        } else {
          toast.info("You can generate flashcards from the note page later");
        }
      }
      setState(null);
    } finally {
      setPublishing(false);
    }
  };

  const runAction = (action: AssistantAction) => {
    if (action.id === "publish_note" || action.id === "publish_announcement") {
      void publish();
      return;
    }
    if (action.id === "shorten") {
      void call("shorten", state?.draft?.contentMd);
      return;
    }
    if (action.id === "expand") {
      void call("expand", state?.draft?.contentMd);
      return;
    }
    if (action.id === "regenerate") {
      void call("note");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void call("note");
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="glass-card space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Bot className="size-4.5" aria-hidden />
          </span>
          <div>
            <h3 className="font-semibold">AI writing assistant</h3>
            <p className="text-muted-foreground text-sm">
              Describe the note you need — it drafts it, you review, one tap publishes.
            </p>
          </div>
        </div>

        {topics.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="assistant-topic">Topic</Label>
            <select
              id="assistant-topic"
              className="border-input bg-background focus-ring w-full rounded-lg border px-3 py-2 text-sm"
              value={topicId}
              onChange={(event) => setTopicId(event.target.value)}
            >
              {topics.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} ({entry.zone.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="assistant-instruction">What should the note cover?</Label>
          <Textarea
            id="assistant-instruction"
            rows={3}
            maxLength={4000}
            placeholder="e.g. The ten reactions of glycolysis with enzymes, energetics and regulation — second-year level, include a worked ΔG calculation"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
        </div>

        <Button type="submit" className="gap-2" disabled={pending || topics.length === 0}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-4" aria-hidden />
          )}
          {pending ? "Drafting…" : "Draft the note"}
        </Button>
        {topics.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Topics are created by staff from the syllabus — add one under Publish first.
          </p>
        ) : null}
      </form>

      {state?.draft ? (
        <section className="glass-card space-y-4 p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                <Wand2 className="text-primary size-3.5" aria-hidden /> Draft — review before
                publishing
              </p>
              <h3 className="font-heading mt-1 text-lg font-semibold">{state.draft.title}</h3>
              {state.draft.summary ? (
                <p className="text-muted-foreground mt-0.5 text-sm">{state.draft.summary}</p>
              ) : null}
            </div>
          </div>

          <div className="border-border/60 max-h-[28rem] overflow-y-auto rounded-xl border p-4">
            <Markdown>{state.draft.contentMd}</Markdown>
          </div>

          <div className="flex flex-wrap gap-2">
            {state.actions.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.id === "publish_note" ? "default" : "outline"}
                className="gap-2"
                disabled={pending || publishing}
                onClick={() => runAction(action)}
              >
                {action.id === "publish_note" ? (
                  publishing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FileCheck2 className="size-4" aria-hidden />
                  )
                ) : action.id === "shorten" ? (
                  <Scissors className="size-4" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                {action.id === "publish_note" && publishing ? "Publishing…" : action.label}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground/70 text-xs">
            {state.reply} You stay the author — students see your name on the note.
          </p>
        </section>
      ) : null}
    </div>
  );
}
