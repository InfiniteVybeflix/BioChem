import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { adSchema } from "@/lib/validation";
import type { AdPlacement } from "@/types/domain";

/**
 * Console ads & flags endpoint.
 *
 *   { action: "flag",   key, enabled }
 *   { action: "update", id, …partial ad fields }   (full edit)
 *   { action: "delete", id }
 *   { action: "create", …adSchema }
 *
 * Mutations return the affected row so the console UI can update its
 * table without a full page reload.
 */

/** Any subset of ad fields — enables both the enable-toggle and full edits. */
const patchSchema = adSchema.partial();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("flag"),
    key: z.string().min(1).max(60),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    ...patchSchema.shape,
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
  }),
  z.object({ action: z.literal("create") }).merge(adSchema),
]);

type AdRowPayload = {
  id: string;
  title: string;
  body: string;
  placement: AdPlacement;
  target_url: string;
  image_url: string | null;
  cta_label: string;
  starts_at: string;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  enabled: boolean;
};

function rowPayload(row: AdRowPayload) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    placement: row.placement as AdPlacement,
    targetUrl: row.target_url,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    impressions: row.impressions,
    clicks: row.clicks,
    enabled: row.enabled,
  };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid ad payload" },
      { status: 422 },
    );
  }
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
    // Only the fields actually provided are patched.
    const patch: Partial<{
      title: string;
      body: string;
      placement: AdPlacement;
      target_url: string;
      image_url: string | null;
      cta_label: string;
      ends_at: string | null;
      enabled: boolean;
    }> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.body !== undefined) patch.body = body.body;
    if (body.placement !== undefined) patch.placement = body.placement;
    if (body.targetUrl !== undefined) patch.target_url = body.targetUrl;
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl ?? null;
    if (body.ctaLabel !== undefined) patch.cta_label = body.ctaLabel;
    if (body.endsAt !== undefined) patch.ends_at = body.endsAt ?? null;
    if (body.enabled !== undefined) patch.enabled = body.enabled;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { data, error } = await admin
      .from("ads")
      .update(patch)
      .eq("id", body.id)
      .select(
        "id, title, body, placement, target_url, image_url, cta_label, starts_at, ends_at, impressions, clicks, enabled",
      )
      .single();
    if (error || !data) {
      return Response.json({ error: "Could not update the placement" }, { status: 502 });
    }
    return Response.json({ ok: true, ad: rowPayload(data as AdRowPayload) });
  }

  if (body.action === "delete") {
    const { error } = await admin.from("ads").delete().eq("id", body.id);
    if (error) return Response.json({ error: "Could not remove the placement" }, { status: 502 });
    return Response.json({ ok: true });
  }

  const { data, error } = await admin
    .from("ads")
    .insert({
      title: body.title,
      body: body.body,
      placement: body.placement,
      target_url: body.targetUrl,
      image_url: body.imageUrl ?? null,
      cta_label: body.ctaLabel,
      ends_at: body.endsAt ?? null,
      enabled: body.enabled,
    })
    .select(
      "id, title, body, placement, target_url, image_url, cta_label, starts_at, ends_at, impressions, clicks, enabled",
    )
    .single();
  if (error || !data) {
    return Response.json({ error: "Could not create the placement" }, { status: 502 });
  }
  return Response.json({ ok: true, ad: rowPayload(data as AdRowPayload) });
}
