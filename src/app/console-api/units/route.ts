import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { dbErrorResponse } from "@/lib/admin/api-errors";

/**
 * Console CMS units endpoint — the course units (BIO 205 "Biochemistry of
 * Plants", MIC 205 …) that topics and their notes are filed under. A unit
 * belongs to a school and a study year, so students open THEIR unit for
 * THEIR school + year and read what's inside.
 *
 *   GET  → { units: [{ id, code, name, description, schoolId, schoolName,
 *                     schoolShort, year, semester, orderIndex, isActive,
 *                     topicsCount, notesCount }] }
 *   POST { action: "create", schoolId, code, name, year, semester?,
 *          description?, orderIndex?, isActive? }
 *   POST { action: "update", id, …fields }
 *   POST { action: "delete", id }   (topics keep existing — they just
 *                                   lose the unit assignment)
 *
 * Unit codes are normalised (upper-cased, whitespace stripped: "bio 205"
 * → "BIO205") and unique per school, so imports and links resolve cleanly.
 */

const yearSchema = z.coerce.number().int().min(1).max(8);
const semesterSchema = z.coerce.number().int().min(1).max(3);

/** "bio 205" → "BIO205" — codes are stored upper-case without spaces. */
function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").slice(0, 24);
}

const createSchema = z.object({
  action: z.literal("create"),
  schoolId: z.string().uuid("Pick the school the unit belongs to"),
  code: z.string().trim().min(2, "Unit code needs at least 2 characters").max(40),
  name: z.string().trim().min(2, "Unit name needs at least 2 characters").max(160),
  year: yearSchema,
  semester: semesterSchema.nullable().optional(),
  description: z.string().trim().max(500).optional(),
  orderIndex: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  id: z.string().uuid(),
  schoolId: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  year: yearSchema.optional(),
  semester: semesterSchema.nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  orderIndex: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  id: z.string().uuid(),
});

const schema = z.discriminatedUnion("action", [createSchema, updateSchema, deleteSchema]);

export interface UnitListRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  schoolId: string;
  schoolName: string;
  schoolShort: string;
  year: number;
  semester: number | null;
  orderIndex: number;
  isActive: boolean;
  topicsCount: number;
  notesCount: number;
}

interface RawUnitRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  year: number;
  semester: number | null;
  order_index: number;
  is_active: boolean;
  school_id: string;
  schools?: { name?: string; short_name?: string } | null;
  topics?: { count: number }[];
}

function toListRow(row: RawUnitRow): UnitListRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    schoolId: row.school_id,
    schoolName: row.schools?.name ?? "",
    schoolShort: row.schools?.short_name ?? "",
    year: row.year,
    semester: row.semester,
    orderIndex: row.order_index,
    isActive: row.is_active,
    topicsCount: row.topics?.[0]?.count ?? 0,
    notesCount: 0, // filled by the GET handler via a second query
  };
}

/** Unique violation → a message the operator can act on. */
function uniqueMessage(error: { code?: string; message: string } | null): string | null {
  if (error?.code === "23505") {
    return "That unit code is already used for this school — edit the existing unit instead.";
  }
  return null;
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // Units + school names + topic counts. If the embedded aggregates fail
  // (e.g. the units table is missing — pending setup SQL) return a clear
  // error so the UI can show a setup hint.
  const { data, error } = await admin
    .from("units")
    .select(
      "id, code, name, description, year, semester, order_index, is_active, school_id, schools(name, short_name), topics(count)",
    )
    .order("school_id")
    .order("year")
    .order("order_index")
    .order("code");
  if (error) {
    console.error("[console-api/units] load failed:", error.message);
    return dbErrorResponse("load units", error);
  }

  const rows = (data ?? []) as unknown as RawUnitRow[];

  // Note counts per unit in one query (notes → topics → unit).
  const notesByUnit = new Map<string, number>();
  const { data: noteRows, error: notesError } = await admin
    .from("notes")
    .select("id, topic:topics!notes_topic_id_fkey(unit_id)", { count: "exact" })
    .eq("status", "published")
    .not("topic.unit_id", "is", null);
  if (!notesError) {
    for (const row of noteRows ?? []) {
      const unitId = (row.topic as { unit_id: string | null } | null)?.unit_id;
      if (unitId) notesByUnit.set(unitId, (notesByUnit.get(unitId) ?? 0) + 1);
    }
  }

  return Response.json({
    units: rows.map((row) => ({ ...toListRow(row), notesCount: notesByUnit.get(row.id) ?? 0 })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid unit payload" },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "create") {
    const code = normalizeCode(body.code);
    if (code.length < 2) {
      return Response.json({ error: "Give the unit a real code (e.g. BIO205)" }, { status: 422 });
    }
    let orderIndex = body.orderIndex;
    if (orderIndex === undefined) {
      const { data: maxRow } = await admin
        .from("units")
        .select("order_index")
        .eq("school_id", body.schoolId)
        .order("order_index", { ascending: false })
        .limit(1);
      orderIndex = (maxRow?.[0]?.order_index ?? -1) + 1;
    }

    const { data, error } = await admin
      .from("units")
      .insert({
        school_id: body.schoolId,
        code,
        name: body.name,
        year: body.year,
        semester: body.semester ?? null,
        description: body.description?.trim() ? body.description.trim() : "",
        is_active: body.isActive ?? true,
        order_index: orderIndex,
      })
      .select("id, code, name, description, year, semester, order_index, is_active, school_id")
      .single();
    if (error || !data) {
      const friendly = uniqueMessage(error);
      if (friendly) return Response.json({ error: friendly }, { status: 409 });
      return dbErrorResponse("create the unit", error ?? null);
    }
    return Response.json({ ok: true, unitId: data.id });
  }

  if (!body.id) return Response.json({ error: "Missing unit id" }, { status: 422 });

  if (body.action === "update") {
    const patch: {
      school_id?: string;
      code?: string;
      name?: string;
      year?: number;
      semester?: number | null;
      description?: string;
      order_index?: number;
      is_active?: boolean;
    } = {};
    if (body.schoolId !== undefined) patch.school_id = body.schoolId;
    if (body.code !== undefined) {
      const code = normalizeCode(body.code);
      if (code.length < 2) {
        return Response.json({ error: "Give the unit a real code (e.g. BIO205)" }, { status: 422 });
      }
      patch.code = code;
    }
    if (body.name !== undefined) patch.name = body.name;
    if (body.year !== undefined) patch.year = body.year;
    if (body.semester !== undefined) patch.semester = body.semester;
    if (body.description !== undefined) {
      patch.description = body.description?.trim() ? body.description.trim() : "";
    }
    if (body.orderIndex !== undefined) patch.order_index = body.orderIndex;
    if (body.isActive !== undefined) patch.is_active = body.isActive;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { error } = await admin.from("units").update(patch).eq("id", body.id);
    if (error) {
      const friendly = uniqueMessage(error);
      if (friendly) return Response.json({ error: friendly }, { status: 409 });
      return dbErrorResponse("update the unit", error);
    }
    return Response.json({ ok: true });
  }

  // delete — topics survive with unit_id cleared (on delete set null).
  const { error } = await admin.from("units").delete().eq("id", body.id);
  if (error) return dbErrorResponse("delete the unit", error);
  return Response.json({ ok: true });
}
