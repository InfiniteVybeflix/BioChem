import { handleRoute, jsonOk, jsonError } from "@/lib/api";
import { aiExplainSchema } from "@/lib/validation";
import { requireAiAccess } from "@/lib/ai/guards";
import { GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { generateExplanation } from "@/lib/ai/explain";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import type { NextResponse } from "next/server";

/**
 * POST /api/ai/explain — single-shot explanation (exam / ELI5 / step-by-step).
 * Body: aiExplainSchema. Returns { explanation } or 202 { queued: true } when
 * the gateway is unreachable (the queue processor delivers it later).
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = aiExplainSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "explain",
      capability: "take_assessments",
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    let noteContext: { title: string; content_md: string } | null = null;
    if (parsed.data.noteId) {
      const { data: note } = await supabase
        .from("notes")
        .select("title, content_md")
        .eq("id", parsed.data.noteId)
        .maybeSingle();
      if (note) noteContext = note;
    }

    try {
      const result = await generateExplanation({
        content: parsed.data.content,
        mode: parsed.data.mode,
        noteContext,
      });
      await recordAiUsage(userId, "explain", result.model, "ok", result.latencyMs);
      return jsonOk({ explanation: result.explanation });
    } catch (error) {
      if (error instanceof GatewayError) {
        if (!gatewayConfigured()) {
          return jsonError("Aevibron gateway is not configured on this deployment", 503);
        }
        const queueId = await enqueueAiTask(
          "explain",
          {
            userId,
            content: parsed.data.content,
            mode: parsed.data.mode,
            noteId: parsed.data.noteId ?? null,
          },
          userId,
        );
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "explain", modelForTask("explain"), "queued");
        return jsonOk({ queued: true }, { status: 202 });
      }
      throw error;
    }
  });
}
