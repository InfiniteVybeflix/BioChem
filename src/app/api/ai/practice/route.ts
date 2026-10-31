import type { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAiAccess } from "@/lib/ai/guards";
import { gatewayChat, gatewayConfigured } from "@/lib/ai/gateway";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { questionOptions } from "@/types/domain";

/**
 * /api/ai/practice — AI-generated MCQ practice with AI marking.
 *
 *   POST { action: "generate", topicId, count, difficulty }
 *     → fresh multiple-choice questions (validated, 4 options each).
 *
 *   POST { action: "mark", questions, answers }
 *     → the selected answers travel back WITH the questions; the AI
 *       marks them and returns per-question remarks, the correct
 *       answer, what to note, and an overall coaching message.
 *       (Answers never touch the database — marking is stateless.)
 */

const generateSchema = z.object({
  action: z.literal("generate"),
  topicId: z.string().uuid(),
  count: z.number().int().min(3).max(15).default(8),
  difficulty: z.enum(["easy", "medium", "hard", "all"]).default("all"),
});

const optionSchema = z.object({ key: z.string(), text: z.string() });

const markQuestionSchema = z.object({
  stem: z.string(),
  options: z.array(optionSchema).min(2).max(6),
  answerKey: z.string(),
  marks: z.number().int().min(1).max(20).default(1),
});

const markSchema = z.object({
  action: z.literal("mark"),
  questions: z.array(markQuestionSchema).min(1).max(20),
  answers: z.record(z.string(), z.string().max(10)),
});

const bodySchema = z.discriminatedUnion("action", [generateSchema, markSchema]);

interface PracticeQuestion {
  stem: string;
  options: { key: string; text: string }[];
  answerKey: string;
  marks: number;
  explanation: string;
}

const GENERATE_PROMPT = `Generate university biochemistry multiple-choice practice questions.
Return ONLY a valid JSON array (no markdown fences, no commentary). Each element:
{
  "stem": "the question (LaTeX allowed with $...$)",
  "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}],
  "answerKey": "the correct key, e.g. \\"A\\"",
  "marks": 1,
  "explanation": "why the answer is correct (2-3 sentences)"
}
Exactly 4 options per question, one correct answer, no "all of the above".`;

const MARK_PROMPT = `You are marking a student's biochemistry multiple-choice practice.
You receive the questions, their correct answers and the student's selected answers.

Return ONLY a valid JSON object (no markdown fences):
{
  "results": [
    {
      "index": 0,
      "correct": true,
      "selected": "B",
      "remark": "one sentence of specific feedback on the student's choice",
      "note": "the key point to remember for this question"
    }
  ],
  "overall": "2-3 sentences: what went well, the weakest area, and the single most valuable thing to revise next"
}
Mark strictly: correct only when the selected key equals the answer key. Keep remarks encouraging but honest.`;

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.search(/[[{]/);
  const endBracket = candidate.lastIndexOf("]");
  const endBrace = candidate.lastIndexOf("}");
  const end = Math.max(endBracket, endBrace);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The AI returned an unreadable response — please try again");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAiAccess({
    flag: "ai_tutor",
    task: "tutor",
    capability: "take_assessments",
  });
  if (!guard.ok) return guard.response;

  if (!gatewayConfigured()) {
    return jsonError("AI practice is temporarily unavailable", 503);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid practice request", 422);

  try {
    if (parsed.data.action === "generate") {
      const { topicId, count, difficulty } = parsed.data;
      const supabase = await getSupabaseServerClient();
      if (!supabase) return jsonError("Service temporarily unavailable", 503);

      const { data: topic } = await supabase
        .from("topics")
        .select("title, description, zone")
        .eq("id", topicId)
        .maybeSingle();
      if (!topic) return jsonError("Topic not found", 404);

      // Ground generation in this topic's published notes when present.
      const { data: notes } = await supabase
        .from("notes")
        .select("title, content_md")
        .eq("topic_id", topicId)
        .eq("status", "published")
        .limit(3);
      const grounding = (notes ?? [])
        .map((note) => `### ${note.title}\n${note.content_md.slice(0, 8000)}`)
        .join("\n\n");

      const result = await gatewayChat("tutor", [
        { role: "system", content: GENERATE_PROMPT },
        {
          role: "user",
          content: `Topic: ${topic.title}${topic.description ? ` — ${topic.description}` : ""} (${topic.zone.toUpperCase()} zone).
${grounding ? `Course notes to draw from:\n${grounding}\n` : ""}
Generate ${count} ${difficulty === "all" ? "mixed-difficulty" : difficulty} questions as instructed.`,
        },
      ]);

      const raw = extractJson(result.content);
      if (!Array.isArray(raw)) throw new Error("The AI returned no questions — please try again");

      const questions: PracticeQuestion[] = [];
      for (const item of raw.slice(0, 15)) {
        if (typeof item !== "object" || item === null) continue;
        const record = item as Record<string, unknown>;
        const stem = typeof record["stem"] === "string" ? record["stem"] : "";
        const options = questionOptions(record["options"] as never);
        const answerKey = typeof record["answerKey"] === "string" ? record["answerKey"] : "";
        if (!stem || options.length < 2 || !answerKey) continue;
        questions.push({
          stem,
          options,
          answerKey,
          marks: typeof record["marks"] === "number" ? record["marks"] : 1,
          explanation: typeof record["explanation"] === "string" ? record["explanation"] : "",
        });
      }
      if (questions.length === 0)
        throw new Error("The AI returned no usable questions — please try again");

      return jsonOk({ questions });
    }

    // ---- mark ----
    const { questions, answers } = parsed.data;
    const result = await gatewayChat("tutor", [
      { role: "system", content: MARK_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          questions: questions.map((question, index) => ({
            index,
            stem: question.stem,
            options: question.options,
            answerKey: question.answerKey,
            marks: question.marks,
            studentAnswer: answers[String(index)] ?? null,
          })),
        }),
      },
    ]);

    const payload = extractJson(result.content) as {
      results?: {
        index?: number;
        correct?: boolean;
        selected?: string;
        remark?: string;
        note?: string;
      }[];
      overall?: string;
    };

    const results = questions.map((question, index) => {
      const match = payload.results?.find((entry) => entry.index === index);
      const selected = answers[String(index)] ?? null;
      return {
        index,
        correct: selected !== null && selected === question.answerKey,
        selected,
        correctAnswer: question.answerKey,
        remark: typeof match?.remark === "string" ? match.remark : "",
        note: typeof match?.note === "string" ? match.note : "",
      };
    });
    const score = results.filter((entry) => entry.correct).length;

    return jsonOk({
      results,
      score,
      total: questions.length,
      overall:
        typeof payload.overall === "string"
          ? payload.overall
          : `You scored ${score}/${questions.length}. Review the flagged questions and try another set.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI practice failed";
    return jsonError(message, 502);
  }
}
