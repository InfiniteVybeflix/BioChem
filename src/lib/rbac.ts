import type { Database, UserRole } from "@/types/domain";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/** Capability keys — mirrors the BioChem roles & permissions matrix. */
export type Capability =
  | "browse_public_content" // public notes + questions browsing
  | "take_assessments" // mocks, outcomes, flashcards
  | "submit_content" // submissions queue (pending review)
  | "publish_content" // direct publish + bulk upload
  | "approve_submissions" // moderation queue
  | "manage_users" // roles, suspend
  | "manage_ads" // ads/sponsored toggle, feature flags
  | "broadcast" // platform-wide announcements
  | "post_jobs" // job board posting
  | "enquire_jobs" // student enquiries only
  | "view_own_analytics"
  | "view_class_analytics"
  | "view_platform_analytics"
  | "verify_answers" // lecturer-verified answer badges
  | "moderate_chat";

const ROLE_CAPABILITIES: Record<UserRole | "guest", readonly Capability[]> = {
  guest: ["browse_public_content"],
  student: [
    "browse_public_content",
    "take_assessments",
    "submit_content",
    "enquire_jobs",
    "view_own_analytics",
  ],
  lecturer: [
    "browse_public_content",
    "take_assessments",
    "submit_content",
    "publish_content",
    "post_jobs",
    "view_own_analytics",
    "view_class_analytics",
    "verify_answers",
    "moderate_chat",
    "broadcast",
  ],
  admin: [
    "browse_public_content",
    "take_assessments",
    "submit_content",
    "publish_content",
    "approve_submissions",
    "manage_users",
    "manage_ads",
    "broadcast",
    "post_jobs",
    "enquire_jobs",
    "view_own_analytics",
    "view_class_analytics",
    "view_platform_analytics",
    "verify_answers",
    "moderate_chat",
  ],
};

export function can(
  role: UserRole | "guest" | null | undefined,
  capability: Capability,
  abilities?: readonly string[] | null,
): boolean {
  if (abilities && abilities.includes(capability)) return true;
  if (!role) return ROLE_CAPABILITIES.guest.includes(capability);
  return ROLE_CAPABILITIES[role].includes(capability);
}

/**
 * Capabilities the operations console may grant to individual students
 * (e.g. a class rep) without changing their role. "Class rep" maps to
 * moderating chat + broadcasting to their class; "assistant lecturer"
 * grants the full lecturer set.
 */
export const GRANTABLE_ABILITIES = [
  "publish_content",
  "post_jobs",
  "view_class_analytics",
  "verify_answers",
  "moderate_chat",
  "broadcast",
] as const satisfies readonly Capability[];

export type GrantableAbility = (typeof GRANTABLE_ABILITIES)[number];

export const ABILITY_LABELS: Record<GrantableAbility, string> = {
  publish_content: "Publish content directly",
  post_jobs: "Post jobs & internships",
  view_class_analytics: "View class analytics",
  verify_answers: "Verify answers",
  moderate_chat: "Moderate community chat",
  broadcast: "Send announcements",
};

/** Handy presets for the console ability editor. */
export const ABILITY_PRESETS: { id: string; label: string; abilities: Capability[] }[] = [
  {
    id: "class_rep",
    label: "Class rep",
    abilities: ["moderate_chat", "broadcast"],
  },
  {
    id: "verifier",
    label: "Answer verifier",
    abilities: ["verify_answers"],
  },
  {
    id: "assistant_lecturer",
    label: "Assistant lecturer",
    abilities: [...GRANTABLE_ABILITIES],
  },
];

export function roleOf(profile: Profile | null | undefined): UserRole | "guest" {
  if (!profile) return "guest";
  return profile.role;
}

/** Route prefixes that require more than a student role. */
export const STAFF_ROUTE_PREFIXES = ["/lecturer"];
export const ADMIN_ROUTE_PREFIXES = ["/admin"];
