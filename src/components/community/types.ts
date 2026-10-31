import type { Database, ExamZone } from "@/types/domain";

/**
 * Shared row aliases + lightweight join types for the community module.
 * Server pages fetch related rows separately (the typed client cannot embed
 * through undeclared relationships) and pass plain serializable objects here.
 */

export type DiscussionRow = Database["public"]["Tables"]["discussions"]["Row"];
export type DiscussionReplyRow = Database["public"]["Tables"]["discussion_replies"]["Row"];
export type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
export type ChatReportRow = Database["public"]["Tables"]["chat_reports"]["Row"];

/** Public profile slice used for author chips (profiles are public-read). */
export interface ProfileLite {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: Database["public"]["Tables"]["profiles"]["Row"]["role"];
}

/** Topic slice used for chips and filter selects. */
export interface TopicLite {
  id: string;
  zone: ExamZone;
  title: string;
  slug: string;
}

/** A discussion joined with its author and topic (client-facing shape). */
export interface ThreadSummary {
  discussion: DiscussionRow;
  author: ProfileLite | null;
  topic: TopicLite | null;
}

/** A reply joined with its author + verifier (client-facing shape). */
export interface ReplyView {
  reply: DiscussionReplyRow;
  author: ProfileLite | null;
  verifiedByName: string | null;
}

/** Extracts distinct @Mention tokens (without the @) from a piece of text. */
export function extractMentionTokens(text: string): string[] {
  const tokens = new Set<string>();
  const pattern = /@([A-Za-z][A-Za-z .'-]{0,80})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const trimmed = match[1].replace(/[\s.'-]+$/, "").trim();
    if (trimmed.length >= 2) tokens.add(trimmed);
    if (tokens.size >= 12) break; // bounded work per call
  }
  return [...tokens];
}
