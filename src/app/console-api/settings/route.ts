import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { toJson } from "@/types/domain";

/**
 * Console CMS endpoint — live site content and feature flags.
 *
 *   { action: "settings", key, value }  → upsert one site_settings row
 *     (branding, landing copy, support note …). Changes are live for
 *     every visitor on next load — no deploy needed.
 *   { action: "flag", key, enabled }    → toggle a feature flag; the
 *     matching module appears/disappears across the app instantly.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings"),
    key: z.enum(["branding", "landing", "support"]),
    value: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("flag"),
    key: z.string().min(1).max(60),
    enabled: z.boolean(),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid CMS payload" }, { status: 422 });
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "settings") {
    const { error } = await admin
      .from("site_settings")
      .upsert(
        { key: body.key, value: toJson(body.value), updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) return Response.json({ error: "Could not save the settings" }, { status: 502 });
    return Response.json({ ok: true });
  }

  const { error } = await admin.from("feature_flags").upsert(
    {
      key: body.key,
      enabled: body.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return Response.json({ error: "Could not toggle the flag" }, { status: 502 });
  return Response.json({ ok: true });
}
