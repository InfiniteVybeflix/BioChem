import type { NextResponse } from "next/server";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { classStats } from "@/lib/analytics/class";

/**
 * POST /api/lecturer/class-stats — aggregate class counters (students,
 * lecturers, 30-day attempts, average mock %, queues). Service-role client:
 * cross-user aggregates are unreadable under RLS, so the capability check
 * runs first.
 */
export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("view_class_analytics");
    if (!auth.ok) return auth.response;

    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError("Service temporarily unavailable", 503);

    const stats = await classStats(admin);
    return jsonOk(stats);
  });
}
