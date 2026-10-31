import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { adSchema } from "@/lib/validation";

/**
 * Console ads & flags endpoint.
 *
 *   { action: "flag",   key, enabled }
 *   { action: "update", id, enabled }
 *   { action: "delete", id }
 *   { action: "create", …adSchema }
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("flag"),
    key: z.string().min(1).max(60),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
  z.object({ action: z.literal("create") }).merge(adSchema),
]);

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid ad payload" }, { status: 422 });
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "flag") {
    const { error } = await admin
      .from("feature_flags")
      .upsert(
        { key: body.key, enabled: body.enabled, updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) return Response.json({ error: "Could not toggle the flag" }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (body.action === "update") {
    const { error } = await admin.from("ads").update({ enabled: body.enabled }).eq("id", body.id);
    if (error) return Response.json({ error: "Could not update the placement" }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await admin.from("ads").delete().eq("id", body.id);
    if (error) return Response.json({ error: "Could not remove the placement" }, { status: 502 });
    return Response.json({ ok: true });
  }

  const { error } = await admin.from("ads").insert({
    title: body.title,
    body: body.body,
    placement: body.placement,
    target_url: body.targetUrl,
    image_url: body.imageUrl ?? null,
    cta_label: body.ctaLabel,
    ends_at: body.endsAt ?? null,
    enabled: body.enabled,
  });
  if (error) return Response.json({ error: "Could not create the placement" }, { status: 502 });
  return Response.json({ ok: true });
}
