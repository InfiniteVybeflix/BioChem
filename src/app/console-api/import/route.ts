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
 *   GET  → { topics: [{ slug, title, zone }],
 *            units: [{ id, code, name, school_id, year, semester }] }
 *   POST → { type: "questions" | "notes", rows, autoCreateTopics?,
 *            defaultZone?, schoolId?, defaultUnitId?, autoCreateUnits?,
 *            unitYear?, answerVisibility? { mode, releaseAt? } }
 *
 * Rows are the papaparse output of a UTF-8 CSV with a header row
 * (same column contract as the lecturer importer). Per-row problems
 * are reported without failing the whole batch; a row only inserts
 * when its topic resolves (by slug or exact title) — or is
 * auto-created.
 *
 * Units: a row's optional `unit` column files the row's topic under
 * that course unit (resolved by id, normalised code — "bio 205" →
 * BIO205 — or exact name). A chosen `defaultUnitId` destination
 * overrides every row, the way a chosen topic does. With
 * `autoCreateUnits` a recognised-but-missing unit (BIO205 …) is
 * created on the fly under the chosen school, so an AI conversion
 * that names its own unit still lands in the right place.
 *
 * Answer visibility (questions only): `answerVisibility.mode =
 * "hidden"` publishes the questions with their answers withheld —
 * students can attempt, but the key/explanation only open when the
 * lecturer releases them or at `releaseAt`.
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
  /** Destination unit — every row files under this unit. */
  defaultUnitId: z.string().uuid().nullable().optional(),
  /** Create missing units (matched by code) instead of skipping them. */
  autoCreateUnits: z.boolean().optional(),
  /** Study year for units created on the fly (default 1). */
  unitYear: z.coerce.number().int().min(1).max(8).optional(),
  /** Questions publish with hidden answers when mode = "hidden". */
  answerVisibility: z
    .object({
      mode: z.enum(["visible", "hidden"]),
      releaseAt: z.string().optional(),
    })
    .optional(),
});

function parseTags(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, 8);
}

/** "bio 205" → "BIO205" — the normalised form unit codes are matched in. */
function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const [topicsResult, unitsResult] = await Promise.all([
    admin.from("topics").select("slug, title, zone").order("title"),
    admin
      .from("units")
      .select("id, code, name, school_id, year, semester")
      .order("code"),
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
  const {
    type,
    rows,
    autoCreateTopics,
    defaultZone,
    schoolId,
    defaultUnitId,
    autoCreateUnits,
    unitYear,
    answerVisibility,
  } = parsed.data;

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

  // Unit maps: rows file content under a unit via id, normalised code or
  // exact name. Missing units never block a row — the content still
  // imports; with autoCreateUnits the unit is created instead.
  const { data: unitRows, error: unitError } = await admin
    .from("units")
    .select("id, code, name, school_id, year");
  const unitById = new Map<string, string>();
  const unitByCode = new Map<string, string>();
  const unitByName = new Map<string, string>();
  const unitYearById = new Map<string, number>();
  if (unitError) {
    console.warn(
      "[console-api/import] units unavailable — the unit column is ignored for this import (run the units SQL).",
    );
  } else {
    for (const unit of unitRows ?? []) {
      unitById.set(unit.id, unit.id);
      unitByCode.set(normaliseCode(unit.code), unit.id);
      unitByName.set(unit.name.toLowerCase(), unit.id);
      unitYearById.set(unit.id, unit.year);
    }
  }
  const resolveUnit = (reference: string | undefined): string | null => {
    const raw = reference?.trim();
    if (!raw) return null;
    return (
      unitById.get(raw) ??
      unitByCode.get(normaliseCode(raw)) ??
      unitByName.get(raw.toLowerCase()) ??
      null
    );
  };

  // Destination unit: forced onto every row, like a chosen topic.
  const forcedUnitId = defaultUnitId ? (unitById.get(defaultUnitId) ?? null) : null;

  const notices: string[] = [];

  /**
   * Auto-create a missing unit from a row reference ("BIO205", "Bio 205",
   * or an exact unit name). Needs a school — the destination school wins,
   * otherwise the destination unit's school, otherwise the unit is skipped.
   */
  const createUnit = async (reference: string): Promise<string | null> => {
    if (!autoCreateUnits) return null;
    const raw = reference.trim();
    if (raw.length < 2) return null;
    const code = normaliseCode(raw);
    if (!/^[A-Z]{2,6}\d{2,4}[A-Z]?$/i.test(code)) return null; // not a unit-code shape
    const school = schoolId ?? null;
    if (!school) {
      if (!notices.includes("no-school-for-units")) {
        notices.push("no-school-for-units");
      }
      return null;
    }
    // Another batch row may have created it already.
    const existing = unitByCode.get(code);
    if (existing) return existing;
    const year = unitYear ?? 1;
    const { data, error } = await admin
      .from("units")
      .insert({ school_id: school, code, name: raw, year })
      .select("id")
      .single();
    if (error || !data) {
      console.warn("[console-api/import] auto-create unit failed:", error?.message);
      return null;
    }
    unitById.set(data.id, data.id);
    unitByCode.set(code, data.id);
    unitByName.set(raw.toLowerCase(), data.id);
    unitYearById.set(data.id, year);
    return data.id;
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
   * Unit for the row: the destination unit wins, then the row's own
   * `unit` column (auto-created when recognised and missing). When the
   * resolved topic isn't in that unit yet, the topic gains it so the
   * content shows up on /units for the right school + year.
   */
  const unitFor = async (value: { unit?: string }, topicId: string): Promise<string | null> => {
    let unitId = forcedUnitId;
    if (!unitId) {
      const reference = value.unit?.trim();
      if (reference) {
        unitId = resolveUnit(reference) ?? (await createUnit(reference));
      }
    }
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

  // Question answer visibility — "hidden" publishes with the answer
  // withheld (optionally until releaseAt).
  const releaseAt = answerVisibility?.releaseAt
    ? new Date(answerVisibility.releaseAt)
    : null;
  const answersHidden = type === "questions" && answerVisibility?.mode === "hidden";
  const answersReleaseAt =
    answersHidden && releaseAt && !Number.isNaN(releaseAt.getTime())
      ? releaseAt.toISOString()
      : null;

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
        const rowUnit = forcedUnitId ?? resolveUnit(value.unit);
        if (!rowUnit && value.unit && autoCreateUnits) {
          // Create the unit first so the new topic lands inside it.
          const created = await createUnit(value.unit);
          topicId = await createTopic(value.topic, zoneFor(value), created);
        } else {
          topicId = await createTopic(value.topic, zoneFor(value), rowUnit);
        }
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

      // Answer visibility: an explicit answers_hidden column on the row wins,
      // otherwise the operator's destination choice applies.
      const rowHiddenPresent = "answers_hidden" in rows[index];
      const rowRelease = value.answers_release_at ? new Date(value.answers_release_at) : null;
      const hidden = rowHiddenPresent ? value.answers_hidden : answersHidden;
      const releaseIso =
        hidden && rowRelease && !Number.isNaN(rowRelease.getTime())
          ? rowRelease.toISOString()
          : answersReleaseAt;

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
        ...(hidden ? { answers_hidden: true, answers_release_at: releaseIso } : {}),
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
        const rowUnit = forcedUnitId ?? resolveUnit(value.unit);
        if (!rowUnit && value.unit && autoCreateUnits) {
          const created = await createUnit(value.unit);
          topicId = await createTopic(value.topic, zoneFor(value), created);
        } else {
          topicId = await createTopic(value.topic, zoneFor(value), rowUnit);
        }
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

  if (notices.includes("no-school-for-units")) {
    errors.push({
      row: 0,
      error:
        "Some units couldn't be created — pick a destination school (or choose the destination unit) so new units know where they belong.",
    });
  }

  return Response.json({ inserted, errors });
}
