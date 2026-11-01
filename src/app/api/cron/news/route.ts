import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { refreshNews } from "@/lib/news/refresh";

/**
 * Scheduled news refresh (auto search & auto upload).
 *
 * Vercel Cron hits this GET with `Authorization: Bearer $CRON_SECRET`
 * (set CRON_SECRET in the project env; the schedule lives in
 * vercel.json — every 6 hours). Without a CRON_SECRET the route falls
 * back to requiring the operations-console session, so it can also be
 * fired manually from a signed-in console.
 *
 * The run itself is gated by the news settings: it only fetches when
 * auto-search is on and the configured interval has elapsed, so extra
 * hits are cheap no-ops.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      const denied = await requireAdminApi();
      if (denied) return denied;
    }
  } else {
    const denied = await requireAdminApi();
    if (denied) return denied;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  try {
    const { ran, result } = await refreshNews(admin, "auto");
    return Response.json({ ok: true, ran, result: result ?? null });
  } catch (error) {
    console.error("[cron/news] refresh failed:", error);
    return Response.json({ ok: false, error: "News refresh failed" }, { status: 502 });
  }
}
