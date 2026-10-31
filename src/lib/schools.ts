import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Academic-year helper. `sync_my_year()` is a SECURITY DEFINER RPC
 * executed with the *user's* client (it derives the caller from
 * auth.uid()) that (idempotently) moves the student up one year when
 * their school's year-advance date has passed, and bumps the
 * school's academic-year label exactly once. Failures are swallowed:
 * a hiccup here must never block someone from studying.
 */
export async function syncAcademicYear(): Promise<void> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return;
  try {
    await supabase.rpc("sync_my_year");
  } catch {
    // Idempotent and non-critical — ignore.
  }
}
