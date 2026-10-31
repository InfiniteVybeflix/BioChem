"use client";

import { useEffect, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser } from "@/hooks/use-user";
import { questionSubmissionSchema } from "@/lib/validation";
import { xpFor } from "@/lib/xp";
import { toast } from "sonner";
import type { FormTopic } from "@/components/exam/submit-note-form";
import type { QuestionOption } from "@/types/domain";

type QuestionInput = z.input<typeof questionSubmissionSchema>;
type QuestionOutput = z.output<typeof questionSubmissionSchema>;

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

const EMPTY_MCQ_OPTIONS: QuestionOption[] = OPTION_KEYS.map((key) => ({ key, text: "" }));

const DEFAULT_VALUES: QuestionInput = {
  type: "question",
  topicId: "",
  zone: "cat1",
  difficulty: "medium",
  type_question: "mcq",
  stemMd: "",
  options: EMPTY_MCQ_OPTIONS,
  answerKey: "",
  explanationMd: "",
  marks: 1,
  tags: [],
};

function fieldError(message: string | undefined): React.ReactNode {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs font-medium">
      {message}
    </p>
  );
}

/**
 * Question contribution form. MCQ mode shows four A–D option inputs; the zone
 * is derived automatically from the chosen topic. Validates with the shared
 * questionSubmissionSchema and inserts a pending `submissions` row whose
 * payload carries the full question object.
 */
export function SubmitQuestionForm({ topics }: { topics: FormTopic[] }) {
  const { supabase, userId } = useUser();
  const [pending, setPending] = useState(false);

  const form = useForm<QuestionInput, unknown, QuestionOutput>({
    resolver: zodResolver(questionSubmissionSchema),
    defaultValues: DEFAULT_VALUES,
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

  const onSubmit = form.handleSubmit(async (values: QuestionOutput) => {
    if (!supabase || !userId) {
      toast.error("Sign in to submit questions");
      return;
    }
    setPending(true);
    const { error } = await supabase.from("submissions").insert({
      user_id: userId,
      type: "question",
      topic_id: values.topicId,
      title:
        values.stemMd
          .replace(/[#*_>`]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120) || "Question submission",
      content_md: values.stemMd,
      payload: {
        zone: values.zone,
        difficulty: values.difficulty,
        type: values.type_question,
        stem_md: values.stemMd,
        options: values.type_question === "mcq" ? values.options : [],
        answer_key: values.answerKey,
        explanation_md: values.explanationMd,
        marks: values.marks,
        tags: values.tags,
      },
    });
    setPending(false);

    if (error) {
      toast.error("Couldn't submit your question", { description: error.message });
      return;
    }

    const reward = xpFor("submission_approved");
    toast.success(
      `Question submitted for review — thank you! You'll get +${reward} XP when it's published.`,
    );
    form.reset(DEFAULT_VALUES);
    window.dispatchEvent(new Event("biochem:submissions-changed"));
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="question-topic">Topic</Label>
          <Controller
            control={form.control}
            name="topicId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="question-topic" className="w-full" aria-label="Choose a topic">
                  <SelectValue placeholder="Choose a topic" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fieldError(errors.topicId?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="question-zone">Zone</Label>
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
          <Label htmlFor="question-difficulty">Difficulty</Label>
          <Controller
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="question-difficulty"
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
          <Label htmlFor="question-type">Type</Label>
          <Controller
            control={form.control}
            name="type_question"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="question-type"
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
          <Label htmlFor="question-marks">Marks</Label>
          <Controller
            control={form.control}
            name="marks"
            render={({ field }) => (
              <Select
                value={String(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger id="question-marks" className="w-full" aria-label="Choose marks">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 10, 15, 20].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} mark{value === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {fieldError(errors.marks?.message)}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="question-stem">Question stem</Label>
        <Textarea
          id="question-stem"
          placeholder={
            "Write the question in markdown…\n\nWhich of the following best describes $K_m$?"
          }
          className="min-h-28 font-mono text-sm"
          {...form.register("stemMd")}
        />
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
                        next[index] = { key, text: event.target.value };
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
          <Label htmlFor="question-answer">Answer key</Label>
          <Textarea
            id="question-answer"
            placeholder={
              questionType === "mcq" ? "e.g. B" : "The model answer students should give"
            }
            className="min-h-20"
            {...form.register("answerKey")}
          />
          {fieldError(errors.answerKey?.message)}
        </div>

        <div className="space-y-2">
          <Label htmlFor="question-explanation">Explanation</Label>
          <Textarea
            id="question-explanation"
            placeholder="Why that answer is right (markdown supported)"
            className="min-h-20"
            {...form.register("explanationMd")}
          />
          {fieldError(errors.explanationMd?.message)}
        </div>
      </div>

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
