import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { pushSubscribeSchema } from "@/lib/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";

/**
 * /api/push/subscribe — web push subscription management for the signed-in
 * user.
 *
 * POST   → upsert the subscription keyed by its unique endpoint (updating the
 *          keys + owning user). Done with the service-role client because the
 *          endpoint may already exist under a previous account on the same
 *          browser and push_subscriptions has no UPDATE policy for RLS users;
 *          user_id always comes from the session, never the request body.
 *          Without a service key it falls back to an insert → replace-own →
 *          insert sequence under RLS.
 * DELETE → remove the caller's own subscription row for an endpoint.
 */

const unsubscribeBodySchema = z.object({ endpoint: z.string().url() });

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = pushSubscribeSchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid subscription payload", 400);
    const { endpoint, keys } = parsed.data;

    const admin = getSupabaseAdminClient();
    if (admin) {
      const { error } = await admin
        .from("push_subscriptions")
        .upsert({ user_id: auth.ctx.userId, endpoint, keys }, { onConflict: "endpoint" });
      if (error) return jsonError(`Could not save subscription: ${error.message}`, 500);
      return jsonOk({ ok: true });
    }

    // No service key: insert under RLS; on a duplicate endpoint replace the
    // caller's own row for it (delete + re-insert) so keys stay fresh.
    const first = await supabase
      .from("push_subscriptions")
      .insert({ user_id: auth.ctx.userId, endpoint, keys });
    if (!first.error) return jsonOk({ ok: true });
    if (first.error.code !== "23505") {
      return jsonError(`Could not save subscription: ${first.error.message}`, 500);
    }

    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", auth.ctx.userId);
    const retry = await supabase
      .from("push_subscriptions")
      .insert({ user_id: auth.ctx.userId, endpoint, keys });
    if (retry.error) {
      return jsonError(`Could not save subscription: ${retry.error.message}`, 500);
    }
    return jsonOk({ ok: true });
  });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = unsubscribeBodySchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid request body", 400);

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", parsed.data.endpoint)
      .eq("user_id", auth.ctx.userId);
    if (error) return jsonError(`Could not remove subscription: ${error.message}`, 500);

    return jsonOk({ ok: true });
  });
}
