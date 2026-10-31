import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NextResponse } from "next/server";

/**
 * /api/ads/impression — records an ad impression or click for the signed-in
 * user. RLS allows authenticated inserts; the ads.impressions/clicks counters
 * are incremented by the ad_impression_trigger in the database.
 */

const impressionBodySchema = z.object({
  adId: z.string().uuid(),
  kind: z.enum(["impression", "click"]),
});

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = impressionBodySchema.safeParse(body);
    if (!parsed.success) return jsonError("Invalid impression payload", 400);

    const { error } = await supabase.from("ad_impressions").insert({
      ad_id: parsed.data.adId,
      user_id: auth.ctx.userId,
      kind: parsed.data.kind,
    });
    if (error) {
      if (error.code === "23503") return jsonError("Ad not found", 404);
      return jsonError(`Could not record ${parsed.data.kind}: ${error.message}`, 500);
    }

    return jsonOk({ ok: true });
  });
}
