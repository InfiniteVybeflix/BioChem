import { jsonOk } from "@/lib/api";
import { gatewayConfigured, gatewayStatus } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import type { NextResponse } from "next/server";

/**
 * GET /api/ai/status — PUBLIC health endpoint (no auth).
 * Reports gateway configuration, live gateway health and the model routed to
 * each AI task. Used by the tutor/daily UIs to decide between the live
 * experience and a setup notice.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return jsonOk({
    configured: gatewayConfigured(),
    gateway: await gatewayStatus(),
    models: {
      tutor: modelForTask("tutor"),
      daily: modelForTask("daily_questions"),
      explain: modelForTask("explain"),
      study_plan: modelForTask("study_plan"),
      flashcards: modelForTask("flashcards"),
      week_planner: modelForTask("week_planner"),
    },
  });
}
