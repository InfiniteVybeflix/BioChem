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
 */

const bodySchema = z.object({
  rows: z
    .array(z.unknown())
    .min(1, "Nothing to import")
    .max(500, "Import at most 500 rows at a time"),
});

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
    const { data: topicRows } = await rls.from("topics").select("id, slug");
    const topicBySlug = new Map((topicRows ?? []).map((row) => [row.slug, row.id]));

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
