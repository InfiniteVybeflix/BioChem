import type { NextResponse } from "next/server";
import { unzipSync } from "fflate";
import matter from "gray-matter";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { frontmatterSchema, questionFileSchema, slugify } from "@/lib/content/schema";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/content/bulk — staff bulk upload (publish_content).
 * Accepts multipart form-data with a `file` field (.zip ≤ 10MB). Inside the
 * archive every `*.md` becomes a published note (YAML frontmatter validated
 * with frontmatterSchema) and every `*.json` (except package.json) a batch of
 * published bank questions (questionFileSchema). Malformed files become error
 * entries in the report — they never fail the whole request. All inserts go
 * through the RLS-scoped server client.
 */

const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 200;

export interface BulkReportItem {
  file: string;
  kind: "note" | "question" | "other";
  inserted: number;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("publish_content");
    if (!auth.ok) return auth.response;

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return jsonError("Attach a .zip archive under the 'file' field", 400);
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return jsonError("Only .zip archives are supported", 400);
    }
    if (file.size > MAX_ZIP_BYTES) {
      return jsonError("That zip is larger than 10MB", 400);
    }

    const rls = await getSupabaseServerClient();
    if (!rls) return jsonError("Service temporarily unavailable", 503);

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return jsonError("That file could not be unzipped — is it a valid zip archive?", 400);
    }

    const names = Object.keys(entries).filter((name) => !name.endsWith("/"));
    const capped = names.slice(0, MAX_ENTRIES);

    // Topic slug → id map, built once.
    const { data: topicRows } = await rls.from("topics").select("id, slug");
    const topicBySlug = new Map((topicRows ?? []).map((row) => [row.slug, row.id]));

    const decoder = new TextDecoder();
    const report: BulkReportItem[] = [];
    let notesInserted = 0;
    let questionsInserted = 0;

    for (const name of capped) {
      const lower = name.toLowerCase();
      if (lower.endsWith(".md")) {
        try {
          const parsed = matter(decoder.decode(entries[name]));
          const fm = frontmatterSchema.safeParse(parsed.data);
          if (!fm.success) {
            report.push({
              file: name,
              kind: "note",
              inserted: 0,
              error: `Invalid frontmatter: ${fm.error.issues[0]?.message ?? "schema mismatch"}`,
            });
            continue;
          }
          const topicId = topicBySlug.get(fm.data.topic);
          if (!topicId) {
            report.push({
              file: name,
              kind: "note",
              inserted: 0,
              error: `Unknown topic "${fm.data.topic}"`,
            });
            continue;
          }
          const { error } = await rls.from("notes").insert({
            topic_id: topicId,
            title: fm.data.title,
            slug: `${slugify(fm.data.title)}-${Date.now().toString(36)}`,
            summary: fm.data.summary ?? null,
            content_md: parsed.content,
            status: "published",
            is_exam_critical: fm.data.examCritical,
            contributed_by: null,
            published_by: auth.ctx.userId,
            published_at: new Date().toISOString(),
            reading_minutes: fm.data.readingMinutes,
            tags: fm.data.tags,
          });
          if (error) {
            report.push({ file: name, kind: "note", inserted: 0, error: error.message });
            continue;
          }
          notesInserted += 1;
          report.push({ file: name, kind: "note", inserted: 1 });
        } catch (err) {
          report.push({
            file: name,
            kind: "note",
            inserted: 0,
            error: err instanceof Error ? err.message : "Could not parse the file",
          });
        }
      } else if (lower.endsWith(".json") && !lower.endsWith("package.json")) {
        try {
          const raw: unknown = JSON.parse(decoder.decode(entries[name]));
          const parsedFile = questionFileSchema.safeParse(raw);
          if (!parsedFile.success) {
            report.push({
              file: name,
              kind: "question",
              inserted: 0,
              error: `Invalid question file: ${parsedFile.error.issues[0]?.message ?? "schema mismatch"}`,
            });
            continue;
          }
          const topicId = topicBySlug.get(parsedFile.data.topic);
          if (!topicId) {
            report.push({
              file: name,
              kind: "question",
              inserted: 0,
              error: `Unknown topic "${parsedFile.data.topic}"`,
            });
            continue;
          }
          const rows = parsedFile.data.questions.map((question) => ({
            topic_id: topicId,
            zone: parsedFile.data.zone,
            difficulty: parsedFile.data.difficulty,
            type: parsedFile.data.type,
            stem_md: question.stem,
            options: question.options,
            answer_key: question.answer,
            explanation_md: question.explanation,
            marks: question.marks,
            source: "bank",
            status: "published" as const,
            created_by: auth.ctx.userId,
            tags: question.tags,
          }));
          const { error } = await rls.from("questions").insert(rows);
          if (error) {
            report.push({ file: name, kind: "question", inserted: 0, error: error.message });
            continue;
          }
          questionsInserted += rows.length;
          report.push({ file: name, kind: "question", inserted: rows.length });
        } catch (err) {
          report.push({
            file: name,
            kind: "question",
            inserted: 0,
            error: err instanceof Error ? err.message : "Could not parse the file",
          });
        }
      }
    }

    if (names.length > MAX_ENTRIES) {
      report.push({
        file: `${names.length - MAX_ENTRIES} further entries`,
        kind: "other",
        inserted: 0,
        error: `Zip contained ${names.length} entries — only the first ${MAX_ENTRIES} were processed`,
      });
    }

    return jsonOk({
      report,
      notes: notesInserted,
      questions: questionsInserted,
      errors: report.filter((item) => item.error).length,
    });
  });
}
