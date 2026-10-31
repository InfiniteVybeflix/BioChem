import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";

/**
 * /api/push/test — sends a real "system" notification to the caller so they
 * can verify their push setup end-to-end (respects their prefs + quiet hours
 * exactly like production notifications).
 */
export async function POST(): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    if (!getSupabaseAdminClient()) {
      return jsonError("Notifications service is not configured on this deployment", 503);
    }

    await notifyUsers([auth.ctx.userId], "system", {
      title: "Test notification",
      body: "Push is working — see you at revision time.",
      link: "/dashboard",
    });

    return jsonOk({ ok: true });
  });
}
