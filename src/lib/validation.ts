import { z } from "zod";

/** Shared Zod schemas — used by both client forms and API routes. */

export const zoneSchema = z.enum(["cat1", "cat2", "main"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export const questionTypeSchema = z.enum(["mcq", "short_answer", "long_answer", "structured"]);
export const submissionTypeSchema = z.enum(["note", "question", "past_paper", "flashcard_set"]);
export const jobTypeSchema = z.enum(["internship", "entry", "full_time"]);

export const questionOptionSchema = z.object({
  key: z.string().min(1).max(4),
  text: z.string().min(1).max(1000),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const signupSchema = z.object({
  fullName: z.string().min(2, "Tell us your name").max(120),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

export const noteSubmissionSchema = z.object({
  type: z.literal("note"),
  topicId: z.string().uuid(),
  title: z.string().min(3).max(200),
  contentMd: z.string().min(50, "Notes need at least 50 characters").max(200_000),
  summary: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
});

export const questionSubmissionSchema = z.object({
  type: z.literal("question"),
  topicId: z.string().uuid(),
  zone: zoneSchema,
  difficulty: difficultySchema,
  type_question: questionTypeSchema,
  stemMd: z.string().min(10).max(5000),
  options: z.array(questionOptionSchema).max(6).default([]),
  answerKey: z.string().min(1).max(5000),
  explanationMd: z.string().max(10_000).default(""),
  marks: z.number().int().min(1).max(30).default(1),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
});

export const discussionSchema = z.object({
  topicId: z.string().uuid().nullable().optional(),
  title: z.string().min(6, "Give the thread a clear title").max(200),
  bodyMd: z.string().min(10).max(10_000),
});

export const replySchema = z.object({
  bodyMd: z.string().min(2).max(10_000),
  parentReplyId: z.string().uuid().nullable().optional(),
});

export const chatMessageSchema = z.object({
  body: z.string().min(1).max(1000),
  room: z.string().min(1).max(40).default("general"),
});

export const jobSchema = z.object({
  title: z.string().min(3).max(160),
  org: z.string().min(2).max(160),
  location: z.string().min(2).max(160),
  type: jobTypeSchema,
  descriptionMd: z.string().min(30).max(10_000),
  contact: z.string().min(3).max(300),
  closesAt: z.string().datetime().nullable().optional(),
});

export const enquirySchema = z.object({
  message: z.string().min(10, "Introduce yourself briefly").max(2000),
});

export const mockConfigSchema = z.object({
  zone: zoneSchema,
  topicIds: z.array(z.string().uuid()).default([]),
  difficulty: z.enum(["easy", "medium", "hard", "all"]).default("all"),
  count: z.number().int().min(5).max(60).default(20),
  durationMinutes: z.number().int().min(5).max(240).default(30),
});

export const planEventSchema = z
  .object({
    title: z.string().min(2).max(160),
    type: z.enum(["study", "class", "exam", "personal", "deadline"]).default("study"),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    notes: z.string().max(500).nullable().optional(),
    color: z.string().max(20).default("teal"),
    reminderMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  })
  .refine((data) => (data.dayOfWeek !== null) !== (data.date !== null), {
    message: "Provide either dayOfWeek (recurring) or date (one-off), not both",
  });

export const notificationPrefsSchema = z.object({
  new_notes: z.boolean(),
  mock_results: z.boolean(),
  chat_mentions: z.boolean(),
  daily_questions: z.boolean(),
  announcements: z.boolean(),
  jobs: z.boolean(),
  push_enabled: z.boolean(),
  email_digest: z.boolean(),
  quiet_start: z.string().regex(/^\d{2}:\d{2}$/),
  quiet_end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const dailySettingsSchema = z.object({
  topicIds: z.array(z.string().uuid()).default([]),
  difficulty: difficultySchema.default("medium"),
  count: z.number().int().min(1).max(20).default(5),
  deliveryTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("07:00"),
  timezone: z.string().min(1).max(64).default("Africa/Nairobi"),
  enabled: z.boolean().default(true),
});

export const aiExplainSchema = z.object({
  content: z.string().min(3).max(20_000),
  mode: z.enum(["exam", "eli5", "steps"]),
  noteId: z.string().uuid().optional(),
});

export const tutorChatSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
  noteIds: z.array(z.string().uuid()).max(5).default([]),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const adSchema = z.object({
  title: z.string().min(2).max(120),
  body: z.string().min(2).max(600),
  placement: z.enum(["jobs", "events", "resources", "sidebar", "banner"]),
  targetUrl: z.string().url(),
  imageUrl: z.string().url().nullable().optional(),
  ctaLabel: z.string().min(2).max(40).default("Learn more"),
  endsAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().default(true),
});
