import { z } from "zod";

/**
 * Content import contract.
 *
 * Lecturers bring content into the platform at runtime through the
 * Lecturer panel: a zip of markdown notes (YAML frontmatter) and JSON
 * question sets via the bulk uploader, or rows via the CSV import.
 * These schemas validate both paths before anything is written.
 */

export const frontmatterSchema = z.object({
  title: z.string().min(3).max(200),
  topic: z.string().min(1), // topic slug, must exist in topics.json
  summary: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  readingMinutes: z.number().int().min(1).max(120).default(6),
  examCritical: z.boolean().default(false),
  author: z.string().max(120).optional(), // optional credit for seed content
});

export type NoteFrontmatter = z.infer<typeof frontmatterSchema>;

export const questionFileSchema = z.object({
  topic: z.string().min(1),
  zone: z.enum(["cat1", "cat2", "main"]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  type: z.enum(["mcq", "short_answer", "long_answer", "structured"]).default("mcq"),
  questions: z
    .array(
      z.object({
        stem: z.string().min(10).max(5000),
        options: z
          .array(z.object({ key: z.string().min(1).max(4), text: z.string().min(1).max(1000) }))
          .max(6)
          .default([]),
        answer: z.string().min(1).max(5000),
        explanation: z.string().max(10_000).default(""),
        marks: z.number().int().min(1).max(30).default(1),
        tags: z.array(z.string().min(1).max(40)).max(8).default([]),
      }),
    )
    .min(1),
});

export type QuestionFile = z.infer<typeof questionFileSchema>;

export const topicsFileSchema = z.object({
  topics: z.array(
    z.object({
      slug: z.string().min(1).max(120),
      title: z.string().min(2).max(160),
      zone: z.enum(["cat1", "cat2", "main"]),
      parent: z.string().max(120).nullable().optional(), // parent slug
      description: z.string().max(500).optional(),
      order: z.number().int().default(0),
      outcomes: z
        .array(
          z.object({
            code: z.string().min(1).max(20),
            statement: z.string().min(5).max(500),
          }),
        )
        .default([]),
    }),
  ),
});

export type TopicsFile = z.infer<typeof topicsFileSchema>;

/** CSV question importer row (papaparse header row). */
export const csvQuestionRowSchema = z.object({
  topic: z.string().min(1),
  zone: z.enum(["cat1", "cat2", "main"]),
  unit: z.string().max(80).optional(), // unit code (BIO205) or exact unit name — optional
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  type: z.enum(["mcq", "short_answer", "long_answer", "structured"]).default("mcq"),
  stem: z.string().min(10),
  option_a: z.string().optional(),
  option_b: z.string().optional(),
  option_c: z.string().optional(),
  option_d: z.string().optional(),
  answer: z.string().min(1),
  explanation: z.string().default(""),
  marks: z.coerce.number().int().min(1).max(30).default(1),
  tags: z.string().optional(), // comma-separated
});

export type CsvQuestionRow = z.infer<typeof csvQuestionRowSchema>;

/** CSV note importer row — mirrors the staff frontmatter contract. */
export const csvNoteRowSchema = z.object({
  title: z.string().min(3).max(200),
  topic: z.string().min(1),
  unit: z.string().max(80).optional(), // unit code (BIO205) or exact unit name — optional
  summary: z.string().max(500).optional(),
  content: z.string().min(10),
  tags: z.string().optional(), // comma-separated
  status: z.enum(["published", "draft"]).default("published"),
  reading_minutes: z.coerce.number().int().min(1).max(120).optional(),
  exam_critical: z
    .preprocess(
      (value) =>
        value === true || ["true", "yes", "1"].includes(String(value).trim().toLowerCase()),
      z.boolean(),
    )
    .default(false),
});

export type CsvNoteRow = z.infer<typeof csvNoteRowSchema>;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
