import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The console assistant's tools — its hands and eyes on the platform.
 *
 * Every tool is REAL: it reads or writes the production database through the
 * service-role client, exactly like the console pages do. Tools are split
 * into:
 *   - "read"  — executed immediately while the assistant thinks (searching,
 *               counting, listing). No confirmation needed.
 *   - "write" — NEVER executed during the chat turn. They come back to the
 *               operator as proposals that must be approved in the UI, and
 *               even then they are re-validated here before touching anything.
 */

export type ToolKind = "read" | "write";

export interface ToolResult {
  ok: boolean;
  /** Compact, model-readable result payload (also shown in the activity log). */
  data: unknown;
  /** One-line summary for the operator's activity log. */
  summary: string;
}

export interface ToolDef {
  kind: ToolKind;
  /** What the assistant uses to decide when/how to call it. */
  description: string;
  schema: z.ZodTypeAny;
  /** Builds the operator-facing summary of a write BEFORE it is approved. */
  propose?: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const zoneEnum = z.enum(["cat1", "cat2", "main"]);
const statusEnum = z.enum(["draft", "pending", "published", "rejected", "archived"]);
const uuid = z.string().uuid();

const LIMIT = { limit: z.number().int().min(1).max(30).optional() } as const;

function clampLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(30, Math.max(1, Math.trunc(value))) : fallback;
}

function snippet(text: string | null | undefined, max = 110): string {
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ---------------------------------------------------------------------------
// READ tools
// ---------------------------------------------------------------------------

const platformStats: ToolDef = {
  kind: "read",
  description:
    "Overall platform snapshot: counts of schools, units, topics per zone, notes, questions, published/drafts, news articles, users and attempts.",
  schema: z.object({}).strict(),
  async run() {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const count = async (
      table: "schools" | "units" | "topics" | "notes" | "questions" | "news_articles" | "profiles" | "exam_attempts",
      filters?: Record<string, string>,
    ) => {
      let query = admin.from(table).select("id", { count: "exact", head: true });
      if (filters) {
        // The generated table types only accept literal columns — widen the
        // builder for this tiny counting helper.
        const flexible = query as unknown as {
          eq: (column: string, value: string) => typeof query;
        };
        for (const [key, value] of Object.entries(filters)) query = flexible.eq(key, value);
      }
      const { count: total } = await query;
      return total ?? 0;
    };
    const [
      schools,
      units,
      topicsCat1,
      topicsCat2,
      topicsMain,
      notesTotal,
      notesPublished,
      questionsTotal,
      questionsPublished,
      newsTotal,
      usersTotal,
      attemptsTotal,
    ] = await Promise.all([
      count("schools"),
      count("units"),
      count("topics", { zone: "cat1" }),
      count("topics", { zone: "cat2" }),
      count("topics", { zone: "main" }),
      count("notes"),
      count("notes", { status: "published" }),
      count("questions"),
      count("questions", { status: "published" }),
      count("news_articles"),
      count("profiles"),
      count("exam_attempts"),
    ]);
    return {
      ok: true,
      summary: "Platform snapshot",
      data: {
        schools,
        units,
        topics: { cat1: topicsCat1, cat2: topicsCat2, main: topicsMain },
        notes: { total: notesTotal, published: notesPublished },
        questions: { total: questionsTotal, published: questionsPublished },
        news_articles: newsTotal,
        users: usersTotal,
        exam_attempts: attemptsTotal,
      },
    };
  },
};

const searchTopicsSchema = z
  .object({ query: z.string().trim().max(120).optional(), zone: zoneEnum.optional(), ...LIMIT })
  .strict();

const searchTopics: ToolDef = {
  kind: "read",
  description:
    "Search topics by title/slug, optionally filtered by zone (cat1|cat2|main). Returns ids — always use these ids for any later change. Use this FIRST before proposing topic changes.",
  schema: searchTopicsSchema,
  async run(args) {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = searchTopicsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { query, zone, limit } = parsed.data;
    let query_ = admin
      .from("topics")
      .select("id, title, slug, zone, order_index, unit_id, units(code, name), notes(count), questions(count)")
      .limit(clampLimit(limit, 15));
    if (zone) query_ = query_.eq("zone", zone);
    if (query) query_ = query_.or(`title.ilike.%${query}%,slug.ilike.%${query}%`);
    const { data, error } = await query_.order("zone").order("order_index");
    if (error) return { ok: false, data: null, summary: `Search failed: ${error.message}` };
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      zone: row.zone,
      order: row.order_index,
      unit: (row.units as { code: string; name: string } | null)?.code ?? null,
      notes: (row.notes as { count: number }[] | null)?.[0]?.count ?? 0,
      questions: (row.questions as { count: number }[] | null)?.[0]?.count ?? 0,
    }));
    return {
      ok: true,
      summary: `Searched topics${query ? ` for “${query}”` : ""}${zone ? ` in ${zone}` : ""} — ${rows.length} found`,
      data: rows,
    };
  },
};

const searchNotesSchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    topic_id: uuid.optional(),
    status: statusEnum.optional(),
    ...LIMIT,
  })
  .strict();

const searchNotes: ToolDef = {
  kind: "read",
  description:
    "Search notes by title/summary text, optionally by topic_id and status. Returns note ids, their topic and status.",
  schema: searchNotesSchema,
  async run(args) {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = searchNotesSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { query, topic_id, status, limit } = parsed.data;
    let q = admin
      .from("notes")
      .select("id, title, summary, status, is_exam_critical, updated_at, topic_id, topics(title, zone)")
      .limit(clampLimit(limit, 12));
    if (topic_id) q = q.eq("topic_id", topic_id);
    if (status) q = q.eq("status", status);
    if (query) q = q.or(`title.ilike.%${query}%,summary.ilike.%${query}%`);
    const { data, error } = await q.order("updated_at", { ascending: false });
    if (error) return { ok: false, data: null, summary: `Search failed: ${error.message}` };
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      topic: (row.topics as { title: string } | null)?.title ?? null,
      topic_id: row.topic_id,
      status: row.status,
      exam_critical: row.is_exam_critical,
      updated_at: row.updated_at,
    }));
    return {
      ok: true,
      summary: `Searched notes${query ? ` for “${query}”` : ""} — ${rows.length} found`,
      data: rows,
    };
  },
};

const searchQuestionsSchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    topic_id: uuid.optional(),
    zone: zoneEnum.optional(),
    type: z.enum(["mcq", "short_answer", "long_answer", "structured"]).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    status: statusEnum.optional(),
    ...LIMIT,
  })
  .strict();

const searchQuestions: ToolDef = {
  kind: "read",
  description:
    "Search bank questions by stem text, optionally by topic_id, zone, type (mcq|short_answer|long_answer|structured), difficulty, status. Returns question ids.",
  schema: searchQuestionsSchema,
  async run(args) {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = searchQuestionsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { query, topic_id, zone, type, difficulty, status, limit } = parsed.data;
    let q = admin
      .from("questions")
      .select("id, stem_md, zone, type, difficulty, status, answers_hidden, topic_id, topics(title)")
      .limit(clampLimit(limit, 12));
    if (topic_id) q = q.eq("topic_id", topic_id);
    if (zone) q = q.eq("zone", zone);
    if (type) q = q.eq("type", type);
    if (difficulty) q = q.eq("difficulty", difficulty);
    if (status) q = q.eq("status", status);
    if (query) q = q.ilike("stem_md", `%${query}%`);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return { ok: false, data: null, summary: `Search failed: ${error.message}` };
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      stem: snippet(row.stem_md as string, 90),
      topic: (row.topics as { title: string } | null)?.title ?? null,
      topic_id: row.topic_id,
      zone: row.zone,
      type: row.type,
      difficulty: row.difficulty,
      status: row.status,
      answers_hidden: row.answers_hidden,
    }));
    return {
      ok: true,
      summary: `Searched questions${query ? ` for “${query}”` : ""} — ${rows.length} found`,
      data: rows,
    };
  },
};

const listUnits: ToolDef = {
  kind: "read",
  description: "List schools with their units (code, name, year) and how many topics sit under each unit.",
  schema: z.object({}).strict(),
  async run() {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const { data, error } = await admin
      .from("units")
      .select("id, code, name, year, school_id, schools(name, short_name), topics(count)")
      .order("school_id")
      .order("year")
      .order("code");
    if (error) return { ok: false, data: null, summary: `Load failed: ${error.message}` };
    const rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      year: row.year,
      school: (row.schools as { short_name: string; name: string } | null)?.short_name ?? null,
      topics: (row.topics as { count: number }[] | null)?.[0]?.count ?? 0,
    }));
    return { ok: true, summary: `Listed ${rows.length} units`, data: rows };
  },
};

const listUsersSchema = z
  .object({ query: z.string().trim().max(80).optional(), ...LIMIT })
  .strict();

const listUsers: ToolDef = {
  kind: "read",
  description:
    "Search user profiles by name (also matches role names like 'lecturer'). Returns ids, roles, XP, streak and suspension state.",
  schema: listUsersSchema,
  async run(args) {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = listUsersSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { query, limit } = parsed.data;
    let q = admin
      .from("profiles")
      .select("id, full_name, role, xp, streak_count, suspended, suspension_reason, created_at")
      .limit(clampLimit(limit, 10));
    if (query) q = q.ilike("full_name", `%${query}%`);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return { ok: false, data: null, summary: `Search failed: ${error.message}` };
    return {
      ok: true,
      summary: `Searched users${query ? ` for “${query}”` : ""} — ${(data ?? []).length} found`,
      data: data ?? [],
    };
  },
};

const listNewsSchema = z
  .object({ status: z.enum(["draft", "published"]).optional(), ...LIMIT })
  .strict();

const listNews: ToolDef = {
  kind: "read",
  description: "List news-desk articles, newest first, optionally filtered by status (draft|published).",
  schema: listNewsSchema,
  async run(args) {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = listNewsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { status, limit } = parsed.data;
    let q = admin
      .from("news_articles")
      .select("id, title, summary, category, status, pinned, auto, published_at, created_at")
      .limit(clampLimit(limit, 12));
    if (status) q = q.eq("status", status);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return { ok: false, data: null, summary: `Load failed: ${error.message}` };
    return {
      ok: true,
      summary: `Listed news${status ? ` (${status})` : ""} — ${(data ?? []).length} found`,
      data: data ?? [],
    };
  },
};

// ---------------------------------------------------------------------------
// WRITE tools — never executed inside the chat turn. Each returns a proposal
// the operator must approve; execution re-validates everything here.
// ---------------------------------------------------------------------------

const topicPatchSchema = z
  .object({
    zone: zoneEnum.optional(),
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    order_index: z.number().int().min(0).max(9_999).optional(),
    unit_id: uuid.nullable().optional(),
  })
  .strict();

async function applyTopicPatch(ids: string[], patch: Record<string, unknown>): Promise<ToolResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
  const validated = topicPatchSchema.safeParse(patch);
  if (!validated.success) {
    return { ok: false, data: null, summary: `Invalid patch: ${validated.error.issues[0]?.message}` };
  }
  if (Object.keys(validated.data).length === 0) {
    return { ok: false, data: null, summary: "The patch was empty — nothing to change" };
  }
  const { data, error } = await admin
    .from("topics")
    .update(validated.data)
    .in("id", ids)
    .select("id, title, zone");
  if (error) return { ok: false, data: null, summary: `Update failed: ${error.message}` };
  const rows = data ?? [];
  const changed =
    "zone" in validated.data
      ? `zone → ${String(validated.data.zone).toUpperCase()}`
      : Object.keys(validated.data).join(", ");
  return {
    ok: true,
    summary: `Updated ${rows.length} topic${rows.length === 1 ? "" : "s"} (${changed})`,
    data: rows,
  };
}

function describeTopics(ids: string[], patch: Record<string, unknown>): string {
  const bits: string[] = [];
  if (patch.zone !== undefined) bits.push(`move zone → ${String(patch.zone).toUpperCase()}`);
  if (patch.title !== undefined) bits.push(`rename to “${String(patch.title)}”`);
  if (patch.unit_id !== undefined) bits.push(patch.unit_id === null ? "detach from unit" : "re-file under a different unit");
  if (patch.order_index !== undefined) bits.push(`set order ${String(patch.order_index)}`);
  if (patch.description !== undefined) bits.push("update description");
  return `${bits.join(" + ")} — ${ids.length} topic${ids.length === 1 ? "" : "s"}`;
}

const updateTopicsSchema = z
  .object({ topic_ids: z.array(uuid).min(1).max(50), patch: topicPatchSchema })
  .strict();

const updateTopics: ToolDef = {
  kind: "write",
  description:
    "Change many topics at once with one patch: zone (cat1/cat2/main — e.g. move Main topics to CAT 1), title, description, order, or the unit they sit under.",
  schema: updateTopicsSchema,
  propose: (args) => {
    const ids = (args.topic_ids as string[]) ?? [];
    return describeTopics(ids, (args.patch as Record<string, unknown>) ?? {});
  },
  run: async (args) => {
    const parsed = updateTopicsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { topic_ids, patch } = parsed.data;
    return applyTopicPatch(topic_ids, patch);
  },
};

const createTopicSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    zone: zoneEnum,
    unit_id: uuid.optional(),
    description: z.string().trim().max(1_000).optional(),
  })
  .strict();

const createTopic: ToolDef = {
  kind: "write",
  description: "Create a new topic (title + zone required, optional unit and description). The slug is generated.",
  schema: createTopicSchema,
  propose: (args) =>
    `Create topic “${String(args.title ?? "")}” in ${String(args.zone ?? "").toUpperCase()} zone`,
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = createTopicSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const data = parsed.data;
    const slug = `${data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)}-${Date.now().toString(36)}`;
    const { data: row, error } = await admin
      .from("topics")
      .insert({
        title: data.title,
        zone: data.zone,
        slug,
        unit_id: data.unit_id ?? null,
        description: data.description ?? null,
      })
      .select("id, title, zone, slug")
      .single();
    if (error) return { ok: false, data: null, summary: `Create failed: ${error.message}` };
    return { ok: true, summary: `Created topic “${data.title}” (${data.zone})`, data: row };
  },
};

const notePatchSchema = z
  .object({
    status: statusEnum.optional(),
    topic_id: uuid.optional(),
    is_exam_critical: z.boolean().optional(),
  })
  .strict();

const updateNotesSchema = z
  .object({ note_ids: z.array(uuid).min(1).max(100), patch: notePatchSchema })
  .strict();

const updateNotes: ToolDef = {
  kind: "write",
  description:
    "Change many notes at once: publish/unpublish/archive (status), move them to another topic (topic_id), or toggle exam-critical flag.",
  schema: updateNotesSchema,
  propose: (args) => {
    const ids = (args.note_ids as string[]) ?? [];
    const patch = (args.patch as Record<string, unknown>) ?? {};
    const what =
      patch.status !== undefined
        ? `set status → ${String(patch.status)}`
        : patch.topic_id !== undefined
          ? "move to a different topic"
          : "toggle exam-critical";
    return `${what} — ${ids.length} note${ids.length === 1 ? "" : "s"}`;
  },
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = updateNotesSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { note_ids, patch } = parsed.data;
    const { data, error } = await admin
      .from("notes")
      .update(patch)
      .in("id", note_ids)
      .select("id, title, status");
    if (error) return { ok: false, data: null, summary: `Update failed: ${error.message}` };
    const rows = data ?? [];
    return {
      ok: true,
      summary: `Updated ${rows.length} note${rows.length === 1 ? "" : "s"}`,
      data: rows,
    };
  },
};

const questionPatchSchema = z
  .object({
    status: statusEnum.optional(),
    topic_id: uuid.optional(),
    zone: zoneEnum.optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    answers_hidden: z.boolean().optional(),
  })
  .strict();

const updateQuestionsSchema = z
  .object({ question_ids: z.array(uuid).min(1).max(100), patch: questionPatchSchema })
  .strict();

const updateQuestions: ToolDef = {
  kind: "write",
  description:
    "Change many questions at once: status (publish/unpublish/archive), topic, zone, difficulty, or hide/unhide answers (answers_hidden).",
  schema: updateQuestionsSchema,
  propose: (args) => {
    const ids = (args.question_ids as string[]) ?? [];
    const patch = (args.patch as Record<string, unknown>) ?? {};
    const what: string[] = [];
    if (patch.status !== undefined) what.push(`status → ${String(patch.status)}`);
    if (patch.topic_id !== undefined) what.push("move topic");
    if (patch.zone !== undefined) what.push(`zone → ${String(patch.zone).toUpperCase()}`);
    if (patch.difficulty !== undefined) what.push(`difficulty → ${String(patch.difficulty)}`);
    if (patch.answers_hidden !== undefined)
      what.push(patch.answers_hidden ? "hide answers" : "unhide answers");
    return `${what.join(" + ")} — ${ids.length} question${ids.length === 1 ? "" : "s"}`;
  },
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = updateQuestionsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { question_ids, patch } = parsed.data;
    const { data, error } = await admin
      .from("questions")
      .update(patch)
      .in("id", question_ids)
      .select("id");
    if (error) return { ok: false, data: null, summary: `Update failed: ${error.message}` };
    const rows = data ?? [];
    return {
      ok: true,
      summary: `Updated ${rows.length} question${rows.length === 1 ? "" : "s"}`,
      data: { count: rows.length },
    };
  },
};

const deleteContentSchema = z
  .object({ kind: z.enum(["notes", "questions"]), ids: z.array(uuid).min(1).max(100) })
  .strict();

const deleteContent: ToolDef = {
  kind: "write",
  description:
    "Permanently DELETE notes or questions by ids. Destructive and irreversible — only propose this when the operator explicitly asked for deletion.",
  schema: deleteContentSchema,
  propose: (args) => {
    const ids = (args.ids as string[]) ?? [];
    return `DELETE ${ids.length} ${String(args.kind ?? "item")} — permanent`;
  },
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = deleteContentSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { kind, ids } = parsed.data as { kind: "notes" | "questions"; ids: string[] };
    const { data, error } = await admin.from(kind).delete().in("id", ids).select("id");
    if (error) return { ok: false, data: null, summary: `Delete failed: ${error.message}` };
    const rows = data ?? [];
    return {
      ok: true,
      summary: `Deleted ${rows.length} ${kind === "notes" ? "note" : "question"}${rows.length === 1 ? "" : "s"}`,
      data: { count: rows.length },
    };
  },
};

const newsPatchSchema = z
  .object({
    status: z.enum(["draft", "published"]).optional(),
    pinned: z.boolean().optional(),
    title: z.string().trim().min(4).max(300).optional(),
    summary: z.string().trim().max(2_000).optional(),
  })
  .strict();

const updateNewsSchema = z.object({ article_id: uuid, patch: newsPatchSchema }).strict();

const updateNews: ToolDef = {
  kind: "write",
  description: "Change a news article: publish/unpublish, pin/unpin, retitle or re-summarise.",
  schema: updateNewsSchema,
  propose: (args) => {
    const patch = (args.patch as Record<string, unknown>) ?? {};
    const what: string[] = [];
    if (patch.status !== undefined) what.push(`${String(patch.status)}`);
    if (patch.pinned !== undefined) what.push(patch.pinned ? "pin" : "unpin");
    if (patch.title !== undefined) what.push("retitle");
    if (patch.summary !== undefined) what.push("edit summary");
    return `News article: ${what.join(" + ")}`;
  },
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = updateNewsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { article_id, patch } = parsed.data;
    const full = {
      ...patch,
      updated_at: new Date().toISOString(),
      ...(patch.status === "published" ? { published_at: new Date().toISOString() } : {}),
    };
    const { data, error } = await admin
      .from("news_articles")
      .update(full)
      .eq("id", article_id)
      .select("id, title, status, pinned")
      .single();
    if (error) return { ok: false, data: null, summary: `Update failed: ${error.message}` };
    return { ok: true, summary: `Updated article “${(data as { title: string }).title}”`, data };
  },
};

const createNewsSchema = z
  .object({
    title: z.string().trim().min(4).max(300),
    summary: z.string().trim().max(2_000).optional(),
    content_md: z.string().max(40_000).optional(),
    category: z.enum(["research", "exams", "campus", "jobs", "general"]).optional(),
    status: z.enum(["draft", "published"]).optional(),
  })
  .strict();

const createNews: ToolDef = {
  kind: "write",
  description: "Create a campus notice or news article (title, summary, markdown body, category, publish or keep as draft).",
  schema: createNewsSchema,
  propose: (args) => `Create ${String(args.status ?? "draft")} news article “${String(args.title ?? "")}”`,
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = createNewsSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const data = parsed.data as {
      title: string;
      summary?: string;
      content_md?: string;
      category?: string;
      status?: string;
    };
    const status = data.status ?? "draft";
    const { data: row, error } = await admin
      .from("news_articles")
      .insert({
        title: data.title,
        summary: data.summary ?? "",
        content_md: data.content_md ?? "",
        category: data.category ?? "general",
        status,
        pinned: false,
        auto: false,
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .select("id, title, status")
      .single();
    if (error) return { ok: false, data: null, summary: `Create failed: ${error.message}` };
    return { ok: true, summary: `Created news article “${data.title}”`, data: row };
  },
};

const userPatchSchema = z
  .object({
    suspended: z.boolean().optional(),
    suspension_reason: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

const updateUserSchema = z.object({ user_id: uuid, patch: userPatchSchema }).strict();

const updateUser: ToolDef = {
  kind: "write",
  description: "Suspend or reinstate a user account (with a reason). Use only when the operator asks for moderation.",
  schema: updateUserSchema,
  propose: (args) => {
    const patch = (args.patch as Record<string, unknown>) ?? {};
    return patch.suspended === true
      ? `Suspend user ${String(args.user_id).slice(0, 8)}… (${String(patch.suspension_reason ?? "no reason given")})`
      : "Reinstate user";
  },
  run: async (args) => {
    const admin = getSupabaseAdminClient();
    if (!admin) return { ok: false, data: null, summary: "Database unavailable" };
    const parsed = updateUserSchema.safeParse(args);
    if (!parsed.success) return { ok: false, data: null, summary: "Bad arguments" };
    const { user_id, patch } = parsed.data;
    const { data, error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", user_id)
      .select("id, full_name, suspended")
      .single();
    if (error) return { ok: false, data: null, summary: `Update failed: ${error.message}` };
    return { ok: true, summary: `Updated user ${(data as { full_name: string }).full_name}`, data };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOLS: Record<string, ToolDef> = {
  platform_stats: platformStats,
  search_topics: searchTopics,
  search_notes: searchNotes,
  search_questions: searchQuestions,
  list_units: listUnits,
  list_users: listUsers,
  list_news: listNews,
  update_topics: updateTopics,
  create_topic: createTopic,
  update_notes: updateNotes,
  update_questions: updateQuestions,
  delete_content: deleteContent,
  update_news: updateNews,
  create_news: createNews,
  update_user: updateUser,
};

export interface ProposalPayload {
  id: string;
  name: string;
  args: Record<string, unknown>;
  summary: string;
}

/** Validates a write tool call WITHOUT running it, returning a proposal. */
export function buildProposal(name: string, rawArgs: unknown): ProposalPayload | { error: string } {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool || tool.kind !== "write") return { error: `“${name}” is not a write tool` };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "invalid arguments" };
  }
  return {
    id: `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    args: parsed.data as Record<string, unknown>,
    summary: tool.propose
      ? tool.propose(parsed.data as Record<string, unknown>)
      : `${name} (${JSON.stringify(parsed.data).slice(0, 120)})`,
  };
}

/** Executes an APPROVED write action after full re-validation. */
export async function executeProposal(proposal: { name: string; args: unknown }): Promise<ToolResult> {
  const tool = ASSISTANT_TOOLS[proposal.name];
  if (!tool || tool.kind !== "write") {
    return { ok: false, data: null, summary: `“${proposal.name}” is not an executable write tool` };
  }
  const parsed = tool.schema.safeParse(proposal.args ?? {});
  if (!parsed.success) {
    return { ok: false, data: null, summary: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
  }
  return tool.run(parsed.data as Record<string, unknown>);
}

/** Compact catalog injected into the assistant's system prompt. */
export function toolCatalog(): string {
  return Object.entries(ASSISTANT_TOOLS)
    .map(([name, tool]) => `- ${name} (${tool.kind}): ${tool.description}`)
    .join("\n");
}
