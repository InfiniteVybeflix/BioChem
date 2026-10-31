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

export function can(role: UserRole | "guest" | null | undefined, capability: Capability): boolean {
  if (!role) return ROLE_CAPABILITIES.guest.includes(capability);
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function roleOf(profile: Profile | null | undefined): UserRole | "guest" {
  if (!profile) return "guest";
  return profile.role;
}

/** Route prefixes that require more than a student role. */
export const STAFF_ROUTE_PREFIXES = ["/lecturer"];
export const ADMIN_ROUTE_PREFIXES = ["/admin"];
