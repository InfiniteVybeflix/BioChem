import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import type { TablesUpdate } from "@/types/domain";

/**
 * Console schools endpoint — the supported-schools list and the
 * academic-year timeline.
 *
 *   { action: "create", name, shortName, country?, maxYears?, currentAcademicYear? }
 *   { action: "update", id, …fields }
 *   { action: "delete", id }
 *   { action: "advance_year", id }   → every student of the school moves
 *     up one year immediately (the "timeline moment": dashboards,
 *     notes and exams re-personalise to the new year on next load).
 */

const schema = z.object({
  action: z.enum(["create", "update", "delete", "advance_year"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(160).optional(),
  shortName: z.string().trim().min(1).max(24).optional(),
  country: z.string().trim().min(2).max(80).optional(),
  maxYears: z.number().int().min(1).max(8).optional(),
  currentAcademicYear: z.string().trim().max(40).optional(),
  yearAdvanceAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid school data" }, { status: 422 });
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "create") {
    if (!body.name || !body.shortName) {
      return Response.json({ error: "Name and short name are required" }, { status: 422 });
    }
    const { error } = await admin.from("schools").insert({
      name: body.name,
      short_name: body.shortName,
      country: body.country ?? "Kenya",
      max_years: body.maxYears ?? 4,
      current_academic_year: body.currentAcademicYear ?? "",
    });
    if (error) return Response.json({ error: "Could not add the school" }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (!body.id) return Response.json({ error: "Missing school id" }, { status: 422 });

  if (body.action === "delete") {
    const { error } = await admin.from("schools").delete().eq("id", body.id);
    if (error) return Response.json({ error: "Could not remove the school" }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (body.action === "advance_year") {
    const { data, error } = await admin.rpc("advance_school_year", { p_school: body.id });
    if (error) return Response.json({ error: error.message }, { status: 502 });
    return Response.json({ ok: true, studentsAdvanced: data ?? 0 });
  }

  // update
  const patch: TablesUpdate<"schools"> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch["name"] = body.name;
  if (body.shortName !== undefined) patch["short_name"] = body.shortName;
  if (body.country !== undefined) patch["country"] = body.country;
  if (body.maxYears !== undefined) patch["max_years"] = body.maxYears;
  if (body.currentAcademicYear !== undefined)
    patch["current_academic_year"] = body.currentAcademicYear;
  if (body.yearAdvanceAt !== undefined) patch["year_advance_at"] = body.yearAdvanceAt;
  if (body.isActive !== undefined) patch["is_active"] = body.isActive;

  const { error } = await admin.from("schools").update(patch).eq("id", body.id);
  if (error) return Response.json({ error: "Could not update the school" }, { status: 502 });
  return Response.json({ ok: true });
}
