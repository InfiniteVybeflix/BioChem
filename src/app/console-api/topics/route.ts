import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { dbErrorResponse } from "@/lib/admin/api-errors";
import { slugify } from "@/lib/content/schema";

/**
 * Console CMS topics endpoint — the content topic tree that notes,
 * questions, discussions and every importer resolve against.
 *
 *   GET  → { topics: [{ id, title, slug, zone, description, orderIndex,
 *                     unitId, unitCode, unitName, notesCount, questionsCount }] }
 *   POST { action: "create", title, zone, description?, orderIndex?, unitId? }
 *   POST { action: "update", id, title?, zone?, description?, orderIndex?, unitId? }
 *   POST { action: "delete", id }   (cascades to the topic's notes &
 *                                   questions — the UI confirms first)
 *
 * Slugs are generated from the title (deduped) at creation and stay
 * stable afterwards, so nothing that links to a topic ever breaks.
 * A topic can live inside a course unit (BIO 205 …) — the unit is the
 * student-facing home on /units; the zone stays for the exam banks.
 */

const zoneSchema = z.enum(["cat1", "cat2", "main"]);

const createSchema = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(2, "Topic title needs at least 2 characters").max(160),
  zone: zoneSchema,
  description: z.string().trim().max(500).optional(),
  orderIndex: z.coerce.number().int().min(0).max(9999).optional(),
  unitId: z.string().uuid().nullable().optional(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  zone: zoneSchema.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  orderIndex: z.coerce.number().int().min(0).max(9999).optional(),
  unitId: z.string().uuid().nullable().optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().uuid(),
});

const schema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

export interface TopicListRow {
  id: string;
  title: string;
  slug: string;
  zone: "cat1" | "cat2" | "main";
  description: string | null;
  orderIndex: number;
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
  notesCount: number;
  questionsCount: number;
}

interface RawTopicRow {
  id: string;
  title: string;
  slug: string;
  zone: string;
  description: string | null;
  order_index: number;
  unit_id?: string | null;
  units?: { code?: string; name?: string } | null;
  notes?: { count: number }[];
  questions?: { count: number }[];
}

function toListRow(row: RawTopicRow): TopicListRow {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    zone: zoneSchema.safeParse(row.zone).success ? (row.zone as "cat1" | "cat2" | "main") : "main",
    description: row.description,
    orderIndex: row.order_index,
    unitId: row.unit_id ?? null,
    unitCode: row.units?.code ?? null,
    unitName: row.units?.name ?? null,
    notesCount: row.notes?.[0]?.count ?? 0,
    questionsCount: row.questions?.[0]?.count ?? 0,
  };
}

/** Unique slug derived from the title: "…", "…-2", "…-3", … */
async function uniqueSlug(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  title: string,
): Promise<string> {
  const base = slugify(title) || "topic";
  const { data } = await admin.from("topics").select("slug");
  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const { data, error } = await admin
    .from("topics")
    .select(
      "id, title, slug, zone, description, order_index, unit_id, units(code, name), notes(count), questions(count)",
    )
    .order("order_index")
    .order("title");
  if (error) {
    // Embedded counts can fail where a plain select works (e.g. a
    // pending migration) — degrade instead of erroring the tab.
    const fallback = await admin
      .from("topics")
      .select("id, title, slug, zone, description, order_index, unit_id")
      .order("order_index")
      .order("title");
    if (fallback.error) return dbErrorResponse("load topics", fallback.error);
    return Response.json({ topics: (fallback.data ?? []).map(toListRow) });
  }
  return Response.json({ topics: (data ?? []).map(toListRow) });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid topic payload" },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "create") {
    const slug = await uniqueSlug(admin, body.title);
    let orderIndex = body.orderIndex;
    if (orderIndex === undefined) {
      // New topics land at the end of the list.
      const { data: maxRow } = await admin
        .from("topics")
        .select("order_index")
        .order("order_index", { ascending: false })
        .limit(1);
      orderIndex = (maxRow?.[0]?.order_index ?? -1) + 1;
    }

    const { data, error } = await admin
      .from("topics")
      .insert({
        title: body.title,
        slug,
        zone: body.zone,
        description: body.description?.trim() ? body.description.trim() : null,
        order_index: orderIndex,
        unit_id: body.unitId ?? null,
      })
      .select("id, title, slug, zone, description, order_index, unit_id, units(code, name)")
      .single();
    if (error || !data) {
      // A unit id that doesn't exist (or a pending migration) shouldn't
      // kill the whole create — retry without the unit assignment.
      if (body.unitId) {
        const retry = await admin
          .from("topics")
          .insert({
            title: body.title,
            slug,
            zone: body.zone,
            description: body.description?.trim() ? body.description.trim() : null,
            order_index: orderIndex,
          })
          .select("id, title, slug, zone, description, order_index, unit_id")
          .single();
        if (!retry.error && retry.data) {
          return Response.json({
            ok: true,
            topic: toListRow({ ...retry.data, notes: [{ count: 0 }], questions: [{ count: 0 }] }),
          });
        }
      }
      return dbErrorResponse("create the topic", error ?? null);
    }
    return Response.json({
      ok: true,
      topic: toListRow({ ...data, notes: [{ count: 0 }], questions: [{ count: 0 }] }),
    });
  }

  if (body.action === "update") {
    const patch: {
      title?: string;
      zone?: "cat1" | "cat2" | "main";
      description?: string | null;
      order_index?: number;
      unit_id?: string | null;
    } = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.zone !== undefined) patch.zone = body.zone;
    if (body.description !== undefined) {
      patch.description = body.description?.trim() ? body.description.trim() : null;
    }
    if (body.orderIndex !== undefined) patch.order_index = body.orderIndex;
    if (body.unitId !== undefined) patch.unit_id = body.unitId;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { data, error } = await admin
      .from("topics")
      .update(patch)
      .eq("id", body.id)
      .select(
        "id, title, slug, zone, description, order_index, unit_id, units(code, name), notes(count), questions(count)",
      )
      .single();
    if (error || !data) {
      return dbErrorResponse("update the topic", error ?? null);
    }
    return Response.json({ ok: true, topic: toListRow(data as RawTopicRow) });
  }

  // delete — cascades to notes, questions, outcomes, discussions…
  const { error } = await admin.from("topics").delete().eq("id", body.id);
  if (error) return dbErrorResponse("delete the topic", error);
  return Response.json({ ok: true });
}
