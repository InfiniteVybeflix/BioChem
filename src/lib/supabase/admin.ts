import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/domain";
import { env } from "@/lib/env";

/**
 * Service-role client. SERVER ONLY — never import from a client component.
 * Bypasses RLS; every call site must have performed its own role check.
 * Returns `null` when the service key is absent (unconfigured deployment).
 */
export function getSupabaseAdminClient() {
  const url = env.supabaseUrl;
  const key = env.serviceRoleKey();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
