"use client";

import { useEffect, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Eye, Loader2, Send, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/markdown/markdown";
import { useUser } from "@/hooks/use-user";
import { noteSubmissionSchema } from "@/lib/validation";
import { xpFor } from "@/lib/xp";
import { ZONES } from "@/lib/constants";
import { toast } from "sonner";
import type { ExamZone } from "@/types/domain";

export interface FormTopic {
  id: string;
  title: string;
  slug: string;
  zone: ExamZone;
}

type NoteInput = z.input<typeof noteSubmissionSchema>;
type NoteOutput = z.output<typeof noteSubmissionSchema>;

const DEFAULT_VALUES: NoteInput = {
  type: "note",
  topicId: "",
  title: "",
  contentMd: "",
  summary: "",
  tags: [],
};

interface SharedItem {
  content: string;
  at: string | null;
}

/** Parses the localStorage `biochem:shared` queue (written by the PWA share target). */
function readSharedItems(raw: string): SharedItem[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: SharedItem[] = [];
    for (const entry of parsed) {
      if (typeof entry === "object" && entry !== null && "content" in entry) {
        const record = entry as { content: unknown; at: unknown };
        if (typeof record.content === "string" && record.content.length > 0) {
          items.push({
            content: record.content,
            at: typeof record.at === "string" ? record.at : null,
          });
        }
      }
    }
    return items;
  } catch {
    return [];
  }
}

function fieldError(message: string | undefined): React.ReactNode {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs font-medium">
      {message}
    </p>
  );
}

/**
 * Note contribution form: topic (grouped by zone), title, summary, tag chips,
 * markdown/LaTeX content with a live preview toggle. Validates with the shared
 * noteSubmissionSchema and inserts a pending row into `submissions`.
 */
export function SubmitNoteForm({ topics }: { topics: FormTopic[] }) {
  const { supabase, userId } = useUser();
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [sharedSource, setSharedSource] = useState(false);

  const form = useForm<NoteInput, unknown, NoteOutput>({
    resolver: zodResolver(noteSubmissionSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const tags = useWatch({ control: form.control, name: "tags" }) ?? [];
  const contentMd = useWatch({ control: form.control, name: "contentMd" }) ?? "";
  const errors = form.formState.errors;

  // Prefill from the PWA share target (biochem:shared), newest item first.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("biochem:shared");
      if (!raw) return;
      window.localStorage.removeItem("biochem:shared");
      const items = readSharedItems(raw);
      if (items.length === 0) return;
      const newest = items.reduce((best, item) =>
        (item.at ?? "") > (best.at ?? "") ? item : best,
      );
      form.setValue("contentMd", newest.content, { shouldDirty: true });
      setSharedSource(true);
    } catch {
      // Storage unavailable (private mode) — nothing to prefill.
    }
  }, [form]);

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/^#/, "");
    if (tag.length === 0) return;
    if (tags.includes(tag) || tags.length >= 8) {
      setTagInput("");
      return;
    }
    form.setValue("tags", [...tags, tag], { shouldValidate: true });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    form.setValue(
      "tags",
      tags.filter((item) => item !== tag),
      { shouldValidate: true },
    );
  };

  const onSubmit = form.handleSubmit(async (values: NoteOutput) => {
    if (!supabase || !userId) {
      toast.error("Sign in to submit notes");
      return;
    }
    setPending(true);
    const { error } = await supabase.from("submissions").insert({
      user_id: userId,
      type: "note",
      topic_id: values.topicId,
      title: values.title,
      content_md: values.contentMd,
      payload: { summary: values.summary ?? "", tags: values.tags },
    });
    setPending(false);

    if (error) {
      toast.error("Couldn't submit your note", { description: error.message });
      return;
    }

    const reward = xpFor("note_published");
    toast.success(
      `Submitted for review — thank you! You'll get +${reward} XP when it's published.`,
    );
    form.reset(DEFAULT_VALUES);
    setPreview(false);
    setSharedSource(false);
    window.dispatchEvent(new Event("biochem:submissions-changed"));
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {sharedSource ? (
        <p className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <Share2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Pre-filled with content shared from another app — shape it into great notes, then submit.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="note-topic">Topic</Label>
          <Controller
            control={form.control}
            name="topicId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="note-topic" className="w-full" aria-label="Choose a topic">
                  <SelectValue placeholder="Choose a topic" />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map((zone) => (
                    <SelectGroup key={zone.id}>
                      <SelectLabel>{zone.label}</SelectLabel>
                      {topics
                        .filter((topic) => topic.zone === zone.id)
                        .map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            {topic.title}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fieldError(errors.topicId?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="note-title">Title</Label>
          <Input
            id="note-title"
            placeholder="e.g. Enzyme inhibition kinetics"
            {...form.register("title")}
          />
          {fieldError(errors.title?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note-summary">Summary</Label>
        <Input
          id="note-summary"
          placeholder="One or two sentences — shown on the note card (optional)"
          {...form.register("summary")}
        />
        {fieldError(errors.summary?.message)}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note-tags">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="note-tags"
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder="Type a tag, press Enter (max 8)"
          />
          <Button type="button" variant="outline" onClick={addTag} className="focus-ring">
            Add
          </Button>
        </div>
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Selected tags">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary" className="gap-1 pr-1">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag ${tag}`}
                    className="hover:bg-foreground/15 focus-ring flex size-4 items-center justify-center rounded-full transition-colors"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {fieldError(errors.tags?.message)}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="note-content">Content</Label>
          <div className="flex items-center gap-2">
            <Eye className="text-muted-foreground size-4" aria-hidden />
            <Switch
              id="note-preview"
              checked={preview}
              onCheckedChange={setPreview}
              aria-label="Toggle live preview"
            />
            <Label htmlFor="note-preview" className="text-muted-foreground cursor-pointer text-xs">
              Preview
            </Label>
          </div>
        </div>
        <Textarea
          id="note-content"
          placeholder={
            "Write your notes in markdown…\n\n## Heading\n- point one\n- point two\n\n$K_m = \\frac{V_{max}}{2}$"
          }
          className="min-h-72 font-mono text-sm"
          {...form.register("contentMd")}
        />
        <p className="text-muted-foreground text-xs">
          Markdown and <span className="font-mono">$LaTeX$</span> are supported — exactly how it
          will render for readers.
        </p>
        {fieldError(errors.contentMd?.message)}
      </div>

      {preview ? (
        <div className="border-border/70 bg-card/60 rounded-lg border p-4">
          {contentMd.trim().length === 0 ? (
            <p className="text-muted-foreground text-sm">Start typing to see the live preview.</p>
          ) : (
            <Markdown>{contentMd}</Markdown>
          )}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="focus-ring">
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </form>
  );
}
