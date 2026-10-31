import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { qualityFromUiRating, sm2Review } from "@/lib/sm2";

const reviewSchema = z.object({
  flashcardId: z.string().uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

/**
 * POST /api/flashcards/review — apply one SM-2 review to a flashcard.
 *
 * Loads the caller's existing `flashcard_reviews` row (if any), schedules the
 * next review with `sm2Review`, and upserts the row. XP is only awarded for
 * "good"/"easy" ratings so "again" cannot be farmed.
 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    const auth = await requireUser("take_assessments");
    if (!auth.ok) return auth.response;
    const { userId } = auth.ctx;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Invalid review payload", 400);
    const { flashcardId, rating } = parsed.data;

    // The card must exist and be visible to this user (RLS enforces this).
    const { data: card } = await supabase
      .from("flashcards")
      .select("id")
      .eq("id", flashcardId)
      .maybeSingle();
    if (!card) return jsonError("Flashcard not found", 404);

    const { data: previous } = await supabase
      .from("flashcard_reviews")
      .select("ease, interval_days, repetitions, lapses")
      .eq("user_id", userId)
      .eq("flashcard_id", flashcardId)
      .maybeSingle();

    const next = sm2Review(
      previous
        ? {
            ease: previous.ease,
            intervalDays: previous.interval_days,
            repetitions: previous.repetitions,
            lapses: previous.lapses,
          }
        : null,
      qualityFromUiRating(rating),
    );

    const { error } = await supabase.from("flashcard_reviews").upsert(
      {
        user_id: userId,
        flashcard_id: flashcardId,
        ease: next.ease,
        interval_days: next.intervalDays,
        repetitions: next.repetitions,
        lapses: next.lapses,
        due_date: next.dueDate,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flashcard_id" },
    );

    if (error) return jsonError("Could not save your review", 500);

    let xpAwarded = false;
    if (rating === "good" || rating === "easy") {
      try {
        await supabase.rpc("award_xp", { p_amount: 1, p_reason: "flashcard_reviewed" });
        xpAwarded = true;
      } catch (xpError) {
        console.error("[flashcards] award_xp failed", xpError);
      }
    }

    return jsonOk({
      flashcardId,
      rating,
      ease: next.ease,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      dueDate: next.dueDate,
      xpAwarded,
    });
  });
}
