"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, FileText, Loader2, Plus, Save, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown/markdown";
import { useUser } from "@/hooks/use-user";
import { noteSubmissionSchema, questionSubmissionSchema, zoneSchema } from "@/lib/validation";
import { uniqueSuffix } from "@/lib/time";
import { slugify } from "@/lib/content/schema";
import { ZONES } from "@/lib/constants";
import type { QuestionOption } from "@/types/domain";
import type { FormTopic } from "@/components/exam/submit-note-form";

const OPTION_KEYS = ["A", "B", "C", "D"] as const;
const EMPTY_MCQ_OPTIONS: QuestionOption[] = OPTION_KEYS.map((key) => ({ key, text: "" }));
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const noteFormSchema = noteSubmissionSchema.omit({ type: true });
const questionFormSchema = questionSubmissionSchema.omit({ type: true });
const pastPaperFormSchema = z.object({
  title: z.string().min(3, "Give the paper a title").max(160),
  zone: zoneSchema,
  description: z.string().max(500).optional(),
  durationMinutes: z
    .number({ message: "Duration is required" })
    .int()
    .min(5, "At least 5 minutes")
    .max(300, "At most 300 minutes"),
  totalMarks: z
    .number({ message: "Total marks is required" })
    .int()
    .min(1, "At least 1 mark")
    .max(500, "At most 500 marks"),
});

type NoteInput = z.input<typeof noteFormSchema>;
type NoteOutput = z.output<typeof noteFormSchema>;
type QuestionInput = z.input<typeof questionFormSchema>;
type QuestionOutput = z.output<typeof questionFormSchema>;
type PastPaperInput = z.input<typeof pastPaperFormSchema>;
type PastPaperOutput = z.output<typeof pastPaperFormSchema>;

function fieldError(message: string | undefined): React.ReactNode {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs font-medium">
      {message}
    </p>
  );
}

/** Reading time estimate: words / 200, clamped to 1–120 minutes. */
function readingMinutesOf(contentMd: string): number {
  const words = contentMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(120, Math.max(1, Math.ceil(words / 200)));
}

/**
 * Lecturer publishing console — three tabs. Unlike the student contribution
 * forms, everything here inserts directly (staff hold publish_content) and is
 * live immediately: notes with status "published", questions from "bank", and
 * past paper PDFs uploaded to the public past-papers storage bucket.
 */
export function PublishForms({
  topics,
  initialTopicId,
}: {
  topics: FormTopic[];
  /** Pre-selected topic (arriving from a unit page's "publish here" CTA). */
  initialTopicId?: string;
}) {
  return (
    <Tabs defaultValue="note" className="gap-5">
      <TabsList className="max-w-full overflow-x-auto">
        <TabsTrigger value="note">Note</TabsTrigger>
        <TabsTrigger value="question">Question</TabsTrigger>
        <TabsTrigger value="past-paper">Past paper</TabsTrigger>
      </TabsList>
      <TabsContent value="note">
        <NoteForm topics={topics} initialTopicId={initialTopicId} />
      </TabsContent>
      <TabsContent value="question">
        <QuestionForm topics={topics} initialTopicId={initialTopicId} />
      </TabsContent>
      <TabsContent value="past-paper">
        <PastPaperForm />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Topic picker, grouped the way content is organised: first by course unit
 * (BIO 205 · Biochemistry of Plants), then by exam zone for topics without
 * a unit. With no units in play this renders exactly like the old
 * zone-grouped picker.
 */
function TopicSelect({
  topics,
  value,
  onChange,
  id,
}: {
  topics: FormTopic[];
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  const unitGroups = new Map<
    string,
    { label: string; topics: FormTopic[] }
  >();
  const unassigned: FormTopic[] = [];
  for (const topic of topics) {
    if (topic.unitId && topic.unitCode) {
      const group =
        unitGroups.get(topic.unitId) ??
        ({
          label: topic.unitName
            ? `${topic.unitCode} · ${topic.unitName}`
            : (topic.unitCode ?? "Unit"),
          topics: [],
        } as { label: string; topics: FormTopic[] });
      group.topics.push(topic);
      unitGroups.set(topic.unitId, group);
    } else {
      unassigned.push(topic);
    }
  }
  const hasUnits = unitGroups.size > 0;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-label="Choose a topic">
        <SelectValue placeholder="Choose a topic" />
      </SelectTrigger>
      <SelectContent>
        {[...unitGroups.values()].map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.topics.map((topic) => (
              <SelectItem key={topic.id} value={topic.id}>
                {topic.title}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {ZONES.map((zone) => {
          const zoneTopics = unassigned.filter((topic) => topic.zone === zone.id);
          if (zoneTopics.length === 0) return null;
          return (
            <SelectGroup key={zone.id}>
              <SelectLabel>{hasUnits ? `${zone.label} (no unit)` : zone.label}</SelectLabel>
              {zoneTopics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  {topic.title}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function NoteForm({
  topics,
  initialTopicId,
}: {
  topics: FormTopic[];
  initialTopicId?: string;
}) {
  const router = useRouter();
  const { supabase, userId } = useUser();
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [examCritical, setExamCritical] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const form = useForm<NoteInput, unknown, NoteOutput>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: {
      topicId: initialTopicId ?? "",
      title: "",
      contentMd: "",
      summary: "",
      tags: [],
    },
  });

  const tags = useWatch({ control: form.control, name: "tags" }) ?? [];
  const contentMd = useWatch({ control: form.control, name: "contentMd" }) ?? "";
  const errors = form.formState.errors;
  const readingMinutes = readingMinutesOf(contentMd);

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

  const onSubmit = form.handleSubmit(async (values: NoteOutput) => {
    if (!supabase || !userId) {
      toast.error("Sign in to publish notes");
      return;
    }
    setPending(true);
    const slug = `${slugify(values.title)}-${uniqueSuffix()}`;
    const { error } = await supabase.from("notes").insert({
      topic_id: values.topicId,
      title: values.title,
      slug,
      summary: values.summary?.trim() ? values.summary : null,
      content_md: values.contentMd,
      status: "published",
      is_exam_critical: examCritical,
      contributed_by: userId,
      published_by: userId,
      published_at: new Date().toISOString(),
      reading_minutes: readingMinutes,
      tags: values.tags,
    });
    setPending(false);

    if (error) {
      toast.error("Couldn't publish the note", { description: error.message });
      return;
    }

    toast.success("Note published", {
      description: "It is live in the explore grid now.",
      action: { label: "View note", onClick: () => router.push(`/notes/${slug}`) },
    });
    form.reset({ topicId: values.topicId, title: "", contentMd: "", summary: "", tags: [] });
    setPreview(false);
    setExamCritical(false);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="publish-note-topic">Topic</Label>
          <Controller
            control={form.control}
            name="topicId"
            render={({ field }) => (
              <TopicSelect
                id="publish-note-topic"
                topics={topics}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {fieldError(errors.topicId?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="publish-note-title">Title</Label>
          <Input
            id="publish-note-title"
            placeholder="e.g. Enzyme inhibition kinetics"
            {...form.register("title")}
          />
          {fieldError(errors.title?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publish-note-summary">Summary</Label>
        <Input
          id="publish-note-summary"
          placeholder="One or two sentences — shown on the note card (optional)"
          {...form.register("summary")}
        />
        {fieldError(errors.summary?.message)}
      </div>

      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="publish-note-tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="publish-note-tags"
              value={tagInput}
              onChange={(event) => setTagInput(event.currentTarget.value)}
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
                      onClick={() =>
                        form.setValue(
                          "tags",
                          tags.filter((item) => item !== tag),
                          { shouldValidate: true },
                        )
                      }
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
        </div>

        <div className="flex items-center gap-2.5 pb-1">
          <Switch
            id="publish-note-critical"
            checked={examCritical}
            onCheckedChange={setExamCritical}
            aria-label="Mark as exam critical"
          />
          <Label htmlFor="publish-note-critical" className="cursor-pointer text-sm">
            Exam-critical
          </Label>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="publish-note-content">Content</Label>
          <div className="flex items-center gap-2">
            <Eye className="text-muted-foreground size-4" aria-hidden />
            <Switch
              id="publish-note-preview"
              checked={preview}
              onCheckedChange={setPreview}
              aria-label="Toggle live preview"
            />
            <Label
              htmlFor="publish-note-preview"
              className="text-muted-foreground cursor-pointer text-xs"
            >
              Preview
            </Label>
          </div>
        </div>
        <Textarea
          id="publish-note-content"
          placeholder={
            "Write the notes in markdown…\n\n## Heading\n- point one\n\n$K_m = \\frac{V_{max}}{2}$"
          }
          className="min-h-72 font-mono text-sm"
          {...form.register("contentMd")}
        />
        <p className="text-muted-foreground text-xs">
          Markdown and <span className="font-mono">$LaTeX$</span> supported · about {readingMinutes}{" "}
          min read (auto-computed at{" "}
          {readingMinutes === 1 ? "1 minute" : `${readingMinutes} minutes`})
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

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="focus-ring">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {pending ? "Publishing…" : "Publish note"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Publishes instantly with your credit as contributor — no review queue.
        </p>
      </div>
    </form>
  );
}

function QuestionForm({
  topics,
  initialTopicId,
}: {
  topics: FormTopic[];
  initialTopicId?: string;
}) {
  const { supabase, userId } = useUser();
  const [pending, setPending] = useState(false);

  const form = useForm<QuestionInput, unknown, QuestionOutput>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: {
      topicId: initialTopicId ?? "",
      zone: "cat1",
      difficulty: "medium",
      type_question: "mcq",
      stemMd: "",
      options: EMPTY_MCQ_OPTIONS,
      answerKey: "",
      explanationMd: "",
      marks: 1,
      tags: [],
    },
  });

  const topicId = useWatch({ control: form.control, name: "topicId" });
  const questionType = useWatch({ control: form.control, name: "type_question" });
  const errors = form.formState.errors;

  // Zone follows the chosen topic automatically.
  useEffect(() => {
    const topic = topics.find((item) => item.id === topicId);
    if (topic) form.setValue("zone", topic.zone, { shouldValidate: true });
  }, [topicId, topics, form]);

  // MCQs need the four option inputs; other types clear them so validation
  // never sees hidden empty rows.
  useEffect(() => {
    const current = form.getValues("options") ?? [];
    if (questionType === "mcq") {
      if (current.length === 0) form.setValue("options", EMPTY_MCQ_OPTIONS);
    } else if (current.length > 0) {
      form.setValue("options", []);
    }
  }, [questionType, form]);

  const submit = (addAnother: boolean) =>
    form.handleSubmit(async (values: QuestionOutput) => {
      if (!supabase || !userId) {
        toast.error("Sign in to publish questions");
        return;
      }
      setPending(true);
      const { error } = await supabase.from("questions").insert({
        topic_id: values.topicId,
        zone: values.zone,
        difficulty: values.difficulty,
        type: values.type_question,
        stem_md: values.stemMd,
        options: values.type_question === "mcq" ? values.options : [],
        answer_key: values.answerKey,
        explanation_md: values.explanationMd,
        marks: values.marks,
        source: "bank",
        status: "published",
        created_by: userId,
        tags: values.tags,
      });
      setPending(false);

      if (error) {
        toast.error("Couldn't publish the question", { description: error.message });
        return;
      }

      toast.success("Question published to the bank");
      if (addAnother) {
        form.setValue("stemMd", "");
        if (values.type_question === "mcq") form.setValue("options", EMPTY_MCQ_OPTIONS);
        form.setValue("answerKey", "");
        form.setValue("explanationMd", "");
      } else {
        form.reset({
          topicId: values.topicId,
          zone: values.zone,
          difficulty: values.difficulty,
          type_question: values.type_question,
          stemMd: "",
          options: values.type_question === "mcq" ? EMPTY_MCQ_OPTIONS : [],
          answerKey: "",
          explanationMd: "",
          marks: values.marks,
          tags: [],
        });
      }
    })();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
      className="space-y-5"
      noValidate
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="publish-question-topic">Topic</Label>
          <Controller
            control={form.control}
            name="topicId"
            render={({ field }) => (
              <TopicSelect
                id="publish-question-topic"
                topics={topics}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {fieldError(errors.topicId?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-question-zone">Zone</Label>
          <div className="flex h-9 items-center">
            <Badge variant="outline" className="text-muted-foreground">
              Auto-set from topic
            </Badge>
          </div>
          <input type="hidden" {...form.register("zone")} />
          {fieldError(errors.zone?.message)}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="publish-question-difficulty">Difficulty</Label>
          <Controller
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="publish-question-difficulty"
                  className="w-full"
                  aria-label="Choose difficulty"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-question-type">Type</Label>
          <Controller
            control={form.control}
            name="type_question"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="publish-question-type"
                  className="w-full"
                  aria-label="Choose question type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">MCQ</SelectItem>
                  <SelectItem value="short_answer">Short answer</SelectItem>
                  <SelectItem value="long_answer">Long answer</SelectItem>
                  <SelectItem value="structured">Structured</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-question-marks">Marks</Label>
          <Input
            id="publish-question-marks"
            type="number"
            min={1}
            max={30}
            {...form.register("marks", { valueAsNumber: true })}
          />
          {fieldError(errors.marks?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publish-question-stem">Question stem</Label>
        <Textarea
          id="publish-question-stem"
          placeholder={
            "Write the question in markdown…\n\nWhich of the following best describes $K_m$?"
          }
          className="min-h-28 font-mono text-sm"
          {...form.register("stemMd")}
        />
        <p className="text-muted-foreground text-xs">
          Markdown and LaTeX are supported in the stem.
        </p>
        {fieldError(errors.stemMd?.message)}
      </div>

      {questionType === "mcq" ? (
        <div className="space-y-3">
          <Label>Options (A–D)</Label>
          <Controller
            control={form.control}
            name="options"
            render={({ field }) => (
              <div className="space-y-2.5">
                {OPTION_KEYS.map((key, index) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="border-border bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold"
                      aria-hidden
                    >
                      {key}
                    </span>
                    <Input
                      value={field.value?.[index]?.text ?? ""}
                      onChange={(event) => {
                        const next = [...(field.value ?? EMPTY_MCQ_OPTIONS)];
                        next[index] = { key, text: event.currentTarget.value };
                        field.onChange(next);
                      }}
                      placeholder={`Option ${key} text`}
                      aria-label={`Option ${key}`}
                    />
                  </div>
                ))}
              </div>
            )}
          />
          {fieldError(errors.options?.message)}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="publish-question-answer">Answer key</Label>
          <Textarea
            id="publish-question-answer"
            placeholder={
              questionType === "mcq" ? "e.g. B" : "The model answer students should give"
            }
            className="min-h-20"
            {...form.register("answerKey")}
          />
          {fieldError(errors.answerKey?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="publish-question-explanation">Explanation</Label>
          <Textarea
            id="publish-question-explanation"
            placeholder="Why that answer is right (markdown supported)"
            className="min-h-20"
            {...form.register("explanationMd")}
          />
          {fieldError(errors.explanationMd?.message)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="focus-ring">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {pending ? "Publishing…" : "Publish question"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => submit(true)}
          className="focus-ring"
        >
          <Plus className="size-4" aria-hidden />
          Save &amp; add another
        </Button>
      </div>
    </form>
  );
}

function PastPaperForm() {
  const router = useRouter();
  const { supabase, userId } = useUser();
  const [pending, setPending] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [solutionsFile, setSolutionsFile] = useState<File | null>(null);
  // File inputs reset via a key bump (remount) instead of refs — cleaner and
  // compiler-friendly.
  const [fileInputResetKey, setFileInputResetKey] = useState(0);

  const form = useForm<PastPaperInput, unknown, PastPaperOutput>({
    resolver: zodResolver(pastPaperFormSchema),
    defaultValues: {
      title: "",
      zone: "cat1",
      description: "",
      durationMinutes: 60,
      totalMarks: 100,
    },
  });
  const errors = form.formState.errors;

  const validatePdf = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return "Only .pdf files are accepted";
    if (file.size > MAX_PDF_BYTES) return "PDFs must be 20MB or smaller";
    return null;
  };

  const onPdfChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) {
      setPdfFile(null);
      return;
    }
    const problem = validatePdf(file);
    if (problem) {
      toast.error(problem);
      window.setTimeout(() => {
        input.value = "";
      }, 0);
      setPdfFile(null);
      return;
    }
    setPdfFile(file);
  };

  const onSolutionsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) {
      setSolutionsFile(null);
      return;
    }
    const problem = validatePdf(file);
    if (problem) {
      toast.error(problem);
      window.setTimeout(() => {
        input.value = "";
      }, 0);
      setSolutionsFile(null);
      return;
    }
    setSolutionsFile(file);
  };

  const onPastPaperSubmit = async (values: PastPaperOutput) => {
    if (!supabase || !userId) {
      toast.error("Sign in to publish past papers");
      return;
    }
    if (!pdfFile) {
      toast.error("Attach the past paper PDF first");
      return;
    }
    setPending(true);

    const basePath = `${values.zone}/${slugify(values.title)}-${uniqueSuffix()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("past-papers")
      .upload(basePath, pdfFile, { contentType: "application/pdf" });
    if (uploadError) {
      setPending(false);
      toast.error("Couldn't upload the past paper", { description: uploadError.message });
      return;
    }

    let solutionsPath: string | null = null;
    if (solutionsFile) {
      const path = `${values.zone}/${slugify(values.title)}-solutions-${uniqueSuffix()}.pdf`;
      const { error: solutionsError } = await supabase.storage
        .from("past-papers")
        .upload(path, solutionsFile, { contentType: "application/pdf" });
      if (solutionsError) {
        setPending(false);
        toast.error("Couldn't upload the worked solutions", {
          description: solutionsError.message,
        });
        return;
      }
      solutionsPath = path;
    }

    const { error: insertError } = await supabase.from("exams").insert({
      title: values.title,
      zone: values.zone,
      description: values.description?.trim() ? values.description : null,
      duration_minutes: values.durationMinutes,
      total_marks: values.totalMarks,
      created_by: userId,
      is_past_paper: true,
      published: true,
      past_paper_url: basePath,
      worked_solutions_url: solutionsPath,
    });
    setPending(false);

    if (insertError) {
      toast.error("Couldn't save the past paper record", { description: insertError.message });
      return;
    }

    toast.success("Past paper published", {
      description: "Students can sit it under timed conditions from the Past Papers page.",
      action: { label: "View past papers", onClick: () => router.push("/past-papers") },
    });
    form.reset({
      title: "",
      zone: values.zone,
      description: "",
      durationMinutes: 60,
      totalMarks: 100,
    });
    setPdfFile(null);
    setSolutionsFile(null);
    setFileInputResetKey((key) => key + 1);
  };

  const onSubmit = form.handleSubmit(onPastPaperSubmit);

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="past-paper-title">Title</Label>
          <Input
            id="past-paper-title"
            placeholder="e.g. Main Exam 2023 — Biochemistry"
            {...form.register("title")}
          />
          {fieldError(errors.title?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="past-paper-zone">Zone</Label>
          <Controller
            control={form.control}
            name="zone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="past-paper-zone" className="w-full" aria-label="Choose a zone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {zone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fieldError(errors.zone?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="past-paper-description">Description</Label>
        <Input
          id="past-paper-description"
          placeholder="Optional — e.g. covers CAT 2 metabolism topics (optional)"
          {...form.register("description")}
        />
        {fieldError(errors.description?.message)}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="past-paper-duration">Duration (minutes)</Label>
          <Input
            id="past-paper-duration"
            type="number"
            min={5}
            max={300}
            {...form.register("durationMinutes", { valueAsNumber: true })}
          />
          {fieldError(errors.durationMinutes?.message)}
        </div>
        <div className="space-y-2">
          <Label htmlFor="past-paper-marks">Total marks</Label>
          <Input
            id="past-paper-marks"
            type="number"
            min={1}
            max={500}
            {...form.register("totalMarks", { valueAsNumber: true })}
          />
          {fieldError(errors.totalMarks?.message)}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="past-paper-file">Past paper PDF</Label>
          <Input
            id="past-paper-file"
            key={`pdf-${fileInputResetKey}`}
            type="file"
            accept=".pdf,application/pdf"
            onChange={onPdfChange}
          />
          <p className="text-muted-foreground text-xs">
            {pdfFile
              ? `${pdfFile.name} (${(pdfFile.size / (1024 * 1024)).toFixed(1)}MB)`
              : "Required — .pdf up to 20MB"}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="past-paper-solutions">Worked solutions PDF (optional)</Label>
          <Input
            id="past-paper-solutions"
            key={`solutions-${fileInputResetKey}`}
            type="file"
            accept=".pdf,application/pdf"
            onChange={onSolutionsChange}
          />
          <p className="text-muted-foreground text-xs">
            {solutionsFile
              ? `${solutionsFile.name} (${(solutionsFile.size / (1024 * 1024)).toFixed(1)}MB)`
              : "Optional .pdf up to 20MB"}
          </p>
        </div>
      </div>

      <p className="border-border/70 bg-muted/30 text-muted-foreground flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs">
        <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Files are stored in the past-papers storage bucket (public read). The exam appears on the
        Past Papers page immediately — students sit it under timed conditions against its question
        set.
      </p>

      <Button type="submit" disabled={pending} className="focus-ring">
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Save className="size-4" aria-hidden />
        )}
        {pending ? "Publishing…" : "Publish past paper"}
      </Button>
    </form>
  );
}
