import { RATE_LIMITS, type AiTask } from "@/lib/ai/models";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/domain";

/**
 * DB-backed sliding-window rate limiter (one ai_usage row per call).
 * Survives serverless cold starts — no external Redis needed.
 */

type DbClient = SupabaseClient<Database>;

/**
 * Checks and consumes one unit of hourly quota for `task`.
 * `client` must be the caller's RLS-scoped Supabase client so usage
 * is attributable to the authenticated user.
 */
export async function consumeRateLimit(
  client: DbClient,
  userId: string,
  task: AiTask,
): Promise<{ allowed: true; remaining: number } | { allowed: false; retryAfterMinutes: number }> {
  const limit = RATE_LIMITS[task];
  const since = new Date(Date.now() - 3_600_000).toISOString();

  const { count, error } = await client
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("task", task)
    .gte("created_at", since);

  if (error) throw new Error(`Rate limit check failed: ${error.message}`);

  const used = count ?? 0;
  if (used >= limit) {
    return { allowed: false, retryAfterMinutes: 60 };
  }

  const { error: insertError } = await client.from("ai_usage").insert({
    user_id: userId,
    task,
    model: "pending",
    status: "ok",
  });
  if (insertError) throw new Error(`Rate limit insert failed: ${insertError.message}`);

  return { allowed: true, remaining: limit - used - 1 };
}

/** Fills in the outcome of a gateway call on its placeholder usage row. */
export async function recordAiUsage(
  userId: string | null,
  task: AiTask,
  model: string,
  status: "ok" | "queued" | "failed",
  latencyMs?: number,
): Promise<void> {
  if (!userId) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  // Update the most recent placeholder row for this user + task.
  const { data: rows } = await admin
    .from("ai_usage")
    .select("id")
    .eq("user_id", userId)
    .eq("task", task)
    .eq("model", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  const rowId = rows?.[0]?.id;
  if (!rowId) return;

  await admin
    .from("ai_usage")
    .update({
      model,
      status,
      ...(latencyMs !== undefined ? { latency_ms: latencyMs } : {}),
    })
    .eq("id", rowId);
}
