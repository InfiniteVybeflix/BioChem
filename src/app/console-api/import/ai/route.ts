import Papa from "papaparse";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { gatewayChat, gatewayConfigured } from "@/lib/ai/gateway";
import { csvNoteRowSchema, csvQuestionRowSchema } from "@/lib/content/schema";

/**
 * Console import — AI CSV conversion.
 *
 *   POST { type: "questions" | "notes", text, count? } →
 *   { csv, rowCount, validCount, invalidCount, problems[] }
 *
 * The operator pastes (or extracts via api/import/extract) study material;
 * the AI turns it into CSV rows matching the exact importer contract, which
 * are pre-validated here and returned for review before the real import.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT_CHARS = 120_000;

const bodySchema = z.object({
  type: z.enum(["questions", "notes"]),
  text: z.string().min(40, "Give the AI at least a paragraph of material").max(MAX_TEXT_CHARS),
  count: z.coerce.number().int().min(1).max(50).optional(),
});

const QUESTION_HEADER =
  "topic,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags";
const NOTE_HEADER = "title,topic,summary,tags,status,reading_minutes,exam_critical,content";

const QUESTION_SYSTEM = `You convert study material into CSV rows for the BioChem exam-question bank.

Output contract:
- First line MUST be exactly: ${QUESTION_HEADER}
- One question per row after the header.
- Wrap EVERY field that contains a comma, double quote or newline in double quotes; escape inner double quotes by doubling them. Never break a field across lines.
- topic: the best-matching topic slug or exact title from the provided topic list (never invent topics).
- zone: cat1 (CAT 1 material), cat2 (CAT 2 material) or main (main exam / general). Default to main when unsure.
- difficulty: easy | medium | hard. type: mcq | short_answer | long_answer | structured.
- mcq rows fill option_a..option_d (leave unused options empty) and answer is the correct option letter (A-D). Other types leave all four option columns empty and answer holds the model answer.
- explanation: one or two sentences teaching why the answer is right.
- marks: 1 unless the question clearly deserves more. tags: 1-3 comma-separated lowercase keywords.
- Write questions that test university-level biochemistry understanding, not trivia.
- Respond with ONLY the CSV — no markdown fences, no commentary, no blank first line.`;

const NOTE_SYSTEM = `You convert study material into CSV rows of course notes for the BioChem platform.

Output contract:
- First line MUST be exactly: ${NOTE_HEADER}
- One note per row after the header. Split the material into coherent, self-contained notes (by heading, subtopic or enzyme/system) rather than one giant row.
- Wrap EVERY field that contains a comma, double quote or newline in double quotes; escape inner double quotes by doubling them. Never break a field across lines.
- title: short and specific (max ~8 words). topic: the best-matching topic slug or exact title from the provided topic list (never invent topics).
- summary: one sentence (max 300 chars). tags: 1-3 lowercase keywords separated by semicolons.
- status: published. reading_minutes: honest estimate (1-60). exam_critical: true only for classically examinable material, else false.
- content: the note body in clean Markdown (## sections, bullet lists, $...$ LaTeX for equations). Keep each note under ~900 words and faithful to the source — do not invent facts.
- Respond with ONLY the CSV — no markdown fences, no commentary, no blank first line.`;

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:csv)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  return candidate
    .replace(/^\s*here(?:'s| is)[^\n]*\n/i, "")
    .replace(/^\s*(csv|output)[:\s]*\n/i, "")
    .trim();
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  if (!gatewayConfigured()) {
    return Response.json(
      { error: "The AI gateway is not configured on this deployment" },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 422 },
    );
  }
  const { type, text, count } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // Topic list — the AI may only map rows onto real topics.
  const { data: topicRows, error: topicError } = await admin
    .from("topics")
    .select("slug, title, zone")
    .order("title");
  if (topicError) {
    console.error("[console-api/import/ai] topic list failed:", topicError.message);
    return Response.json({ error: topicError.message }, { status: 502 });
  }
  const topics = topicRows ?? [];
  if (topics.length === 0) {
    return Response.json(
      { error: "No topics exist yet — create topics in the CMS tab first" },
      { status: 422 },
    );
  }
  const topicList = topics
    .map((topic) => `- ${topic.slug} — "${topic.title}" (${topic.zone})`)
    .join("\n");

  const defaultCount = type === "questions" ? 15 : 8;
  const targetCount = Math.min(count ?? defaultCount, type === "questions" ? 50 : 30);

  const userPrompt = `Target: produce up to ${targetCount} ${
    type === "questions" ? "questions" : "notes"
  }. Fewer is fine if the material runs out — never pad or repeat.

Available topics (slug — "title" (zone)):
${topicList}

Material:
"""
${text.slice(0, MAX_TEXT_CHARS)}
"""`;

  let raw: string;
  try {
    const result = await gatewayChat(
      "tutor",
      [
        { role: "system", content: type === "questions" ? QUESTION_SYSTEM : NOTE_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, maxTokens: 16_000 },
    );
    raw = result.content;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The AI conversion failed";
    console.error("[console-api/import/ai] gateway failed:", message);
    return Response.json({ error: `AI conversion failed: ${message}` }, { status: 502 });
  }

  const csv = stripFences(raw);
  const parsedCsv = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });
  const rows = parsedCsv.data ?? [];

  // Pre-validate with the exact importer schemas so the operator sees a
  // trustworthy count before importing.
  const rowSchema = type === "questions" ? csvQuestionRowSchema : csvNoteRowSchema;
  let validCount = 0;
  const problems: string[] = [];
  rows.forEach((row, index) => {
    const result = rowSchema.safeParse(row);
    if (result.success) {
      validCount += 1;
    } else if (problems.length < 5) {
      problems.push(`Row ${index + 1}: ${result.error.issues[0]?.message ?? "invalid"}`);
    }
  });

  return Response.json({
    csv,
    rowCount: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
    problems,
  });
}
