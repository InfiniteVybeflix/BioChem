import type { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { csvQuestionRowSchema } from "@/lib/content/schema";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { QuestionOption } from "@/types/domain";
import { toJson } from "@/types/domain";

/**
 * POST /api/content/csv — staff CSV question import (publish_content).
 * Body: `{ rows: unknown[] }` (papaparse output with header row, capped at
 * 500). Each row is validated with csvQuestionRowSchema and inserted as a
 * published bank question; invalid rows are reported per-row without failing
 * the whole request. Inserts go through the RLS-scoped server client.
 *
 * The optional `unit` column files the row's topic under a course unit
 * (resolved by normalised code — "bio 205" → BIO205 — or exact name).
 * The optional `answers_hidden` / `answers_release_at` columns publish the
 * question with its answer withheld (lecturers release from Marking).
 */

const bodySchema = z.object({
  rows: z
    .array(z.unknown())
    .min(1, "Nothing to import")
    .max(500, "Import at most 500 rows at a time"),
});

/** "bio 205" → "BIO205" — the normalised form unit codes are matched in. */
function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("publish_content");
    if (!auth.ok) return auth.response;

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }

    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);

    // Topic slug → id map, built once.
    const { data: topicRows } = await rls.from("topics").select("id, slug, unit_id");
    const topicBySlug = new Map((topicRows ?? []).map((row) => [row.slug, row.id]));
    const topicUnit = new Map(
      (topicRows ?? []).map((row) => [row.id, (row as { unit_id?: string | null }).unit_id ?? null]),
    );

    // Unit maps — rows may name their unit by code or exact name.
    const { data: unitRows } = await rls.from("units").select("id, code, name");
    const unitByCode = new Map<string, string>();
    const unitByName = new Map<string, string>();
    for (const unit of unitRows ?? []) {
      unitByCode.set(normaliseCode(unit.code), unit.id);
      unitByName.set(unit.name.toLowerCase(), unit.id);
    }
    const resolveUnit = (reference: string | undefined): string | null => {
      const raw = reference?.trim();
      if (!raw) return null;
      return unitByCode.get(normaliseCode(raw)) ?? unitByName.get(raw.toLowerCase()) ?? null;
    };

    let inserted = 0;
    const errors: { row: number; error: string }[] = [];

    for (let index = 0; index < parsed.data.rows.length; index += 1) {
      const row = parsed.data.rows[index];
      const parsedRow = csvQuestionRowSchema.safeParse(row);
      if (!parsedRow.success) {
        errors.push({
          row: index + 1,
          error: parsedRow.error.issues[0]?.message ?? "Row does not match the CSV contract",
        });
        continue;
      }

      const value = parsedRow.data;
      const topicId = topicBySlug.get(value.topic);
      if (!topicId) {
        errors.push({ row: index + 1, error: `Unknown topic "${value.topic}"` });
        continue;
      }

      // File the row's topic under its unit when the row names one.
      const unitId = resolveUnit(value.unit);
      if (unitId && (topicUnit.get(topicId) ?? null) !== unitId) {
        const { error: assignError } = await rls
          .from("topics")
          .update({ unit_id: unitId })
          .eq("id", topicId);
        if (!assignError) topicUnit.set(topicId, unitId);
      }

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

      const tags = (value.tags ?? "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .slice(0, 8);

      const release = value.answers_release_at ? new Date(value.answers_release_at) : null;

      const { error } = await rls.from("questions").insert({
        topic_id: topicId,
        zone: value.zone,
        difficulty: value.difficulty,
        type: value.type,
        stem_md: value.stem,
        options: toJson(options),
        answer_key: value.answer,
        explanation_md: value.explanation,
        marks: value.marks,
        source: "bank",
        status: "published",
        created_by: auth.ctx.userId,
        tags,
        ...(value.answers_hidden
          ? {
              answers_hidden: true,
              answers_release_at:
                release && !Number.isNaN(release.getTime()) ? release.toISOString() : null,
            }
          : {}),
      });

      if (error) {
        errors.push({ row: index + 1, error: error.message });
        continue;
      }
      inserted += 1;
    }

    return jsonOk({ inserted, errors });
  });
}
