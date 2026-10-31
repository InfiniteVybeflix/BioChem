import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  claimDueQueueItems,
  completeQueueItem,
  failQueueItem,
  type QueueRow,
} from "@/lib/ai/queue";
import { generateTutorReply } from "@/lib/ai/tutor";
import { generateDailyQuestions } from "@/lib/ai/daily";
import { generateExplanation, EXPLAIN_MODE_LABELS } from "@/lib/ai/explain";
import { generateNoteFlashcards } from "@/lib/ai/flashcards";
import { generateStudyPlan, type StudyPlanRequest } from "@/lib/ai/study-plan";
import { notifyUsers } from "@/lib/push";

/**
 * Durable AI queue processor. Drains claimed items by task type; per-item
 * failures schedule a retry (exponential backoff) without blocking others.
 * Shared by /api/ai/queue/process (admin/cron) and /api/cron/queue-process.
 */

export interface QueueProcessResult {
  processed: number;
  done: number;
  retried: number;
}

const tutorPayloadSchema = z.object({
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  message: z.string().min(1),
  noteIds: z.array(z.string().uuid()).max(5).default([]),
});

const explainPayloadSchema = z.object({
  userId: z.string().uuid(),
  content: z.string().min(1),
  mode: z.enum(["exam", "eli5", "steps"]),
  noteId: z.string().uuid().nullable().optional(),
});

const dailyPayloadSchema = z.object({
  userId: z.string().uuid(),
});

const studyPlanPayloadSchema = z.object({
  userId: z.string().uuid(),
  syllabus: z.string().min(1),
  weeks: z.number().int().min(1).max(16),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  hoursPerWeek: z.number().int().min(2).max(40).nullable().optional(),
});

const flashcardsPayloadSchema = z.object({
  userId: z.string().uuid(),
  noteId: z.string().uuid(),
  count: z.number().int().min(1).max(12),
});

async function executeTutor(item: QueueRow): Promise<Record<string, unknown>> {
  const payload = tutorPayloadSchema.parse(item.payload);
  const result = await generateTutorReply(
    payload.userId,
    payload.conversationId,
    payload.message,
    payload.noteIds,
  );
  return { conversationId: payload.conversationId, replyPreview: result.reply.slice(0, 200) };
}

/**
 * Queued explain turn: the explanation is persisted into the user's
 * "Explanations" tutor conversation so the notification link actually leads
 * to the generated content.
 */
async function executeExplain(item: QueueRow): Promise<Record<string, unknown>> {
  const payload = explainPayloadSchema.parse(item.payload);
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  let noteContext: { title: string; content_md: string } | null = null;
  if (payload.noteId) {
    const { data: note } = await admin
      .from("notes")
      .select("title, content_md")
      .eq("id", payload.noteId)
      .maybeSingle();
    if (note) noteContext = note;
  }

  const result = await generateExplanation({
    content: payload.content,
    mode: payload.mode,
    noteContext,
  });

  // Find or create the user's persistent "Explanations" conversation.
  const { data: existing } = await admin
    .from("ai_conversations")
    .select("id")
    .eq("user_id", payload.userId)
    .eq("title", "Explanations")
    .order("created_at", { ascending: false })
    .limit(1);
  let conversationId = existing?.[0]?.id;
  if (!conversationId) {
    const { data: created, error } = await admin
      .from("ai_conversations")
      .insert({ user_id: payload.userId, title: "Explanations" })
      .select("id")
      .single();
    if (error || !created) throw new Error("Could not create the Explanations conversation");
    conversationId = created.id;
  }

  const { error: insertError } = await admin.from("ai_messages").insert([
    {
      conversation_id: conversationId,
      role: "user",
      content: `Explain in ${EXPLAIN_MODE_LABELS[payload.mode]} mode: ${payload.content}`,
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content: result.explanation,
      model: result.model,
    },
  ]);
  if (insertError) throw new Error(`Failed to persist explanation: ${insertError.message}`);

  await admin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  await notifyUsers([payload.userId], "system", {
    title: "Explanation ready",
    body: `Your ${EXPLAIN_MODE_LABELS[payload.mode]} explanation is ready in the tutor.`,
    link: "/ai/tutor",
  });

  return { conversationId, mode: payload.mode };
}

async function executeDailyQuestions(item: QueueRow): Promise<Record<string, unknown>> {
  const payload = dailyPayloadSchema.parse(item.payload);
  const rows = await generateDailyQuestions(payload.userId);
  return { count: rows.length };
}

async function executeStudyPlan(item: QueueRow): Promise<Record<string, unknown>> {
  const payload = studyPlanPayloadSchema.parse(item.payload);
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  const request: StudyPlanRequest = {
    syllabus: payload.syllabus,
    weeks: payload.weeks,
    ...(payload.examDate ? { examDate: payload.examDate } : {}),
    ...(payload.hoursPerWeek ? { hoursPerWeek: payload.hoursPerWeek } : {}),
  };
  const result = await generateStudyPlan(admin, payload.userId, request);

  await notifyUsers([payload.userId], "system", {
    title: "Study plan ready",
    body: `Your ${result.weeks.length}-week study plan is ready in the planner.`,
    link: "/planner",
  });

  return { planId: result.planId, weeks: result.weeks.length };
}

async function executeFlashcards(item: QueueRow): Promise<Record<string, unknown>> {
  const payload = flashcardsPayloadSchema.parse(item.payload);
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured");

  const count = await generateNoteFlashcards(admin, payload.userId, payload.noteId, payload.count);

  await notifyUsers([payload.userId], "system", {
    title: "Flashcards ready",
    body: `${count} flashcards were generated from your note.`,
    link: "/flashcards",
  });

  return { flashcards: count };
}

async function executeQueueItem(item: QueueRow): Promise<Record<string, unknown>> {
  switch (item.task) {
    case "tutor":
      return executeTutor(item);
    case "explain":
      return executeExplain(item);
    case "daily_questions":
      return executeDailyQuestions(item);
    case "study_plan":
      return executeStudyPlan(item);
    case "flashcards":
      return executeFlashcards(item);
    default:
      return { skipped: true, reason: `No processor registered for task "${item.task}"` };
  }
}

/** Claims and processes up to `limit` due queue items. */
export async function processQueue(limit = 10): Promise<QueueProcessResult> {
  const items = await claimDueQueueItems(limit);
  let done = 0;
  let retried = 0;

  for (const item of items) {
    try {
      const result = await executeQueueItem(item);
      await completeQueueItem(item.id, result);
      done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown queue error";
      console.error(`[ai-queue] ${item.task} ${item.id} failed: ${message}`);
      await failQueueItem(item, message);
      retried += 1;
    }
  }

  return { processed: items.length, done, retried };
}
