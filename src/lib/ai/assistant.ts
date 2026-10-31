import { z } from "zod";
import { gatewayChat } from "@/lib/ai/gateway";

/**
 * The staff AI assistant — a working partner, not a chatbot.
 *
 * Lecturers and the platform team ask it to draft notes (or
 * announcements); it returns a structured draft plus suggested next
 * actions. The frontend turns those actions into real buttons
 * (publish to students, make it shorter, turn it into flashcards…),
 * so a conversation becomes a workflow.
 */

export const assistantRequestSchema = z.object({
  mode: z.enum(["note", "announcement", "shorten", "expand"]),
  instruction: z.string().trim().max(4000).default(""),
  topicTitle: z.string().trim().max(200).default(""),
  /** For shorten/expand — the current draft to rework. */
  content: z.string().max(60_000).optional(),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export const assistantDraftSchema = z.object({
  title: z.string().min(3).max(200),
  summary: z.string().max(500).default(""),
  content_md: z.string().min(50),
});

export interface AssistantResult {
  reply: string;
  draft: { title: string; summary: string; contentMd: string } | null;
  actions: { id: string; label: string }[];
}

const NOTE_PROMPT = `You are the BioChem staff writing assistant. A lecturer gives you a topic and instructions; you produce publication-ready course notes for university biochemistry students.

Rules:
- Write in clean markdown: a short orientation paragraph, then headed sections, bullet points where they aid recall.
- Use LaTeX ($...$ inline, $$...$$ display) for every equation, structure relationship or kinetic expression.
- Include a worked example or clinical link when it clarifies.
- End with a 3-5 bullet "Exam focus" section listing the outcomes students are typically examined on.
- Never invent citations or data.

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "title": "concise note title",
  "summary": "one-sentence summary (max 300 chars)",
  "content_md": "the full note in markdown"
}`;

const ANNOUNCEMENT_PROMPT = `You write short platform announcements for university biochemistry students. The operator gives you the gist; you produce a clear, friendly announcement.

Rules:
- Title: max 8 words. Body: 2-4 short sentences of markdown.
- Concrete, warm, no fluff, no emoji spam (one is fine if it fits).

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "title": "…",
  "summary": "",
  "content_md": "announcement body"
}`;

const REWORK_PROMPT = `You rework existing biochemistry course-note markdown according to the lecturer's instruction (e.g. "make it shorter", "add a clinical correlation", "simplify the kinetics section").

Keep the academic register, keep LaTeX formatting, keep all essential facts. Do not pad.

Respond with ONLY a JSON object (no markdown fences, no commentary):
{
  "title": "kept or improved title",
  "summary": "one-sentence summary",
  "content_md": "the reworked markdown"
}`;

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The assistant returned an unreadable draft — please try again");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function runAssistant(request: AssistantRequest): Promise<AssistantResult> {
  let systemPrompt = NOTE_PROMPT;
  let userPrompt = request.instruction;
  if (request.mode === "announcement") {
    systemPrompt = ANNOUNCEMENT_PROMPT;
  } else if (request.mode === "shorten" || request.mode === "expand") {
    systemPrompt = REWORK_PROMPT;
    userPrompt = `Instruction: ${request.instruction || (request.mode === "shorten" ? "Make this note markedly shorter while keeping every essential fact." : "Expand this note with more depth, examples and clinical correlations.")}\n\nCurrent draft:\n${request.content ?? ""}`;
  }
  if (request.topicTitle) {
    userPrompt = `Topic: ${request.topicTitle}\n\n${userPrompt}`;
  }

  const result = await gatewayChat(request.mode === "announcement" ? "moderation" : "flashcards", [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt.slice(0, 40_000) },
  ]);

  const parsed = assistantDraftSchema.safeParse(extractJson(result.content));
  if (!parsed.success) {
    throw new Error("The assistant's draft wasn't complete — please try again");
  }

  const draft = {
    title: parsed.data.title,
    summary: parsed.data.summary ?? "",
    contentMd: parsed.data.content_md,
  };

  const actions =
    request.mode === "announcement"
      ? [
          { id: "publish_announcement", label: "Send this announcement" },
          { id: "shorten", label: "Make it shorter" },
          { id: "regenerate", label: "Try again" },
        ]
      : [
          { id: "publish_note", label: "Publish to my students" },
          { id: "shorten", label: "Make it shorter" },
          { id: "expand", label: "Add more depth" },
          { id: "regenerate", label: "Regenerate" },
        ];

  const reply =
    request.mode === "announcement"
      ? "Here's a draft announcement — send it, or ask me to tighten it up."
      : `Draft ready: "${draft.title}". Publish it to your students, let me rework it, or refine it with another instruction.`;

  return { reply, draft, actions };
}
