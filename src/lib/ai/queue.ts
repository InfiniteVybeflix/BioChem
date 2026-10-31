import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AiTask } from "@/lib/ai/models";
import type { Database } from "@/types/domain";
import { toJson } from "@/types/domain";

/**
 * Durable AI fallback queue.
 *
 * When the Aevibron gateway is unreachable (after retries), the request is
 * parked in `ai_queue` instead of failing the user's request. A processor
 * endpoint (`/api/ai/queue/process`, driven by external cron) drains the
 * queue with exponential backoff. Processors are registered by task name.
 */

export type QueuePayload = Record<string, unknown>;
export type QueueRow = Database["public"]["Tables"]["ai_queue"]["Row"];

export async function enqueueAiTask(
  task: AiTask,
  payload: QueuePayload,
  userId: string | null,
): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("ai_queue")
    .insert({ task, payload: toJson(payload), user_id: userId, status: "pending" })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

/** Claims due pending items (marks them processing) and returns them. */
export async function claimDueQueueItems(limit = 10): Promise<QueueRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) return [];

  const { data: due } = await admin
    .from("ai_queue")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  if (!due || due.length === 0) return [];

  const ids = due.map((row) => row.id);
  const { data: claimed } = await admin
    .from("ai_queue")
    .update({ status: "processing" })
    .in("id", ids)
    .eq("status", "pending") // claim guard against concurrent processors
    .select("*");

  return claimed ?? [];
}

/** Marks an item done. */
export async function completeQueueItem(id: string, result: QueuePayload): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  await admin
    .from("ai_queue")
    .update({ status: "done", result: toJson(result), processed_at: new Date().toISOString() })
    .eq("id", id);
}

/** Schedules the next retry or marks the item dead after max attempts. */
export async function failQueueItem(row: QueueRow, error: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const attempts = row.attempts + 1;
  if (attempts >= row.max_attempts) {
    await admin
      .from("ai_queue")
      .update({
        status: "dead",
        attempts,
        last_error: error,
        processed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return;
  }

  // Exponential backoff: 1min, 2min, 4min, 8min…
  const nextAttempt = new Date(Date.now() + 60_000 * 2 ** attempts).toISOString();
  await admin
    .from("ai_queue")
    .update({
      status: "pending",
      attempts,
      last_error: error,
      next_attempt_at: nextAttempt,
    })
    .eq("id", row.id);
}
