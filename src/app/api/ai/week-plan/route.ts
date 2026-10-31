import { z } from "zod";
import { handleRoute, jsonOk, jsonError } from "@/lib/api";
import { requireAiAccess } from "@/lib/ai/guards";
import { GatewayError } from "@/lib/ai/gateway";
import { generateWeekPlan } from "@/lib/ai/week-planner";
import type { NextResponse } from "next/server";

/**
 * POST /api/ai/week-plan — schedule the coming week from free slots + goals.
 * Interactive only: a gateway outage is a 503 (nothing is queued) so the
 * planner UI can tell the student to retry.
 */

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

const weekPlanRequestSchema = z.object({
  freeSlots: z
    .array(
      z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(hhmm),
        end_time: z.string().regex(hhmm),
      }),
    )
    .min(1)
    .max(40),
  goals: z.array(z.string().min(1).max(200)).min(1).max(12),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const body: unknown = await req.json().catch(() => null);
    const parsed = weekPlanRequestSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);

    const guard = await requireAiAccess({
      flag: "ai_tutor",
      task: "week_planner",
      capability: "take_assessments",
    });
    if (!guard.ok) return guard.response;

    try {
      const events = await generateWeekPlan(parsed.data.freeSlots, parsed.data.goals);
      return jsonOk({ events });
    } catch (error) {
      if (error instanceof GatewayError) {
        return jsonError("The AI gateway is unreachable — please try again shortly", 503);
      }
      throw error;
    }
  });
}
