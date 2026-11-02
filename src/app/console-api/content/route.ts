import { z } from "zod";
import type { Database } from "@/types/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { dbErrorResponse } from "@/lib/admin/api-errors";
import type { QuestionOption } from "@/types/domain";
import { questionOptions, toJson } from "@/types/domain";

/**
 * Console content library — edit / move / delete anything that has
 * already been imported. The importers create notes, questions and
 * (optionally) topics at speed; this is the place where a wrong copy
 * is put right: fix a title, retype an answer, move a batch of rows
 * from the wrongly-picked topic to the right one, unpublish, or
 * delete outright.
 *
 *   GET  ?kind=notes|questions & q & topic & unit & zone & status & page
 *        → { rows, total, page, pageSize }
 *   POST { action: "update_note",    id, …fields }
 *   POST { action: "update_question", id, …fields }
 *   POST { action: "delete",       kind, id }
 *   POST { action: "bulk_delete",  kind, ids }
 *   POST { action: "bulk_move",    kind, ids, topicId }
 *
 * Every write goes through the service-role client behind the admin
 * session, the same as the other console endpoints.
 */

const PAGE_SIZE = 20;

const kindSchema = z.enum(["notes", "questions"]);
const zoneSchema = z.enum(["cat1", "cat2", "main"]);
const difficultySchema = z.enum(["easy", "medium", "hard"]);
const statusSchema = z.enum(["draft", "pending", "published", "rejected", "archived"]);
const typeSchema = z.enum(["mcq", "short_answer", "long_answer", "structured"]);

const optionSchema = z.object({
  key: z.string().trim().min(1).max(4),
  text: z.string().trim().min(1, "Option text cannot be empty").max(600),
});

const updateNoteSchema = z.object({
  action: z.literal("update_note"),
  id: z.string().uuid(),
  title: z.string().trim().min(2, "Title needs at least 2 characters").max(200).optional(),
  summary: z.string().max(600).optional(),
  contentMd: z.string().trim().min(1, "The note body cannot be empty").optional(),
  topicId: z.string().uuid("Pick the topic this note belongs to").optional(),
  status: statusSchema.optional(),
  isExamCritical: z.boolean().optional(),
  readingMinutes: z.coerce.number().int().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const updateQuestionSchema = z.object({
  action: z.literal("update_question"),
  id: z.string().uuid(),
  topicId: z.string().uuid().nullable().optional(),
  zone: zoneSchema.optional(),
  difficulty: difficultySchema.optional(),
  type: typeSchema.optional(),
  marks: z.coerce.number().int().min(1).max(30).optional(),
  stemMd: z.string().trim().min(1, "The question stem cannot be empty").optional(),
  options: z.array(optionSchema).max(8).optional(),
  answerKey: z.string().trim().min(1, "The answer cannot be empty").max(2000).optional(),
  explanationMd: z.string().trim().max(8000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  answersHidden: z.boolean().optional(),
  answersReleaseAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: statusSchema.optional(),
});

const deleteSchema = z.object({
  action: z.literal("delete"),
  kind: kindSchema,
  id: z.string().uuid(),
});

const bulkDeleteSchema = z.object({
  action: z.literal("bulk_delete"),
  kind: kindSchema,
  ids: z.array(z.string().uuid()).min(1, "Select at least one item").max(200),
});

const bulkMoveSchema = z.object({
  action: z.literal("bulk_move"),
  kind: kindSchema,
  ids: z.array(z.string().uuid()).min(1, "Select at least one item").max(200),
  topicId: z.string().uuid("Pick the topic to move the items into"),
});

const postSchema = z.discriminatedUnion("action", [
  updateNoteSchema,
  updateQuestionSchema,
  deleteSchema,
  bulkDeleteSchema,
  bulkMoveSchema,
]);

export interface ContentListRow {
  id: string;
  kind: "notes" | "questions";
  title: string; // note title / question stem (truncated client-side)
  preview: string; // note summary+body head / question explanation head
  topicId: string | null;
  topicTitle: string | null;
  topicSlug: string | null;
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
  zone: string | null;
  difficulty: string | null;
  type: string | null;
  marks: number | null;
  status: string;
  answersHidden: boolean;
  answersReleaseAt: string | null;
  isExamCritical: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Common filter + pagination tail shared by both list queries. */
interface ListParams {
  q?: string;
  topic?: string;
  unit?: string;
  zone?: "cat1" | "cat2" | "main";
  status?: "draft" | "pending" | "published" | "rejected" | "archived";
  page: number;
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/** Topic ids for a unit filter (empty array → the unit has no topics). */
async function unitTopicIds(admin: Admin, unitId: string): Promise<string[]> {
  const { data } = await admin.from("topics").select("id").eq("unit_id", unitId);
  return (data ?? []).map((row) => row.id as string);
}

const NO_TOPIC = "00000000-0000-0000-0000-000000000000";

function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}

function searchEscaped(q: string | undefined): string {
  return (q ?? "").replace(/[%,()]/g, " ").trim();
}

function normaliseRow(
  kind: "notes" | "questions",
  row: Record<string, unknown>,
): ContentListRow {
  const topic = (row.topics ?? null) as {
    title?: string;
    slug?: string;
    unit_id?: string | null;
    units?: { code?: string; name?: string } | null;
  } | null;
  const isNote = kind === "notes";
  return {
    id: String(row.id),
    kind,
    title: String((isNote ? row.title : row.stem_md) ?? ""),
    preview: String(
      (isNote ? `${row.summary ?? ""} ${row.content_md ?? ""}` : row.explanation_md ?? "") ?? "",
    ).slice(0, 400),
    topicId: row.topic_id ? String(row.topic_id) : null,
    topicTitle: topic?.title ?? null,
    topicSlug: topic?.slug ?? null,
    unitId: topic?.unit_id ?? null,
    unitCode: topic?.units?.code ?? null,
    unitName: topic?.units?.name ?? null,
    zone: isNote ? null : String(row.zone ?? ""),
    difficulty: isNote ? null : String(row.difficulty ?? ""),
    type: isNote ? null : String(row.type ?? ""),
    marks: isNote ? null : Number(row.marks ?? 1),
    status: String(row.status ?? ""),
    answersHidden: isNote ? false : Boolean(row.answers_hidden),
    answersReleaseAt: isNote ? null : ((row.answers_release_at as string | null) ?? null),
    isExamCritical: isNote ? Boolean(row.is_exam_critical) : false,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function listNotes(
  admin: Admin,
  params: ListParams,
): Promise<{ rows?: ContentListRow[]; total?: number; error?: { message: string } }> {
  const { from, to } = pageRange(params.page);
  let query = admin
    .from("notes")
    .select(
      "id, title, summary, content_md, topic_id, topics(title, slug, unit_id, units(code, name)), status, is_exam_critical, tags, created_at, updated_at",
      { count: "exact" },
    );
  const q = searchEscaped(params.q);
  if (q) {
    query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,content_md.ilike.%${q}%`);
  }
  if (params.topic) query = query.eq("topic_id", params.topic);
  if (params.status) query = query.eq("status", params.status);
  if (params.unit) {
    const ids = await unitTopicIds(admin, params.unit);
    query = ids.length > 0 ? query.in("topic_id", ids) : query.eq("topic_id", NO_TOPIC);
  }
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) return { error: { message: error.message } };
  const rows = (data ?? []).map((raw) =>
    normaliseRow("notes", raw as Record<string, unknown>),
  );
  return { rows, total: count ?? rows.length };
}

async function listQuestions(
  admin: Admin,
  params: ListParams,
): Promise<{ rows?: ContentListRow[]; total?: number; error?: { message: string } }> {
  const { from, to } = pageRange(params.page);
  let query = admin
    .from("questions")
    .select(
      "id, stem_md, explanation_md, topic_id, topics(title, slug, unit_id, units(code, name)), zone, difficulty, type, marks, status, answers_hidden, answers_release_at, tags, created_at, updated_at",
      { count: "exact" },
    );
  const q = searchEscaped(params.q);
  if (q) {
    query = query.or(`stem_md.ilike.%${q}%,explanation_md.ilike.%${q}%`);
  }
  if (params.topic) query = query.eq("topic_id", params.topic);
  if (params.zone) query = query.eq("zone", params.zone);
  if (params.status) query = query.eq("status", params.status);
  if (params.unit) {
    const ids = await unitTopicIds(admin, params.unit);
    query = ids.length > 0 ? query.in("topic_id", ids) : query.eq("topic_id", NO_TOPIC);
  }
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) return { error: { message: error.message } };
  const rows = (data ?? []).map((raw) =>
    normaliseRow("questions", raw as Record<string, unknown>),
  );
  return { rows, total: count ?? rows.length };
}

async function listRows(
  admin: Admin,
  kind: "notes" | "questions",
  params: ListParams,
) {
  return kind === "notes" ? listNotes(admin, params) : listQuestions(admin, params);
}

/** Full editable fields for one row (the edit dialog loads this). */
interface NoteDetail {
  kind: "notes";
  id: string;
  title: string;
  summary: string;
  contentMd: string;
  topicId: string | null;
  status: string;
  isExamCritical: boolean;
  readingMinutes: number;
  tags: string[];
}

interface QuestionDetail {
  kind: "questions";
  id: string;
  topicId: string | null;
  zone: string;
  difficulty: string;
  type: string;
  marks: number;
  stemMd: string;
  options: { key: string; text: string }[];
  answerKey: string;
  explanationMd: string;
  tags: string[];
  answersHidden: boolean;
  answersReleaseAt: string | null;
  status: string;
}

async function loadDetail(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  kind: "notes" | "questions",
  id: string,
): Promise<NoteDetail | QuestionDetail | null> {
  if (kind === "notes") {
    const { data } = await admin
      .from("notes")
      .select("id, title, summary, content_md, topic_id, status, is_exam_critical, reading_minutes, tags")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      kind,
      id: String(row.id),
      title: String(row.title ?? ""),
      summary: String(row.summary ?? ""),
      contentMd: String(row.content_md ?? ""),
      topicId: row.topic_id ? String(row.topic_id) : null,
      status: String(row.status ?? "published"),
      isExamCritical: Boolean(row.is_exam_critical),
      readingMinutes: Number(row.reading_minutes ?? 5),
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    };
  }
  const { data } = await admin
    .from("questions")
    .select(
      "id, topic_id, zone, difficulty, type, marks, stem_md, options, answer_key, explanation_md, tags, answers_hidden, answers_release_at, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    kind,
    id: String(row.id),
    topicId: row.topic_id ? String(row.topic_id) : null,
    zone: String(row.zone ?? "main"),
    difficulty: String(row.difficulty ?? "medium"),
    type: String(row.type ?? "mcq"),
    marks: Number(row.marks ?? 1),
    stemMd: String(row.stem_md ?? ""),
    options: questionOptions(row.options),
    answerKey: String(row.answer_key ?? ""),
    explanationMd: String(row.explanation_md ?? ""),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    answersHidden: Boolean(row.answers_hidden),
    answersReleaseAt: (row.answers_release_at as string | null) ?? null,
    status: String(row.status ?? "published"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const url = new URL(request.url);
  const singleId = url.searchParams.get("id");
  const singleKind = url.searchParams.get("kind");
  if (singleId && (singleKind === "notes" || singleKind === "questions")) {
    if (!z.string().uuid().safeParse(singleId).success) {
      return Response.json({ error: "Invalid id" }, { status: 422 });
    }
    const detail = await loadDetail(admin, singleKind, singleId);
    if (!detail) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ detail });
  }
  const parsed = z
    .object({
      kind: kindSchema,
      q: z.string().max(120).optional(),
      topic: z.string().uuid().optional(),
      unit: z.string().uuid().optional(),
      zone: zoneSchema.optional(),
      status: statusSchema.optional(),
      page: z.coerce.number().int().min(1).max(500).default(1),
    })
    .safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 422 },
    );
  }

  const result = await listRows(admin, parsed.data.kind, parsed.data);
  if ("error" in result) {
    return dbErrorResponse("load the content list", result.error);
  }
  return Response.json({
    rows: result.rows,
    total: result.total,
    page: parsed.data.page,
    pageSize: PAGE_SIZE,
  });
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "update_note") {
    const patch: Database["public"]["Tables"]["notes"]["Update"] = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.summary !== undefined) {
      patch.summary = body.summary.trim() ? body.summary.trim() : "";
    }
    if (body.contentMd !== undefined) patch.content_md = body.contentMd;
    if (body.topicId !== undefined) patch.topic_id = body.topicId;
    if (body.status !== undefined) patch.status = body.status;
    if (body.isExamCritical !== undefined) patch.is_exam_critical = body.isExamCritical;
    if (body.readingMinutes !== undefined) patch.reading_minutes = body.readingMinutes;
    if (body.tags !== undefined) patch.tags = body.tags.map((tag) => tag.toLowerCase());
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { error } = await admin.from("notes").update(patch).eq("id", body.id);
    if (error) return dbErrorResponse("update the note", error);
    return Response.json({ ok: true });
  }

  if (body.action === "update_question") {
    const patch: Database["public"]["Tables"]["questions"]["Update"] = {};
    if (body.topicId !== undefined) patch.topic_id = body.topicId;
    if (body.zone !== undefined) patch.zone = body.zone;
    if (body.difficulty !== undefined) patch.difficulty = body.difficulty;
    if (body.type !== undefined) patch.type = body.type;
    if (body.marks !== undefined) patch.marks = body.marks;
    if (body.stemMd !== undefined) patch.stem_md = body.stemMd;
    if (body.options !== undefined) patch.options = toJson(body.options as QuestionOption[]);
    if (body.answerKey !== undefined) patch.answer_key = body.answerKey;
    if (body.explanationMd !== undefined) patch.explanation_md = body.explanationMd;
    if (body.tags !== undefined) patch.tags = body.tags.map((tag) => tag.toLowerCase());
    if (body.answersHidden !== undefined) patch.answers_hidden = body.answersHidden;
    if (body.answersReleaseAt !== undefined) patch.answers_release_at = body.answersReleaseAt;
    if (body.status !== undefined) patch.status = body.status;
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "Nothing to update" }, { status: 422 });
    }

    const { error } = await admin.from("questions").update(patch).eq("id", body.id);
    if (error) return dbErrorResponse("update the question", error);
    return Response.json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await admin.from(body.kind).delete().eq("id", body.id);
    if (error) {
      return dbErrorResponse(
        `delete the ${body.kind === "notes" ? "note" : "question"}`,
        error,
      );
    }
    return Response.json({ ok: true });
  }

  if (body.action === "bulk_delete") {
    const { error } = await admin.from(body.kind).delete().in("id", body.ids);
    if (error) return dbErrorResponse("delete the selected items", error);
    return Response.json({ ok: true, deleted: body.ids.length });
  }

  // bulk_move — re-home wrongly-imported rows to the correct topic.
  const { error } = await admin
    .from(body.kind)
    .update({ topic_id: body.topicId })
    .in("id", body.ids);
  if (error) return dbErrorResponse("move the selected items", error);
  return Response.json({ ok: true, moved: body.ids.length });
}
