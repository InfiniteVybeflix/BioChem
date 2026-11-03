import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/domain";
import {
  directoryForRole,
  normalisePhrase,
  resolvePage,
  type SitePage,
} from "@/lib/ai/nova/directory";

/**
 * Nova's facts engine — the anti-hallucination core.
 *
 * Before the model is called, this module detects what the user is really
 * asking about and runs REAL database queries. The results are injected as
 * a `REAL PLATFORM DATA` block with strict grounding rules: Nova may only
 * state facts that appear in that block (or in grounded notes); if the
 * block has no match, she must say so instead of inventing.
 *
 * Every query here is scoped to the caller's identity or to published
 * content — identical to what the UI itself can read.
 */

type Db = SupabaseClient<Database>;

export interface FactQuery {
  message: string;
  role: string;
  userId: string;
  /** Extra titles (grounded notes) already in context — avoid duplicating. */
  groundedTitles?: string[];
}

export interface NovaAction {
  kind: "navigate" | "open_tab";
  path: string;
  title: string;
}

export interface FactsResult {
  /** Ordered system-context blocks; empty when nothing matched. */
  blocks: string[];
  /** Real pages this message explicitly asks Nova to open. */
  requestedPages: SitePage[];
  /** True when the message is ONLY a navigation command. */
  pureNavigation: boolean;
}

const ZONE_LABELS: Record<string, string> = {
  cat1: "CAT 1",
  cat2: "CAT 2",
  main: "Main exam",
};

/* ------------------------------------------------------------------ */
/* Intent detection                                                    */
/* ------------------------------------------------------------------ */

interface Intent {
  overview: boolean;
  topics: boolean;
  notes: boolean;
  progress: boolean;
  planner: boolean;
  mocks: boolean;
  flashcards: boolean;
  leaderboard: boolean;
  jobs: boolean;
}

const OVERVIEW_RE =
  /\b(whole platform|entire platform|platform snapshot|snapshot|overview of (the )?platform|what (is|on) (this|the) platform|what (can|does) .*(platform|do)|everything (on|about) (the )?platform|platform stats|site stats|what.s (on|available)|who (are|is) you|what can you do|your (abilities|capabilities|features|skills))\b/i;

const TOPICS_RE =
  /\b(topics?|units?|syllabus|curriculum|chapter|chapters|zone|zones|cat ?[12]|main exam|course outline|what topics)\b/i;

const NOTES_RE = /\b(notes?|reading|readings|article|material|materials|summar(y|ise|ize)|explain .*note)\b/i;

const PROGRESS_RE =
  /\b(my (progress|xp|points|streak|stats|rank|level|score|performance|attempts|history)|how am i doing|where do i stand|my standing)\b/i;

const PLANNER_RE =
  /\b(planner|schedule|timetable|study plan|my plan|planned|today.s plan|week plan|calendar|events)\b/i;

const MOCKS_RE = /\b(mocks?|mock exams?|past papers?|attempt|attempts|exam history)\b/i;

const FLASHCARDS_RE =
  /\b(flash ?cards?|deck|decks|due cards|reviews?|spaced repetition|srs)\b/i;

const LEADERBOARD_RE = /\b(leaderboard|rank(ing|s)?|top \d+|best students|ladder)\b/i;

const JOBS_RE = /\b(jobs?|internships?|job board|careers?|vacanc|hiring)\b/i;

export function detectIntent(message: string): Intent {
  const m = normalisePhrase(message);
  return {
    overview: OVERVIEW_RE.test(message) || OVERVIEW_RE.test(m),
    topics: TOPICS_RE.test(message) || TOPICS_RE.test(m),
    notes: NOTES_RE.test(message) || NOTES_RE.test(m),
    progress: PROGRESS_RE.test(message) || PROGRESS_RE.test(m),
    planner: PLANNER_RE.test(message) || PLANNER_RE.test(m),
    mocks: MOCKS_RE.test(message) || MOCKS_RE.test(m),
    flashcards: FLASHCARDS_RE.test(message) || FLASHCARDS_RE.test(m),
    leaderboard: LEADERBOARD_RE.test(message) || LEADERBOARD_RE.test(m),
    jobs: JOBS_RE.test(message) || JOBS_RE.test(m),
  };
}

/* ------------------------------------------------------------------ */
/* Navigation command extraction                                       */
/* ------------------------------------------------------------------ */

const NAV_COMMAND_RE =
  /\b(?:open|go to|goto|take me to|navigate to|show me|bring up|launch|start|jump to|switch to|go back to)\s+(?:the\s+|my\s+)?([a-z0-9' -]{2,40}?)\s*[.!]?$/i;

/** Short, command-like messages that are purely navigation. */
const PURE_NAV_MAX_LENGTH = 60;

export interface NavigationMatch {
  pages: SitePage[];
  /** True when the message is ONLY a navigation command (no question). */
  pure: boolean;
}

/**
 * Lightweight navigation detection — no database queries. Used by the chat
 * route before the turn engine so direct commands answer instantly.
 */
export function detectNavigation(message: string, pages: SitePage[]): NavigationMatch {
  return extractNavigationTargets(message, pages);
}

function extractNavigationTargets(
  message: string,
  pages: SitePage[],
): NavigationMatch {
  const trimmed = message.trim();
  const match = trimmed.match(NAV_COMMAND_RE);
  if (!match) return { pages: [], pure: false };

  const target = match[1].trim();
  const page = resolvePhrase(target, pages);
  if (!page) return { pages: [], pure: false };

  // Pure navigation: "open the mock zone" — short, nothing else asked.
  const pure =
    trimmed.length <= PURE_NAV_MAX_LENGTH &&
    !/\b(what|why|how|when|who|explain|tell me about|and|also|then|\?)\b/i.test(trimmed);

  return { pages: [page], pure };
}

function resolvePhrase(phrase: string, pages: SitePage[]): SitePage | null {
  return resolvePage(phrase, pages);
}

/* ------------------------------------------------------------------ */
/* Real database queries                                               */
/* ------------------------------------------------------------------ */

async function overviewBlock(db: Db, role: string): Promise<string | null> {
  const [topics, notes, questions, exams, mocks, flashcards, discussions, jobs, announcements] =
    await Promise.all([
      db.from("topics").select("id", { count: "exact", head: true }),
      db.from("notes").select("id", { count: "exact", head: true }).eq("status", "published"),
      db.from("questions").select("id", { count: "exact", head: true }).eq("status", "published"),
      db.from("exams").select("id", { count: "exact", head: true }).eq("published", true),
      db
        .from("exams")
        .select("id", { count: "exact", head: true })
        .eq("published", true)
        .eq("is_past_paper", false),
      db
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("status", "published"),
      db.from("discussions").select("id", { count: "exact", head: true }),
      db
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["approved", "closed"]),
      db
        .from("announcements")
        .select("title, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const lines = [
    `- Exam zones: 3 (CAT 1, CAT 2, Main)`,
    `- Topics: ${topics.count ?? 0}`,
    `- Published notes: ${notes.count ?? 0}`,
    `- Published practice questions: ${questions.count ?? 0}`,
    `- Published exams: ${exams.count ?? 0} (mock exams: ${mocks.count ?? 0})`,
    `- Flashcards: ${flashcards.count ?? 0}`,
    `- Community discussions: ${discussions.count ?? 0}`,
    `- Published job listings: ${jobs.count ?? 0}`,
  ];

  const notesRows = await db
    .from("notes")
    .select("title, slug, summary")
    .eq("status", "published")
    .order("views", { ascending: false })
    .limit(5);
  if (notesRows.data && notesRows.data.length > 0) {
    lines.push(
      `- Most-read notes: ${notesRows.data.map((n) => `"${n.title}"`).join(", ")}`,
    );
  }

  const topicRows = await db
    .from("topics")
    .select("title, zone, slug")
    .order("order_index", { ascending: true })
    .limit(12);
  if (topicRows.data && topicRows.data.length > 0) {
    lines.push(
      `- Sample topics: ${topicRows.data
        .map((t) => `"${t.title}" (${ZONE_LABELS[t.zone] ?? t.zone})`)
        .join(", ")}`,
    );
  }

  if (announcements.data && announcements.data.length > 0) {
    lines.push(
      `- Latest announcements: ${announcements.data
        .map((a) => `"${a.title}" (${new Date(a.created_at).toLocaleDateString("en-GB")})`)
        .join(", ")}`,
    );
  }

  const pages = directoryForRole(role);
  lines.push(
    `- Pages the student can visit: ${pages.map((p) => `${p.title} (${p.path})`).join(", ")}`,
  );

  return [
    "## REAL PLATFORM DATA — platform overview",
    "Live counts queried from the production database right now. Use exactly these numbers; never estimate or invent others.",
    ...lines,
  ].join("\n");
}

async function topicsBlock(db: Db, message: string): Promise<string | null> {
  // Pull the full topic tree (small table) and match in JS — this stays
  // correct for word-order variants that SQL ilike misses.
  const { data } = await db
    .from("topics")
    .select("title, zone, slug, description, parent_id")
    .order("zone", { ascending: true })
    .order("order_index", { ascending: true })
    .limit(400);
  if (!data || data.length === 0) {
    return [
      "## REAL PLATFORM DATA — topics",
      "The topics table returned ZERO rows. The platform currently has no topics in the database. Say exactly that — do NOT invent topic names, unit codes or syllabi.",
    ].join("\n");
  }

  const words = message.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const stop = new Set([
    "the", "and", "for", "are", "what", "which", "with", "this", "that", "have",
    "has", "how", "does", "did", "can", "you", "your", "list", "all", "about",
    "there", "from", "topic", "topics", "unit", "units", "syllabus", "give",
    "show", "tell", "please", "zone", "zones", "cat", "main", "exam", "course",
  ]);
  const keywords = words.filter((w) => !stop.has(w));

  const scored = data
    .map((topic) => {
      const title = topic.title.toLowerCase();
      let score = 0;
      for (const word of keywords) if (title.includes(word)) score += 2;
      if ((topic.description ?? "").toLowerCase().includes(message.toLowerCase().slice(0, 40)))
        score += 1;
      return { topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  if (keywords.length === 0) {
    // Generic "what topics are there" — list all, grouped by zone.
    const grouped = new Map<string, string[]>();
    for (const topic of data) {
      const zone = ZONE_LABELS[topic.zone] ?? topic.zone;
      grouped.set(zone, [...(grouped.get(zone) ?? []), topic.title]);
    }
    const lines = [...grouped.entries()].map(
      ([zone, titles]) => `- ${zone}: ${titles.join(", ")}`,
    );
    return [
      "## REAL PLATFORM DATA — all topics",
      "These are the ONLY topics that exist in the database. Do not add any topic that is not in this list.",
      ...lines,
    ].join("\n");
  }

  if (scored.length === 0) {
    return [
      "## REAL PLATFORM DATA — topic match",
      `The student asked about topics matching: ${keywords.join(", ")}. NO topic in the database matches. The real topics are: ${data.map((t) => t.title).join(", ")}. Tell the student no match was found and list the closest real topics instead.`,
    ].join("\n");
  }

  return [
    "## REAL PLATFORM DATA — matched topics",
    "Only these database rows matched the student's question. If the topic they meant is not here, say it does not exist on the platform.",
    ...scored.map(
      ({ topic }) =>
        `- "${topic.title}" — zone ${ZONE_LABELS[topic.zone] ?? topic.zone}${
          topic.description ? `: ${topic.description.slice(0, 160)}` : ""
        }`,
    ),
  ].join("\n");
}

async function notesBlock(db: Db, message: string, groundedTitles: string[]): Promise<string | null> {
  const words = message.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const stop = new Set([
    "what", "which", "where", "notes", "note", "about", "tell", "show", "give",
    "there", "have", "does", "summary", "summarise", "summarize", "explain",
    "please", "reading", "read",
  ]);
  const keywords = words.filter((w) => !stop.has(w)).slice(0, 6);
  if (keywords.length === 0) return null;

  // Real full-text search over the generated tsvector column.
  const query = keywords.join(" | ");
  const { data, error } = await db
    .from("notes")
    .select("title, slug, summary, views")
    .eq("status", "published")
    .textSearch("search", query, { type: "websearch", config: "english" })
    .limit(8);

  if (error || !data) {
    return [
      "## REAL PLATFORM DATA — notes search",
      "The notes search failed. Tell the student the search is temporarily unavailable; do not guess note titles.",
    ].join("\n");
  }

  const relevant = data.filter((note) => !groundedTitles.includes(note.title));

  if (relevant.length === 0) {
    return [
      "## REAL PLATFORM DATA — notes search",
      `Full-text search for "${query}" returned NO published notes. Say that no published note matches — never fabricate note titles.`,
    ].join("\n");
  }

  return [
    "## REAL PLATFORM DATA — matching published notes",
    "Real rows from the notes table (you may cite these titles and summaries).",
    ...relevant.map(
      (note) =>
        `- "${note.title}"${note.summary ? ` — ${note.summary.slice(0, 200)}` : ""} (open: /notes/${note.slug})`,
    ),
  ].join("\n");
}

async function progressBlock(db: Db, userId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const [profile, due, attempts, rank] = await Promise.all([
    db.from("profiles").select("full_name, xp, streak_count, longest_streak").eq("id", userId).maybeSingle(),
    db
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_date", today),
    db.from("exam_attempts").select("score, max_score, created_at, zone, mode").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    db.from("profiles").select("id, xp", { count: "exact" }).gt("xp", 0).order("xp", { ascending: false }),
  ]);

  const lines: string[] = [];
  if (profile.data) {
    lines.push(
      `- Name: ${profile.data.full_name}; XP: ${profile.data.xp}; current streak: ${profile.data.streak_count} days (longest ${profile.data.longest_streak})`,
    );
    if (rank.count != null && rank.data) {
      const position = rank.data.findIndex((row) => row.id === userId) + 1;
      lines.push(`- Leaderboard: ${position > 0 ? `#${position}` : "unranked"} of ${rank.count} students with XP`);
    }
  }
  lines.push(`- Flashcards currently due for review: ${due.count ?? 0}`);

  if (attempts.data && attempts.data.length > 0) {
    lines.push(
      `- Recent exam attempts: ${attempts.data
        .map(
          (a) =>
            `${a.score}/${a.max_score} (${a.mode}, ${(ZONE_LABELS[a.zone] ?? a.zone).toLowerCase()}, ${new Date(a.created_at).toLocaleDateString("en-GB")})`,
        )
        .join(", ")}`,
    );
  } else {
    lines.push("- Recent exam attempts: none yet");
  }

  return [
    "## REAL PLATFORM DATA — the student's own progress",
    "Live database values for THIS student. Quote them exactly.",
    ...lines,
  ].join("\n");
}

async function plannerBlock(db: Db, userId: string): Promise<string | null> {
  const [events, plans] = await Promise.all([
    db
      .from("plan_events")
      .select("title, type, day_of_week, date, start_time, end_time, completed")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(12),
    db.from("study_plans").select("title, active, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3),
  ]);

  const lines: string[] = [];
  if (events.data && events.data.length > 0) {
    lines.push(
      `- Scheduled events: ${events.data
        .map((e) => {
          const when =
            e.date != null
              ? e.date
              : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][e.day_of_week ?? 0] ?? "weekly";
          return `${e.title} (${e.type}, ${when} ${e.start_time}–${e.end_time}${e.completed ? ", done" : ""})`;
        })
        .join("; ")}`,
    );
  } else {
    lines.push("- Scheduled events: none — the planner is empty");
  }
  if (plans.data && plans.data.length > 0) {
    lines.push(`- Study plans: ${plans.data.map((p) => `"${p.title}"${p.active ? " (active)" : ""}`).join(", ")}`);
  }

  return [
    "## REAL PLATFORM DATA — the student's planner",
    "Live rows from their planner. Do not invent events or dates.",
    ...lines,
  ].join("\n");
}

async function mocksBlock(db: Db, userId: string, message: string): Promise<string | null> {
  const wantsPapers = /\bpast (papers?|exams?)\b/i.test(message);
  const [published, attempts] = await Promise.all([
    db
      .from("exams")
      .select("title, zone, duration_minutes, total_marks, is_past_paper")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(10),
    db
      .from("exam_attempts")
      .select("score, max_score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const rows = (published.data ?? []).filter((exam) =>
    wantsPapers ? exam.is_past_paper : !exam.is_past_paper,
  );

  const lines = [
    rows.length > 0
      ? `- Real ${wantsPapers ? "past papers" : "mock exams"} in the database: ${rows
          .map((e) => `"${e.title}" (${ZONE_LABELS[e.zone] ?? e.zone}, ${e.duration_minutes} min, ${e.total_marks} marks)`)
          .join(", ")}`
      : `- There are currently NO published ${wantsPapers ? "past papers" : "mock exams"} in the database. Say so plainly.`,
    attempts.data && attempts.data.length > 0
      ? `- The student's recent attempts: ${attempts.data
          .map((a) => `${a.score}/${a.max_score}`)
          .join(", ")}`
      : "- The student has no attempts yet",
  ];

  return [
    `## REAL PLATFORM DATA — ${wantsPapers ? "past papers" : "mock exams"}`,
    "Live database rows. Never invent exam titles, durations or marks.",
    ...lines,
  ].join("\n");
}

async function flashcardsBlock(db: Db, userId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const [total, due, reviewed] = await Promise.all([
    db
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    db
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_date", today),
    db
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  return [
    "## REAL PLATFORM DATA — flashcards",
    ...[
      `- Published flashcards on the platform: ${total.count ?? 0}`,
      `- Cards in the student's review schedule: ${reviewed.count ?? 0}`,
      `- Due for review right now: ${due.count ?? 0}`,
    ],
  ].join("\n");
}

async function leaderboardBlock(db: Db): Promise<string | null> {
  const { data } = await db
    .from("profiles")
    .select("full_name, xp, streak_count")
    .gt("xp", 0)
    .order("xp", { ascending: false })
    .limit(10);
  if (!data || data.length === 0) {
    return [
      "## REAL PLATFORM DATA — leaderboard",
      "No students have XP yet — the leaderboard is empty. Say exactly that.",
    ].join("\n");
  }
  return [
    "## REAL PLATFORM DATA — top 10 leaderboard (live)",
    ...data.map((row, index) => `- #${index + 1} ${row.full_name}: ${row.xp} XP (streak ${row.streak_count})`),
  ].join("\n");
}

async function jobsBlock(db: Db): Promise<string | null> {
  const { data } = await db
    .from("jobs")
    .select("title, org, location, type, closes_at")
    .in("status", ["approved", "closed"])
    .order("created_at", { ascending: false })
    .limit(8);
  if (!data || data.length === 0) {
    return [
      "## REAL PLATFORM DATA — jobs",
      "No published job listings right now. Say so — do not invent openings.",
    ].join("\n");
  }
  return [
    "## REAL PLATFORM DATA — published job listings (live)",
    ...data.map((job) => {
      const closing = job.closes_at ? `, closes ${new Date(job.closes_at).toLocaleDateString("en-GB")}` : "";
      return `- "${job.title}" at ${job.org} (${job.type}, ${job.location}${closing})`;
    }),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function collectFacts(db: Db, query: FactQuery): Promise<FactsResult> {
  const pages = directoryForRole(query.role);
  const { pages: navPages, pure } = extractNavigationTargets(query.message, pages);

  const intent = detectIntent(query.message);
  const blocks: string[] = [];

  const run = async (key: keyof Intent, task: () => Promise<string | null>) => {
    if (!intent[key]) return;
    try {
      const block = await task();
      if (block) blocks.push(block);
    } catch {
      // A failing fact query must never break the chat — Nova will simply
      // answer from grounded notes and general knowledge, honestly.
    }
  };

  await run("overview", () => overviewBlock(db, query.role));
  await run("topics", () => topicsBlock(db, query.message));
  await run("notes", () =>
    notesBlock(db, query.message, query.groundedTitles ?? []),
  );
  await run("progress", () => progressBlock(db, query.userId));
  await run("planner", () => plannerBlock(db, query.userId));
  await run("mocks", () => mocksBlock(db, query.userId, query.message));
  await run("flashcards", () => flashcardsBlock(db, query.userId));
  await run("leaderboard", () => leaderboardBlock(db));
  await run("jobs", () => jobsBlock(db));

  return { blocks, requestedPages: navPages, pureNavigation: pure && blocks.length === 0 };
}
