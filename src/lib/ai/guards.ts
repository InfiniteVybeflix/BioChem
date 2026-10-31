import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { jsonError } from "@/lib/api";
import type { Capability } from "@/lib/rbac";
import type { AiTask } from "@/lib/ai/models";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseServerClient, type SupabaseServerClient } from "@/lib/supabase/server";

/** Feature flags that gate AI features (public read via RLS). */
export type AiFeatureFlag = "ai_tutor" | "question_of_the_day" | "auto_flashcards" | "ai_assistant";

const FLAG_DISABLED_MESSAGE: Record<AiFeatureFlag, string> = {
  ai_tutor: "The AI tutor is temporarily disabled",
  question_of_the_day: "Question of the Day is temporarily disabled",
  ai_assistant: "The AI assistant is temporarily disabled",
  auto_flashcards: "AI flashcard generation is temporarily disabled",
};

export interface AiRouteGuard {
  ok: true;
  supabase: SupabaseServerClient;
  userId: string;
}

/**
 * Shared guard chain for AI route handlers:
 * authenticated user (RBAC capability) → feature flag enabled → gateway
 * configured → hourly rate limit consumed.
 *
 * The flag and gateway checks run BEFORE the rate limit so a disabled or
 * unconfigured feature never burns a user's quota or writes junk rows.
 */
export async function requireAiAccess(options: {
  flag: AiFeatureFlag;
  task: AiTask;
  capability?: Capability;
}): Promise<AiRouteGuard | { ok: false; response: NextResponse }> {
  const auth = await requireUser(options.capability);
  if (!auth.ok) return auth;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return { ok: false, response: jsonError("Service temporarily unavailable", 503) };
  }

  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", options.flag)
    .maybeSingle();
  // Missing flag rows default to enabled (the seed migration enables them).
  if (flag && flag.enabled === false) {
    return { ok: false, response: jsonError(FLAG_DISABLED_MESSAGE[options.flag], 403) };
  }

  if (!gatewayConfigured()) {
    return {
      ok: false,
      response: jsonError("Aevibron gateway is not configured on this deployment", 503),
    };
  }

  const rate = await consumeRateLimit(supabase, auth.ctx.userId, options.task);
  if (!rate.allowed) {
    return {
      ok: false,
      response: jsonError("Rate limit exceeded — try again later", 429, {
        retryAfterMinutes: rate.retryAfterMinutes,
      }),
    };
  }

  return { ok: true, supabase, userId: auth.ctx.userId };
}
