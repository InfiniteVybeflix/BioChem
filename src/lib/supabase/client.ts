"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/domain";
import { env } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Supabase client for browser components.
 * Returns `null` when Supabase env vars are not configured so the UI can
 * render a setup notice instead of crashing at module load.
 */
export function getSupabaseBrowserClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return browserClient;
}

export type SupabaseBrowserClient = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;
