/**
 * Nova's site directory — the single source of truth for every page she can
 * open. Each entry mirrors a REAL route in `src/app` (verified against the
 * app router), so a validated action can never 404.
 */

export interface SitePage {
  /** Real app-router path (no trailing slash). */
  path: string;
  /** Human name shown in chips and toasts. */
  title: string;
  /** One-line description injected into the model's directory context. */
  description: string;
  /** Strings that a direct "open X" command may match against. */
  aliases: string[];
  /** Student-facing only — lecturer/console routes are excluded from chips. */
  student: boolean;
}

export const SITE_DIRECTORY: SitePage[] = [
  {
    path: "/dashboard",
    title: "Dashboard",
    description: "Your home base: XP, streak, quick stats and shortcuts.",
    aliases: ["home", "dashboard", "overview", "start"],
    student: true,
  },
  {
    path: "/zones",
    title: "Exam Zones",
    description: "All exam zones (CAT 1, CAT 2, Main) with their topic trees.",
    aliases: ["zones", "exam zones", "zone", "cat", "cats", "units"],
    student: true,
  },
  {
    path: "/explore",
    title: "Explore Notes",
    description: "Browse and search every published note by topic.",
    aliases: ["explore", "notes", "browse notes", "library", "read"],
    student: true,
  },
  {
    path: "/outcomes",
    title: "Outcomes Checklist",
    description: "Tick off learning outcomes and watch your coverage grow.",
    aliases: ["outcomes", "checklist", "learning outcomes", "objectives"],
    student: true,
  },
  {
    path: "/questions",
    title: "Question Bank",
    description: "Practice questions by topic and difficulty, with explanations.",
    aliases: ["questions", "question bank", "practice questions", "practice", "quiz"],
    student: true,
  },
  {
    path: "/past-papers",
    title: "Past Papers",
    description: "Real past exam papers with worked solutions.",
    aliases: ["past papers", "papers", "past exam", "past exams"],
    student: true,
  },
  {
    path: "/mocks",
    title: "Mock Exams",
    description: "Timed full mock exams with instant grading and history.",
    aliases: ["mocks", "mock", "mock exam", "mock exams", "exam simulation", "timed test"],
    student: true,
  },
  {
    path: "/flashcards",
    title: "Flashcards",
    description: "Spaced-repetition flashcards; AI can auto-build decks from notes.",
    aliases: ["flashcards", "flash cards", "cards", "deck", "decks", "revision cards"],
    student: true,
  },
  {
    path: "/ai/tutor",
    title: "Nova (AI Tutor)",
    description: "This chat — grounded biochemistry help, powered by real platform data.",
    aliases: ["nova", "tutor", "ai tutor", "chat", "ai"],
    student: true,
  },
  {
    path: "/ai/practice",
    title: "AI Practice",
    description: "Generate practice runs on any topic with instant feedback.",
    aliases: ["ai practice", "practice run", "ai quiz", "generate questions"],
    student: true,
  },
  {
    path: "/ai/daily",
    title: "Question of the Day",
    description: "Your daily AI-generated questions, tuned to your settings.",
    aliases: ["daily", "question of the day", "daily questions", "qotd", "today's question"],
    student: true,
  },
  {
    path: "/planner",
    title: "Study Planner",
    description: "Weekly study schedule with reminders and completion tracking.",
    aliases: ["planner", "schedule", "study plan", "timetable", "calendar", "plan"],
    student: true,
  },
  {
    path: "/community",
    title: "Discussions",
    description: "Ask and answer with other students; upvote the best replies.",
    aliases: ["community", "discussions", "forum", "discussion"],
    student: true,
  },
  {
    path: "/messages",
    title: "Messages",
    description: "Private, end-to-end encrypted direct messages.",
    aliases: ["messages", "inbox", "dm", "dms", "chat with friends"],
    student: true,
  },
  {
    path: "/leaderboard",
    title: "Leaderboard",
    description: "See where your XP ranks across the whole platform.",
    aliases: ["leaderboard", "ranking", "rank", "top students", "ladder"],
    student: true,
  },
  {
    path: "/jobs",
    title: "Job Board",
    description: "Internships and graduate roles relevant to biochemistry.",
    aliases: ["jobs", "job board", "internships", "internship", "careers"],
    student: true,
  },
  {
    path: "/submit",
    title: "Contribute",
    description: "Submit your own notes or questions for lecturer review.",
    aliases: ["submit", "contribute", "share notes", "upload notes"],
    student: true,
  },
  {
    path: "/notifications",
    title: "Notifications",
    description: "Everything you missed: replies, announcements, reminders.",
    aliases: ["notifications", "alerts", "notices"],
    student: true,
  },
  {
    path: "/settings",
    title: "Settings",
    description: "Profile, appearance, notification and account preferences.",
    aliases: ["settings", "preferences", "profile", "account"],
    student: true,
  },
  {
    path: "/support",
    title: "Support",
    description: "Get help from the platform team — bugs, access, feedback.",
    aliases: ["support", "help", "help desk", "contact"],
    student: true,
  },
];

/** Pages Nova may open for the current user (students never see staff routes). */
export function directoryForRole(role: string): SitePage[] {
  const pages = SITE_DIRECTORY.filter((page) => page.student);
  if (role === "lecturer" || role === "admin") {
    pages.push({
      path: "/lecturer",
      title: "Lecturer Panel",
      description: "Review contributions, publish notes, manage classes and mocks.",
      aliases: ["lecturer", "lecturer panel", "teaching panel"],
      student: false,
    });
  }
  return pages;
}

/** Normalises a user-typed phrase for alias matching. */
export function normalisePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[!?.,;:"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a page from free text. Matches the directory path exactly,
 * then titles, then aliases as whole words (longest alias first, so
 * "mock exams" wins over "mock" — and "admin" can never match "dm").
 */
export function resolvePage(phrase: string, pages: SitePage[]): SitePage | null {
  const needle = normalisePhrase(phrase).replace(/^\/+/, "");
  if (needle.length === 0) return null;

  const direct = pages.find((page) => page.path.slice(1) === needle);
  if (direct) return direct;

  for (const page of pages) {
    if (normalisePhrase(page.title) === needle) return page;
  }

  const aliases: { alias: string; page: SitePage }[] = [];
  for (const page of pages) {
    for (const alias of page.aliases) aliases.push({ alias, page });
  }
  aliases.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, page } of aliases) {
    if (needle === alias) return page;
    if (needle.length > alias.length + 3) {
      const pattern = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      if (pattern.test(needle)) return page;
    }
  }
  return null;
}
