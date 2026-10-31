import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/domain";
import { env } from "@/lib/env";

/**
 * Supabase client bound to the current request cookies (server components,
 * server actions and route handlers). Returns `null` when the app has not
 * been configured yet so pages can render a setup state.
 */
export async function getSupabaseServerClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component — middleware refreshes sessions.
        }
      },
    },
  });
}

export type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;

/** Returns the authenticated user + profile, or null. */
export async function getAuthContext() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The school embed rides along — dashboards greet with school + year.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, schools(id, name, short_name, current_academic_year, max_years)")
    .eq("id", user.id)
    .single();

  if (!profile || profile.suspended) return null;

  return { user, profile, supabase };
}
