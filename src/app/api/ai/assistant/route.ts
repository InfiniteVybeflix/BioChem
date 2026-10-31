import type { NextResponse } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { requireAiAccess } from "@/lib/ai/guards";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { runAssistant, assistantRequestSchema } from "@/lib/ai/assistant";

/**
 * /api/ai/assistant — the staff writing assistant (notes, reworks).
 * Staff-only: requires the publish_content capability and the
 * ai_assistant feature flag. Returns a structured draft plus the
 * action buttons the UI should offer (publish / shorten / expand /
 * regenerate) — the actions themselves run through the normal
 * publishing paths.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAiAccess({
    flag: "ai_assistant",
    task: "flashcards",
    capability: "publish_content",
  });
  if (!guard.ok) return guard.response;

  if (!gatewayConfigured()) {
    return jsonError("The AI assistant is temporarily unavailable", 503);
  }

  const parsed = assistantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("Invalid assistant request", 422);
  }

  try {
    const result = await runAssistant(parsed.data);
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant failed";
    return jsonError(message, 502);
  }
}
