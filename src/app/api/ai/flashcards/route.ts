import { z } from "zod";
import { handleRoute, jsonOk, jsonError } from "@/lib/api";
import { requireAiAccess } from "@/lib/ai/guards";
import { GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { generateNoteFlashcards } from "@/lib/ai/flashcards";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import type { NextResponse } from "next/server";

/**
 * POST /api/ai/flashcards — generate SM-2-ready flashcards from a published
 * note. Body: { noteId: uuid, count: 5|8|12 (default 8) }.
 * Gateway unreachable → the job is queued and a 202 is returned.
 */

const flashcardsRequestSchema = z.object({
  noteId: z.string().uuid(),
  count: z.union([z.literal(5), z.literal(8), z.literal(12)]).default(8),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = flashcardsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Invalid request body — count must be 5, 8 or 12", 400);
    }

    const guard = await requireAiAccess({
      flag: "auto_flashcards",
      task: "flashcards",
      capability: "take_assessments",
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    // RLS-visible published-note check (404 vs generation error).
    const { data: note } = await supabase
      .from("notes")
      .select("id")
      .eq("id", parsed.data.noteId)
      .eq("status", "published")
      .maybeSingle();
    if (!note) return jsonError("Note not found or not published", 404);

    try {
      const count = await generateNoteFlashcards(
        supabase,
        userId,
        parsed.data.noteId,
        parsed.data.count,
      );
      await recordAiUsage(userId, "flashcards", modelForTask("flashcards"), "ok");
      return jsonOk({ flashcards: count });
    } catch (error) {
      if (error instanceof GatewayError) {
        if (!gatewayConfigured()) {
          return jsonError("Aevibron gateway is not configured on this deployment", 503);
        }
        const queueId = await enqueueAiTask(
          "flashcards",
          { userId, noteId: parsed.data.noteId, count: parsed.data.count },
          userId,
        );
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "flashcards", modelForTask("flashcards"), "queued");
        return jsonOk({ queued: true }, { status: 202 });
      }
      throw error;
    }
  });
}
