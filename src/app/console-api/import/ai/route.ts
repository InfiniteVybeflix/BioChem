import Papa from "papaparse";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { gatewayChat, gatewayConfigured } from "@/lib/ai/gateway";
import { csvNoteRowSchema, csvQuestionRowSchema } from "@/lib/content/schema";
import { extractModelObject } from "@/lib/ai/json";

/**
 * Console import — AI conversion.
 *
 *   POST { type: "questions" | "notes", text, count?, topic?, unit?,
 *          zone?, questionType?, school? } →
 *   { csv, rowCount, validCount, invalidCount, problems[], detected }
 *
 * The old version asked the model for raw CSV and trusted it — one
 * non-compliant reply and the operator saw their own extracted text
 * pasted back as "CSV". Now the model returns STRICT JSON, which is
 * schema-validated here and serialised into the CSV contract
 * deterministically with papaparse. Invalid or empty output is
 * retried once with a corrective message before failing with a clear
 * error, so the Convert button produces a real CSV or a real error —
 * never garbage.
 *
 * The model also reports what it detected (subject, unit code/name,
 * school) so the importer can auto-create the matching topic/unit.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TEXT_CHARS = 120_000;

const bodySchema = z.object({
  type: z.enum(["questions", "notes"]),
  text: z.string().min(40, "Give the AI at least a paragraph of material").max(MAX_TEXT_CHARS),
  count: z.coerce.number().int().min(1).max(50).optional(),
  /** Optional destination: file every generated row under this topic. */
  topic: z.string().trim().max(160).optional(),
  /** Optional destination unit: code ("BIO205") or exact unit name. */
  unit: z.string().trim().max(80).optional(),
  /** Optional zone override applied to every generated row. */
  zone: z.enum(["cat1", "cat2", "main"]).optional(),
  /** Which question formats to generate (questions mode only). */
  questionType: z.enum(["mix", "mcq", "short_answer", "long_answer", "structured"]).optional(),
  /** School name hint — helps the AI scope its detection. */
  school: z.string().trim().max(160).optional(),
});

const QUESTION_HEADER =
  "topic,unit,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags";
const NOTE_HEADER = "title,topic,unit,summary,tags,status,reading_minutes,exam_critical,content";

export interface DetectedInfo {
  subject: string | null;
  unitCode: string | null;
  unitName: string | null;
  school: string | null;
}

interface AiQuestion {
  topic: string;
  zone: string;
  difficulty: string;
  type: string;
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  marks: number;
  tags: string[];
}

interface AiNote {
  title: string;
  topic: string;
  summary: string;
  content: string;
  tags: string[];
  readingMinutes: number;
  examCritical: boolean;
}

const QUESTION_SYSTEM = `You are an exam writer for BioChem, a Kenyan university biochemistry learning platform.

TASK: read the study material and WRITE original exam questions that test understanding of it. Never copy the material verbatim — transform it into questions. Never invent facts that are not supported by the material.

Respond with STRICT JSON only — no markdown fences, no commentary. Shape:
{"subject":"<the subject area, or null if unclear>","unit_code":"<course unit code like BIO205 or MIC205 if the material names one, else null>","unit_name":"<full unit name if stated, else null>","school":"<school/university name if stated, else null>","items":[ ... ]}

Each item in "items":
{"topic":"<best-matching topic from the provided topic list; never invent topics>","zone":"cat1|cat2|main","difficulty":"easy|medium|hard","type":"mcq|short_answer|long_answer|structured","stem":"<the question, markdown+LaTeX allowed>","options":["A text","B text","C text","D text"],"answer":"<correct letter A-D for mcq; the model answer text otherwise>","explanation":"<1-2 sentences teaching why the answer is right>","marks":1,"tags":["lowercase","keywords"]}

Rules:
- zone: cat1 for CAT 1 material, cat2 for CAT 2, main for main-exam/general. Default "main" when unsure.
- difficulty: easy | medium | hard.
- type "mcq" items MUST have exactly 4 entries in options (the distractors can be genuinely tricky); other types MUST have options: [].
- For mcq, "answer" is ONLY the correct letter, e.g. "B".
- marks: 1 unless the question clearly deserves more (structured/long answers can be 5-10).
- Produce up to the requested number of items. Fewer is fine if the material runs out — never pad or repeat.
- Output ONLY the JSON object.`;

const NOTE_SYSTEM = `You are a lecturer's assistant for BioChem, a Kenyan university biochemistry learning platform.

TASK: read the study material and turn it into well-organised course notes. Rewrite and structure the content — clean headings, bullet lists, tables where useful, $...$ LaTeX for equations. Do NOT dump the raw extracted text; organise it the way a good lecturer's notes read. Stay faithful to the source — never invent facts.

Respond with STRICT JSON only — no markdown fences, no commentary. Shape:
{"subject":"<the subject area, or null if unclear>","unit_code":"<course unit code like BIO205 or MIC205 if the material names one, else null>","unit_name":"<full unit name if stated, else null>","school":"<school/university name if stated, else null>","items":[ ... ]}

Each item in "items" is ONE coherent, self-contained note (split by heading, subtopic, enzyme or system — never one giant note):
{"title":"<short and specific, max ~8 words>","topic":"<best-matching topic from the provided topic list; never invent topics>","summary":"<one sentence, max 300 chars>","content":"<the note body in clean Markdown: ## sections, bullet lists, $...$ LaTeX. Under ~900 words.>","tags":["lowercase","keywords"],"readingMinutes":<honest estimate 1-60>,"examCritical":<true only for classically examinable material>}

- status is always "published" (it is not part of your output).
- Produce up to the requested number of items. Fewer is fine — never pad or repeat.
- Output ONLY the JSON object.`;

/** Pull the JSON object out of a model reply that may carry prose/fences,
 * trailing commas, smart quotes, bare keys or truncation. */
function extractJsonObject(raw: string): unknown {
  return extractModelObject(raw);
}

const detectedSchema = z
  .object({
    subject: z.string().max(200).nullish(),
    unit_code: z.string().max(80).nullish(),
    unit_name: z.string().max(200).nullish(),
    school: z.string().max(200).nullish(),
  })
  .default({});

const aiQuestionSchema = z.object({
  topic: z.string().min(1).max(160),
  zone: z.string().max(20),
  difficulty: z.string().max(20),
  type: z.string().max(30),
  stem: z.string().min(8).max(5000),
  options: z.array(z.string().max(1000)).max(6).default([]),
  answer: z.string().min(1).max(5000),
  explanation: z.string().max(10_000).default(""),
  marks: z.coerce.number().int().min(1).max(30).default(1),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
});

const aiNoteSchema = z.object({
  title: z.string().min(3).max(200),
  topic: z.string().min(1).max(160),
  summary: z.string().max(500).default(""),
  content: z.string().min(20),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  readingMinutes: z.coerce.number().int().min(1).max(120).default(6),
  examCritical: z.boolean().default(false),
});

function normaliseZone(raw: string): "cat1" | "cat2" | "main" {
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (value === "cat1" || value === "cat2") return value;
  return "main";
}

function normaliseDifficulty(raw: string): "easy" | "medium" | "hard" {
  const value = raw.trim().toLowerCase();
  if (value === "easy" || value === "hard") return value;
  return "medium";
}

function normaliseQuestionType(raw: string): "mcq" | "short_answer" | "long_answer" | "structured" {
  const value = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "mcq") return "mcq";
  if (value === "short_answer") return "short_answer";
  if (value === "long_answer" || value === "essay") return "long_answer";
  if (value === "structured") return "structured";
  return "mcq";
}

/** Build the operator-facing CSV from validated AI items. */
function buildQuestionCsv(items: AiQuestion[], forcedTopic: string | null, forcedUnit: string | null): string {
  const rows = items.map((item) => {
    const isMcq = item.type === "mcq";
    const options = item.options.map((option) => option.trim()).filter((option) => option.length > 0);
    return {
      topic: forcedTopic ?? item.topic,
      unit: forcedUnit ?? "",
      zone: normaliseZone(item.zone),
      difficulty: normaliseDifficulty(item.difficulty),
      type: item.type,
      stem: item.stem,
      option_a: isMcq ? (options[0] ?? "") : "",
      option_b: isMcq ? (options[1] ?? "") : "",
      option_c: isMcq ? (options[2] ?? "") : "",
      option_d: isMcq ? (options[3] ?? "") : "",
      answer: isMcq ? item.answer.trim().toUpperCase().slice(0, 4) : item.answer,
      explanation: item.explanation,
      marks: item.marks,
      tags: item.tags.join(","),
    };
  });
  return Papa.unparse(rows, { columns: QUESTION_HEADER.split(",") });
}

function buildNoteCsv(items: AiNote[], forcedTopic: string | null, forcedUnit: string | null): string {
  const rows = items.map((item) => ({
    title: item.title,
    topic: forcedTopic ?? item.topic,
    unit: forcedUnit ?? "",
    summary: item.summary,
    tags: item.tags.join(";"),
    status: "published",
    reading_minutes: item.readingMinutes,
    exam_critical: item.examCritical ? "true" : "false",
    content: item.content,
  }));
  return Papa.unparse(rows, { columns: NOTE_HEADER.split(",") });
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
  const { type, text, count, topic, unit, zone, questionType, school } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // Topic list — without a fixed destination the AI may only map rows
  // onto real topics.
  const { data: topicRows, error: topicError } = await admin
    .from("topics")
    .select("slug, title, zone")
    .order("title");
  if (topicError) {
    console.error("[console-api/import/ai] topic list failed:", topicError.message);
    return Response.json({ error: topicError.message }, { status: 502 });
  }
  const topics = topicRows ?? [];
  // Zero-config path: with no topics in the CMS and no destination chosen,
  // the AI files everything under "general-biochemistry" — the importer's
  // auto-create provisions it on the way in.
  const fallbackTopic = topics.length === 0 && !topic ? "general-biochemistry" : null;
  const effectiveTopic = topic ?? fallbackTopic ?? null;
  const topicList = topics
    .map((row) => `- ${row.slug} — "${row.title}" (${row.zone})`)
    .join("\n");

  const defaultCount = type === "questions" ? 15 : 8;
  const targetCount = Math.min(count ?? defaultCount, type === "questions" ? 50 : 30);

  const wantsMcq = type === "questions" && questionType === "mcq";

  const destinationParts: string[] = [];
  if (effectiveTopic) {
    destinationParts.push(
      `TOPIC override: file EVERY item under the topic "${effectiveTopic}" — write exactly "${effectiveTopic}" in each item's topic field. Do NOT use any other topic.`,
    );
  } else {
    const fallbackLine = '- (no topics yet — use a short descriptive topic title like "Glycolysis")';
    destinationParts.push(
      `Available topics (slug — "title" (zone)) — pick the best match per item, never invent:\n${topicList || fallbackLine}`,
    );
  }
  if (unit) {
    destinationParts.push(
      `UNIT override: these items belong to course unit "${unit}" — report it back in unit_code/unit_name and keep it consistent.`,
    );
  }
  if (zone) {
    destinationParts.push(`ZONE override: write "${zone}" in every item's zone field.`);
  }
  if (school) {
    destinationParts.push(`School context: the material belongs to "${school}".`);
  }
  if (type === "questions") {
    if (wantsMcq) {
      destinationParts.push(
        'QUESTION TYPE override: EVERY item must be type "mcq" with exactly 4 options and an "answer" letter.',
      );
    } else if (questionType === "long_answer") {
      destinationParts.push(
        'QUESTION TYPE override: EVERY item must be type "long_answer" (essay) with options: [] and a full model answer in "answer".',
      );
    } else if (questionType === "short_answer") {
      destinationParts.push(
        'QUESTION TYPE override: EVERY item must be type "short_answer" with options: [] and a 1-3 sentence model answer in "answer".',
      );
    } else if (questionType === "structured") {
      destinationParts.push(
        'QUESTION TYPE override: EVERY item must be type "structured" with options: [], a model answer in "answer" and higher marks (5-10).',
      );
    } else {
      destinationParts.push(
        'QUESTION TYPE: mix formats sensibly — mostly "mcq" with a few "short_answer"/"structured" items where the material suits them.',
      );
    }
  }

  const userPrompt = `Target: produce up to ${targetCount} ${
    type === "questions" ? "questions" : "notes"
  }. Fewer is fine if the material runs out — never pad or repeat.

${destinationParts.join("\n\n")}

Material:
"""
${text.slice(0, MAX_TEXT_CHARS)}
"""`;

  const messages = [
    { role: "system" as const, content: type === "questions" ? QUESTION_SYSTEM : NOTE_SYSTEM },
    { role: "user" as const, content: userPrompt },
  ];

  let raw = "";
  let lastError = "";
  let payload: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await gatewayChat(
        "tutor",
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "assistant" as const,
                content: raw.slice(0, 2000),
              },
              {
                role: "user" as const,
                content:
                  "Your previous reply was not valid JSON for the required shape. Reply again with ONLY the JSON object — no markdown fences, no commentary, exactly the agreed shape.",
              },
            ],
        { temperature: 0.2, maxTokens: 16_000 },
      );
      raw = result.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI conversion failed";
      console.error("[console-api/import/ai] gateway failed:", message);
      return Response.json({ error: `AI conversion failed: ${message}` }, { status: 502 });
    }

    try {
      payload = extractJsonObject(raw);
      lastError = "";
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "invalid JSON";
      console.warn(`[console-api/import/ai] attempt ${attempt + 1}: ${lastError}`);
      payload = null;
    }
  }

  if (!payload) {
    return Response.json(
      {
        error:
          "The AI kept replying in the wrong format (no JSON object found). Try again — if it keeps failing, shorten the material or lower the target count.",
      },
      { status: 502 },
    );
  }

  const root = (payload ?? {}) as Record<string, unknown>;
  const detectedResult = detectedSchema.safeParse(root);
  const detected: DetectedInfo = detectedResult.success
    ? {
        subject: detectedResult.data.subject ?? null,
        unitCode: detectedResult.data.unit_code ?? null,
        unitName: detectedResult.data.unit_name ?? null,
        school: detectedResult.data.school ?? null,
      }
    : { subject: null, unitCode: null, unitName: null, school: null };

  const rawItems = Array.isArray(root.items) ? root.items : [];
  const problems: string[] = [];

  if (type === "questions") {
    const items: AiQuestion[] = [];
    rawItems.forEach((item, index) => {
      const result = aiQuestionSchema.safeParse(item);
      if (!result.success) {
        if (problems.length < 6) {
          problems.push(
            `Item ${index + 1}: ${result.error.issues[0]?.message ?? "invalid"}`,
          );
        }
        return;
      }
      const value = result.data;
      const questionType = normaliseQuestionType(value.type);
      const isMcq = questionType === "mcq";
      // MCQ answers must be a letter that matches the supplied options.
      const answer = isMcq ? value.answer.trim().toUpperCase().slice(0, 1) : value.answer.trim();
      if (isMcq && !/^[A-D]$/.test(answer)) {
        if (problems.length < 6) problems.push(`Item ${index + 1}: MCQ answer must be a letter A–D`);
        return;
      }
      items.push({
        topic: value.topic,
        zone: normaliseZone(value.zone),
        difficulty: normaliseDifficulty(value.difficulty),
        type: questionType,
        stem: value.stem,
        options: isMcq ? value.options.map((option) => String(option)) : [],
        answer,
        explanation: value.explanation,
        marks: value.marks,
        tags: value.tags,
      });
    });

    if (items.length === 0) {
      return Response.json(
        {
          error:
            "The AI replied but none of its questions passed validation. Try again, or lower the target count.",
          problems,
        },
        { status: 502 },
      );
    }

    const forcedUnit = unit ?? detected.unitCode ?? null;
    const csv = buildQuestionCsv(items, effectiveTopic, forcedUnit);

    // Pre-validate with the exact importer schemas so the operator sees a
    // trustworthy count before importing.
    let validCount = 0;
    const parsedCsv = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    (parsedCsv.data ?? []).forEach((row, index) => {
      const check = csvQuestionRowSchema.safeParse(row);
      if (check.success) {
        validCount += 1;
      } else if (problems.length < 8) {
        problems.push(`Row ${index + 1}: ${check.error.issues[0]?.message ?? "invalid"}`);
      }
    });

    return Response.json({
      csv,
      rowCount: items.length,
      validCount,
      invalidCount: items.length - validCount,
      problems,
      detected,
    });
  }

  // ---- notes ----
  const items: AiNote[] = [];
  rawItems.forEach((item, index) => {
    const result = aiNoteSchema.safeParse(item);
    if (!result.success) {
      if (problems.length < 6) {
        problems.push(`Item ${index + 1}: ${result.error.issues[0]?.message ?? "invalid"}`);
      }
      return;
    }
    items.push({
      title: result.data.title,
      topic: result.data.topic,
      summary: result.data.summary,
      content: result.data.content,
      tags: result.data.tags,
      readingMinutes: result.data.readingMinutes,
      examCritical: result.data.examCritical,
    });
  });

  if (items.length === 0) {
    return Response.json(
      {
        error:
          "The AI replied but none of its notes passed validation. Try again, or lower the target count.",
        problems,
      },
      { status: 502 },
    );
  }

  const forcedUnit = unit ?? detected.unitCode ?? null;
  const csv = buildNoteCsv(items, effectiveTopic, forcedUnit);

  let validCount = 0;
  const parsedCsv = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });
  (parsedCsv.data ?? []).forEach((row, index) => {
    const check = csvNoteRowSchema.safeParse(row);
    if (check.success) {
      validCount += 1;
    } else if (problems.length < 8) {
      problems.push(`Row ${index + 1}: ${check.error.issues[0]?.message ?? "invalid"}`);
    }
  });

  return Response.json({
    csv,
    rowCount: items.length,
    validCount,
    invalidCount: items.length - validCount,
    problems,
    detected,
  });
}
