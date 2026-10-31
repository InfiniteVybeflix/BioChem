/** XP award rules — mirrored by award_xp() on the Postgres side. */
export const XP_RULES = {
  daily_active: 2,
  outcome_mastered: 3,
  mock_submitted: 10,
  daily_question_correct: 1,
  flashcard_reviewed: 1,
  note_published: 25,
  submission_approved: 25,
  reply_verified: 15,
  discussion_created: 2,
} as const;

export type XpReason = keyof typeof XP_RULES;

export function xpFor(reason: XpReason): number {
  return XP_RULES[reason];
}
