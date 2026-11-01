import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { adSchema } from "@/lib/validation";
import type { AdPlacement } from "@/types/domain";
import type { Database } from "@/types/domain";

/**
 * Console ads & flags endpoint.
 *
 *   { action: "flag",   key, enabled }
 *   { action: "update", id, …partial ad fields }   (full edit)
 *   { action: "delete", id }
 *   { action: "create", …adSchema }
 *
 * An ad targets one or MORE placements (`placements` array — migration
 * 00018). The legacy single `placement` column is kept in sync with the
 * first entry, both here and by a database trigger, so nothing breaks
 * before the migration is applied: if the hosted database is still on
 * the old schema the mutations transparently fall back to it.
 *
 * Mutations return the affected row so the console UI can update its
 * table without a full page reload.
 */

/** Any subset of ad fields — enables both the enable-toggle and full edits. */
const patchSchema = adSchema.partial();

/** Generated row shapes for the update / insert statements. */
type AdUpdateRow = Database["public"]["Tables"]["ads"]["Update"];
type AdInsertRow = Database["public"]["Tables"]["ads"]["Insert"];

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

type AdSize = "compact" | "standard" | "large";

export interface AdRowPayload {
  id: string;
  title: string;
  body: string;
  placements: AdPlacement[];
  size: AdSize;
  targetUrl: string;
  imageUrl: string | null;
  ctaLabel: string;
  startsAt: string;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  enabled: boolean;
}

/** A raw ads row as it arrives — placements/size may be absent pre-00018. */
type RawAdRow = {
  id: string;
  title: string;
  body: string;
  placement: string;
  placements?: string[] | null;
  size?: string | null;
  target_url: string;
  image_url: string | null;
  cta_label: string;
  starts_at: string;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  enabled: boolean;
};

const AD_PLACEMENT_VALUES: readonly AdPlacement[] = [
  "banner",
  "sidebar",
  "jobs",
  "events",
  "resources",
];

const SIZES: readonly AdSize[] = ["compact", "standard", "large"];

/** Normalise a raw row into the payload the console UI expects. */
function rowPayload(row: RawAdRow): AdRowPayload {
  const fromArray = (row.placements ?? []).filter((value): value is AdPlacement =>
    (AD_PLACEMENT_VALUES as string[]).includes(value),
  );
  const fallback: AdPlacement[] = (AD_PLACEMENT_VALUES as string[]).includes(row.placement)
    ? [row.placement as AdPlacement]
    : ["banner"];
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    placements: fromArray.length > 0 ? fromArray : fallback,
    size: (SIZES as string[]).includes(row.size ?? "") ? (row.size as AdSize) : "standard",
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

/**
 * True when PostgREST rejected a statement because the deployed database
 * predates migration 00018 (no `placements` / `size` columns yet).
 */
function isLegacySchemaError(error: { message?: string | null; code?: string | null }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("placements") ||
    message.includes("ads.size") ||
    message.includes("column ads.") && message.includes("does not exist")
  );
}

const MODERN_COLUMNS =
  "id, title, body, placement, placements, size, target_url, image_url, cta_label, starts_at, ends_at, impressions, clicks, enabled";
const LEGACY_COLUMNS = MODERN_COLUMNS.replace(", placements, size", "");

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
    const modern: AdUpdateRow = {};
    if (body.title !== undefined) modern.title = body.title;
    if (body.body !== undefined) modern.body = body.body;
    if (body.placements !== undefined) modern.placements = [...new Set(body.placements)];
    if (body.size !== undefined) modern.size = body.size;
    if (body.targetUrl !== undefined) modern.target_url = body.targetUrl;
    if (body.imageUrl !== undefined) modern.image_url = body.imageUrl ?? null;
    if (body.ctaLabel !== undefined) modern.cta_label = body.ctaLabel;
    if (body.endsAt !== undefined) modern.ends_at = body.endsAt ?? null;
    if (body.enabled !== undefined) modern.enabled = body.enabled;

    if (Object.keys(modern).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const legacy = (({ placements: _p, size: _s, ...rest }) => rest)(modern);

    const runUpdate = async (patch: AdUpdateRow, columns: string) =>
      admin
        .from("ads")
        .update(patch)
        .eq("id", body.id)
        .select(columns)
        .single();

    let { data, error } = (await runUpdate(modern, MODERN_COLUMNS)) as {
      data: RawAdRow | null;
      error: { message?: string; code?: string } | null;
    };
    if (error && isLegacySchemaError(error)) {
      ({ data, error } = (await runUpdate(legacy, LEGACY_COLUMNS)) as {
        data: RawAdRow | null;
        error: { message?: string; code?: string } | null;
      });
    }
    if (error || !data) {
      const missing = (error?.message ?? "").toLowerCase().includes("0 rows")
        ? "That placement no longer exists — refresh the list"
        : "Could not update the placement";
      return Response.json({ error: missing }, { status: 502 });
    }
    return Response.json({ ok: true, ad: rowPayload(data) });
  }

  if (body.action === "delete") {
    const { error } = await admin.from("ads").delete().eq("id", body.id);
    if (error) return Response.json({ error: "Could not remove the placement" }, { status: 502 });
    return Response.json({ ok: true });
  }

  // create
  const modern: AdInsertRow = {
    title: body.title,
    body: body.body,
    placement: body.placements[0],
    placements: [...new Set(body.placements)],
    size: body.size,
    target_url: body.targetUrl,
    image_url: body.imageUrl ?? null,
    cta_label: body.ctaLabel,
    ends_at: body.endsAt ?? null,
    enabled: body.enabled,
  };
  const legacy = (({ placements: _p, size: _s, ...rest }) => rest)(modern);

  const runInsert = async (values: AdInsertRow, columns: string) =>
    admin.from("ads").insert(values).select(columns).single();

  let { data, error } = (await runInsert(modern, MODERN_COLUMNS)) as {
    data: RawAdRow | null;
    error: { message?: string; code?: string } | null;
  };
  if (error && isLegacySchemaError(error)) {
    ({ data, error } = (await runInsert(legacy, LEGACY_COLUMNS)) as {
      data: RawAdRow | null;
      error: { message?: string; code?: string } | null;
    });
  }
  if (error || !data) {
    return Response.json({ error: "Could not create the placement" }, { status: 502 });
  }
  return Response.json({ ok: true, ad: rowPayload(data) });
}
