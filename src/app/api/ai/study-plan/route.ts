import { z } from "zod";
import { handleRoute, jsonOk, jsonError } from "@/lib/api";
import { requireAiAccess } from "@/lib/ai/guards";
import { GatewayError, gatewayConfigured } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { generateStudyPlan } from "@/lib/ai/study-plan";
import { enqueueAiTask } from "@/lib/ai/queue";
import { recordAiUsage } from "@/lib/rate-limit";
import type { NextResponse } from "next/server";

/**
 * POST /api/ai/study-plan — week-by-week study plan from a syllabus.
 * Body: { syllabus, weeks?, examDate?, hoursPerWeek? }.
 * Gateway unreachable → queued + 202 (the queue processor notifies the user).
 */

const studyPlanRequestSchema = z.object({
  syllabus: z.string().min(10).max(20_000),
  weeks: z.number().int().min(1).max(16).default(6),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  hoursPerWeek: z.number().int().min(2).max(40).nullable().optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = studyPlanRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "study_plan",
      capability: "take_assessments",
    });
    if (!guard.ok) return guard.response;
    const { supabase, userId } = guard;

    const request = {
      syllabus: parsed.data.syllabus,
      weeks: parsed.data.weeks,
      ...(parsed.data.examDate ? { examDate: parsed.data.examDate } : {}),
      ...(parsed.data.hoursPerWeek ? { hoursPerWeek: parsed.data.hoursPerWeek } : {}),
    };

    try {
      const result = await generateStudyPlan(supabase, userId, request);
      await recordAiUsage(userId, "study_plan", modelForTask("study_plan"), "ok");
      return jsonOk({ planId: result.planId, weeks: result.weeks });
    } catch (error) {
      if (error instanceof GatewayError) {
        if (!gatewayConfigured()) {
          return jsonError("Aevibron gateway is not configured on this deployment", 503);
        }
        const queueId = await enqueueAiTask("study_plan", { userId, ...request }, userId);
        if (!queueId) {
          return jsonError("The AI gateway is unreachable — please try again shortly", 502);
        }
        await recordAiUsage(userId, "study_plan", modelForTask("study_plan"), "queued");
        return jsonOk({ queued: true }, { status: 202 });
      }
      throw error;
    }
  });
}
