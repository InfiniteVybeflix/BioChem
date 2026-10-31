import { gatewayChat, type GatewayMessage } from "@/lib/ai/gateway";
import { EXPLAIN_SYSTEM_PROMPT } from "@/lib/ai/prompts";

/** Explain modes supported by the tutor's single-shot explainer. */
export type ExplainMode = "exam" | "eli5" | "steps";

export const EXPLAIN_MODE_LABELS: Record<ExplainMode, string> = {
  exam: "Exam answer",
  eli5: "ELI5",
  steps: "Step-by-step",
};

export interface ExplainResult {
  explanation: string;
  model: string;
  latencyMs: number;
}

/**
 * Single-shot explanation generator. Optionally grounds the answer in a
 * course note supplied by the caller (already visibility-checked).
 */
export async function generateExplanation(params: {
  content: string;
  mode: ExplainMode;
  noteContext?: { title: string; content_md: string } | null;
}): Promise<ExplainResult> {
  const noteBlock = params.noteContext
    ? `Context — course note "${params.noteContext.title}":\n${params.noteContext.content_md.slice(0, 12_000)}\n\n`
    : "";

  const messages: GatewayMessage[] = [
    { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
    { role: "user", content: `${noteBlock}MODE: ${params.mode}\n\n${params.content}` },
  ];

  const result = await gatewayChat("explain", messages);
  if (result.content.trim().length === 0) {
    throw new Error("The tutor returned an empty explanation");
  }
  return {
    explanation: result.content,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}
