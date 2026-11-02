import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { csvNoteRowSchema, csvQuestionRowSchema, slugify } from "@/lib/content/schema";
import type { QuestionOption } from "@/types/domain";
import { toJson } from "@/types/domain";

/**
 * Console content import — the operator-side counterpart of the staff
 * CSV importer (/api/content/csv). The console has no database
 * account, so it cannot use the staff endpoints; this route validates
 * the admin session and writes through the service-role client
 * instead.
 *
 *   GET  → { topics: [{ slug, title, zone }], units: [{ code, name }] }
 *   POST → { type: "questions" | "notes", rows, autoCreateTopics?,
 *            defaultZone?, schoolId? }
 *
 * Rows are the papaparse output of a UTF-8 CSV with a header row
 * (same column contract as the lecturer importer). Per-row problems
 * are reported without failing the whole batch; a row only inserts
 * when its topic resolves (by slug or exact title) in the CMS.
 *
 * An optional `unit` column on a row files the row's topic under that
 * course unit (resolved by normalised code — "bio 205" → BIO205 — or
 * exact name). If the resolved topic has no unit yet it gains one;
 * with `autoCreateTopics` the created topic lands inside the unit.
 *
 * With `autoCreateTopics` the unknown topics are created on the fly
 * (from the row's topic column), so an AI conversion can be imported
 * end-to-end without pre-building the topic tree. `defaultZone` is
 * the zone used for auto-created topics whose row doesn't name one,
 * and `schoolId` (optional) scopes the created topics to a school.
 */

const MAX_ROWS = 500;

const zoneSchema = z.enum(["cat1", "cat2", "main"]);

const bodySchema = z.object({
  type: z.enum(["questions", "notes"]),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "Nothing to import")
    .max(MAX_ROWS, `Import at most ${MAX_ROWS} rows at a time`),
  autoCreateTopics: z.boolean().optional(),
  defaultZone: zoneSchema.optional(),
  schoolId: z.string().uuid().nullable().optional(),
});

/** Console CSV note row — shared with the AI conversion route. */

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, 8);
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const [topicsResult, unitsResult] = await Promise.all([
    admin.from("topics").select("slug, title, zone").order("title"),
    admin.from("units").select("code, name").order("code"),
  ]);
  if (topicsResult.error) {
    console.error("[console-api/import] topic list failed:", topicsResult.error.message);
    return Response.json({ error: topicsResult.error.message }, { status: 502 });
  }
  return Response.json({
    topics: topicsResult.data ?? [],
    units: unitsResult.error ? [] : (unitsResult.data ?? []),
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid import payload" },
      { status: 422 },
    );
  }
  const { type, rows, autoCreateTopics, defaultZone, schoolId } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // Topic map built once — rows may reference a topic by its slug or
  // its exact title so either column pastes cleanly from the CMS list.
  const { data: topicRows, error: topicError } = await admin
    .from("topics")
    .select("id, slug, title, unit_id");
  if (topicError) {
    console.error("[console-api/import] topic lookup failed:", topicError.message);
    return Response.json({ error: topicError.message }, { status: 502 });
  }
  const topicBySlug = new Map((topicRows ?? []).map((row) => [row.slug, row.id]));
  const topicByTitle = new Map((topicRows ?? []).map((row) => [row.title.toLowerCase(), row.id]));
  const resolveTopic = (reference: string): string | null =>
    topicBySlug.get(reference) ?? topicByTitle.get(reference.toLowerCase()) ?? null;
  const topicUnit = new Map(
    (topicRows ?? []).map((row) => [row.id, (row as { unit_id?: string | null }).unit_id ?? null]),
  );

  // Unit map: rows file content under a unit via its code (normalised:
  // "bio 205" → BIO205) or its exact name. Missing units never block a
  // row — the content still imports, the unit tag is simply skipped.
  const { data: unitRows, error: unitError } = await admin
    .from("units")
    .select("id, code, name");
  const unitByCode = new Map<string, string>();
  const unitByName = new Map<string, string>();
  if (unitError) {
    console.warn(
      "[console-api/import] units unavailable — the unit column is ignored for this import (run the units SQL).",
    );
  } else {
    for (const unit of unitRows ?? []) {
      unitByCode.set(unit.code.toUpperCase().replace(/\s+/g, ""), unit.id);
      unitByName.set(unit.name.toLowerCase(), unit.id);
    }
  }
  const resolveUnit = (reference: string | undefined): string | null => {
    const raw = reference?.trim();
    if (!raw) return null;
    return unitByCode.get(raw.toUpperCase().replace(/\s+/g, "")) ?? unitByName.get(raw.toLowerCase()) ?? null;
  };

  /**
   * Auto-create a missing topic from its row reference. Mirrors the
   * console topics endpoint: slugified title, deduped slug, zone from
   * the row (or the chosen default), optional school scope, and the
   * row's unit (when it resolves) so the topic lands inside the unit.
   */
  const createTopic = async (
    reference: string,
    zone: "cat1" | "cat2" | "main",
    unitId?: string | null,
  ): Promise<string | null> => {
    const title = reference.trim().slice(0, 160);
    if (title.length < 2) return null;
    const base = slugify(title) || "topic";
    let slug = base;
    for (let suffix = 2; suffix < 100 && topicBySlug.has(slug); suffix += 1) {
      slug = `${base}-${suffix}`;
    }
    let orderIndex = 0;
    const { data: maxRow } = await admin
      .from("topics")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1);
    orderIndex = (maxRow?.[0]?.order_index ?? -1) + 1;

    const { data, error } = await admin
      .from("topics")
      .insert({
        title,
        slug,
        zone,
        ...(schoolId ? { school_id: schoolId } : {}),
        ...(unitId ? { unit_id: unitId } : {}),
        order_index: orderIndex,
      })
      .select("id")
      .single();
    if (error && (schoolId || unitId) && /school_id|unit_id|does not exist|PGRST204/i.test(error.message)) {
      // The topics.school_id / topics.unit_id column isn't applied yet
      // (pending setup SQL) — create the topic without the scopes
      // instead of failing the whole row.
      console.warn(
        "[console-api/import] topics scope columns are missing — creating the topic without school/unit scope. Run System → Database setup to add them.",
      );
      const retry = await admin
        .from("topics")
        .insert({ title, slug, zone, order_index: orderIndex })
        .select("id")
        .single();
      if (!retry.error && retry.data) {
        topicBySlug.set(slug, retry.data.id);
        topicByTitle.set(title.toLowerCase(), retry.data.id);
        return retry.data.id;
      }
    }
    if (error || !data) {
      console.error("[console-api/import] auto-create topic failed:", error?.message);
      return null;
    }
    // Register so later rows in the same batch reuse it.
    topicBySlug.set(slug, data.id);
    topicByTitle.set(title.toLowerCase(), data.id);
    return data.id;
  };

  /** Zone override: the operator's choice wins over the row's own column. */
  const zoneFor = (value?: unknown): "cat1" | "cat2" | "main" => {
    if (defaultZone) return defaultZone;
    const zone = (value as { zone?: unknown } | null | undefined)?.zone;
    return zone === "cat1" || zone === "cat2" || zone === "main" ? zone : "main";
  };

  /**
   * Unit for the row: resolved from the row's `unit` column. When the
   * resolved topic isn't in a unit yet, the topic gains this unit so
   * the content shows up on /units for the right school + year.
   */
  const unitFor = async (value: { unit?: string }, topicId: string): Promise<string | null> => {
    const unitId = resolveUnit(value.unit);
    if (!unitId) return null;
    if ((topicUnit.get(topicId) ?? null) !== unitId) {
      const { error: assignError } = await admin
        .from("topics")
        .update({ unit_id: unitId })
        .eq("id", topicId);
      if (!assignError) topicUnit.set(topicId, unitId);
    }
    return unitId;
  };

  let inserted = 0;
  const errors: { row: number; error: string }[] = [];
  const stamp = Date.now().toString(36);

  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 1;

    if (type === "questions") {
      const parsedRow = csvQuestionRowSchema.safeParse(rows[index]);
      if (!parsedRow.success) {
        errors.push({
          row: rowNumber,
          error: parsedRow.error.issues[0]?.message ?? "Row does not match the CSV contract",
        });
        continue;
      }
      const value = parsedRow.data;
      let topicId = resolveTopic(value.topic);
      if (!topicId && autoCreateTopics) {
        topicId = await createTopic(value.topic, zoneFor(value), resolveUnit(value.unit));
      }
      if (!topicId) {
        errors.push({
          row: rowNumber,
          error: `Unknown topic "${value.topic}" — tick “auto-create missing topics” or add it in the CMS Topics tab first`,
        });
        continue;
      }
      // File the row under its unit (assigning the topic if needed).
      await unitFor(value, topicId);

      // MCQ options are built from option_a..option_d, empties filtered out.
      let options: QuestionOption[] = [];
      if (value.type === "mcq") {
        const pairs: { key: string; text: string | undefined }[] = [
          { key: "A", text: value.option_a },
          { key: "B", text: value.option_b },
          { key: "C", text: value.option_c },
          { key: "D", text: value.option_d },
        ];
        options = pairs
          .filter((pair) => typeof pair.text === "string" && pair.text.trim().length > 0)
          .map((pair) => ({ key: pair.key, text: (pair.text ?? "").trim() }));
      }

      const { error } = await admin.from("questions").insert({
        topic_id: topicId,
        zone: zoneFor(value),
        difficulty: value.difficulty,
        type: value.type,
        stem_md: value.stem,
        options: toJson(options),
        answer_key: value.answer,
        explanation_md: value.explanation,
        marks: value.marks,
        source: "bank",
        status: "published",
        tags: parseTags(value.tags),
      });
      if (error) {
        console.error(`[console-api/import] question row ${rowNumber} failed:`, error.message);
        errors.push({ row: rowNumber, error: error.message });
        continue;
      }
      inserted += 1;
    } else {
      const parsedRow = csvNoteRowSchema.safeParse(rows[index]);
      if (!parsedRow.success) {
        errors.push({
          row: rowNumber,
          error: parsedRow.error.issues[0]?.message ?? "Row does not match the CSV contract",
        });
        continue;
      }
      const value = parsedRow.data;
      let topicId = resolveTopic(value.topic);
      if (!topicId && autoCreateTopics) {
        topicId = await createTopic(value.topic, zoneFor(value), resolveUnit(value.unit));
      }
      if (!topicId) {
        errors.push({
          row: rowNumber,
          error: `Unknown topic "${value.topic}" — tick “auto-create missing topics” or add it in the CMS Topics tab first`,
        });
        continue;
      }
      // File the row under its unit (assigning the topic if needed).
      await unitFor(value, topicId);

      const { error } = await admin.from("notes").insert({
        topic_id: topicId,
        title: value.title,
        slug: `${slugify(value.title)}-${stamp}-${index}`,
        summary: value.summary?.trim() ? value.summary.trim() : null,
        content_md: value.content,
        status: value.status,
        is_exam_critical: value.exam_critical,
        reading_minutes: value.reading_minutes ?? 6,
        tags: parseTags(value.tags),
        published_at: value.status === "published" ? new Date().toISOString() : null,
      });
      if (error) {
        console.error(`[console-api/import] note row ${rowNumber} failed:`, error.message);
        errors.push({ row: rowNumber, error: error.message });
        continue;
      }
      inserted += 1;
    }
  }

  return Response.json({ inserted, errors });
}
