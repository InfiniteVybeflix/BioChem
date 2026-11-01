import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { isFeatureIconName } from "@/components/console/feature-icons";

/**
 * Console CMS features endpoint — the landing-page feature cards.
 *
 *   GET  → { features: [{ id, icon, title, description, href, enabled, orderIndex }] }
 *   POST { action: "create", icon, title, description, href? }
 *   POST { action: "update", id, icon?, title?, description?, href?, enabled? }
 *   POST { action: "delete", id }
 *   POST { action: "move",   id, direction: "up" | "down" }
 *
 * The landing page renders the enabled cards in order — edits here are
 * live on the next page load, no deploy needed.
 */

const iconSchema = z.string().refine(isFeatureIconName, "Pick one of the offered icons");

const createSchema = z.object({
  action: z.literal("create"),
  icon: iconSchema,
  title: z.string().trim().min(2, "Feature title needs at least 2 characters").max(80),
  description: z.string().trim().min(2, "Describe what the feature does").max(400),
  href: z.string().trim().max(200).nullable().optional(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.string().uuid(),
  icon: iconSchema.optional(),
  title: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(2).max(400).optional(),
  href: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
});

const moveSchema = z.object({
  action: z.literal("move"),
  id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().uuid(),
});

const schema = z.discriminatedUnion("action", [
  createSchema,
  updateSchema,
  moveSchema,
  deleteSchema,
]);

export interface FeatureListRow {
  id: string;
  icon: string;
  title: string;
  description: string;
  href: string | null;
  enabled: boolean;
  orderIndex: number;
}

interface RawFeatureRow {
  id: string;
  icon: string;
  title: string;
  description: string;
  href: string | null;
  enabled: boolean;
  order_index: number;
}

function toListRow(row: RawFeatureRow): FeatureListRow {
  return {
    id: row.id,
    icon: row.icon,
    title: row.title,
    description: row.description,
    href: row.href,
    enabled: row.enabled,
    orderIndex: row.order_index,
  };
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const { data, error } = await admin
    .from("site_features")
    .select("id, icon, title, description, href, enabled, order_index")
    .order("order_index")
    .order("created_at");
  if (error) {
    return Response.json({ error: "Could not load features" }, { status: 502 });
  }
  return Response.json({ features: (data ?? []).map(toListRow) });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feature payload" },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "create") {
    const { data: maxRow } = await admin
      .from("site_features")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1);
    const orderIndex = (maxRow?.[0]?.order_index ?? -1) + 1;

    const { data, error } = await admin
      .from("site_features")
      .insert({
        icon: body.icon,
        title: body.title,
        description: body.description,
        href: body.href?.trim() ? body.href.trim() : null,
        order_index: orderIndex,
        enabled: true,
      })
      .select("id, icon, title, description, href, enabled, order_index")
      .single();
    if (error || !data) {
      return Response.json({ error: "Could not create the feature" }, { status: 502 });
    }
    return Response.json({ ok: true, feature: toListRow(data) });
  }

  if (body.action === "update") {
    const patch: {
      icon?: string;
      title?: string;
      description?: string;
      href?: string | null;
      enabled?: boolean;
    } = {};
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.href !== undefined) patch.href = body.href?.trim() ? body.href.trim() : null;
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { data, error } = await admin
      .from("site_features")
      .update(patch)
      .eq("id", body.id)
      .select("id, icon, title, description, href, enabled, order_index")
      .single();
    if (error || !data) {
      return Response.json({ error: "Could not update the feature" }, { status: 502 });
    }
    return Response.json({ ok: true, feature: toListRow(data) });
  }

  if (body.action === "move") {
    const { data: rows } = await admin
      .from("site_features")
      .select("id, order_index")
      .order("order_index")
      .order("created_at");
    const ordered = rows ?? [];
    const index = ordered.findIndex((row) => row.id === body.id);
    if (index === -1) {
      return Response.json({ error: "Feature not found" }, { status: 404 });
    }
    const target = body.direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ordered.length) {
      return Response.json({ ok: true }); // already at the edge
    }
    // Normalise to positional indexes, then swap the pair.
    const normalised = ordered.map((row, position) => ({ id: row.id, order: position }));
    const moving = normalised[index];
    const neighbour = normalised[target];
    const { error: firstError } = await admin
      .from("site_features")
      .update({ order_index: neighbour.order })
      .eq("id", moving.id);
    const { error: secondError } = await admin
      .from("site_features")
      .update({ order_index: moving.order })
      .eq("id", neighbour.id);
    if (firstError || secondError) {
      return Response.json({ error: "Could not reorder the features" }, { status: 502 });
    }
    const { data, error } = await admin
      .from("site_features")
      .select("id, icon, title, description, href, enabled, order_index")
      .order("order_index")
      .order("created_at");
    if (error) {
      return Response.json({ error: "Could not load features" }, { status: 502 });
    }
    return Response.json({ ok: true, features: (data ?? []).map(toListRow) });
  }

  // delete
  const { error } = await admin.from("site_features").delete().eq("id", body.id);
  if (error) return Response.json({ error: "Could not delete the feature" }, { status: 502 });
  return Response.json({ ok: true });
}
