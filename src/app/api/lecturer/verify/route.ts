import type { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/push";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/lecturer/verify — award the verified badge to a community answer
 * (verify_answers). Loads the reply + its discussion with the RLS client,
 * marks it verified, awards the author 15 XP via award_xp_to (staff RPC) and
 * notifies them in-app (notifyUsers uses the service-role client internally).
 */

const bodySchema = z.object({ replyId: z.string().uuid("A valid replyId is required") });

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("verify_answers");
    if (!auth.ok) return auth.response;

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }

    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);

    const { data: reply } = await rls
      .from("discussion_replies")
      .select("id, discussion_id, user_id, is_verified")
      .eq("id", parsed.data.replyId)
      .maybeSingle();
    if (!reply) return jsonError("That reply no longer exists", 404);
    if (reply.is_verified) return jsonError("That answer is already verified", 400);

    const { data: discussion } = await rls
      .from("discussions")
      .select("id")
      .eq("id", reply.discussion_id)
      .maybeSingle();
    if (!discussion) return jsonError("The parent discussion no longer exists", 404);

    const { error } = await rls
      .from("discussion_replies")
      .update({ is_verified: true, verified_by: auth.ctx.userId })
      .eq("id", reply.id);
    if (error) return jsonError(`Could not verify the answer: ${error.message}`, 500);

    const { error: xpError } = await rls.rpc("award_xp_to", {
      p_user: reply.user_id,
      p_amount: 15,
      p_reason: "reply_verified",
    });
    if (xpError) {
      return jsonError(`Answer verified, but the XP award failed: ${xpError.message}`, 500);
    }

    await notifyUsers([reply.user_id], "system", {
      title: "Your answer was verified by a lecturer",
      body: "Great explanation — it earned 15 XP",
      link: `/community/${reply.discussion_id}`,
    });

    return jsonOk({ ok: true });
  });
}
