import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/supabase/server";
import { can, type Capability } from "@/lib/rbac";
import { env } from "@/lib/env";
import type { Database, UserRole } from "@/types/domain";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Wraps a handler so unexpected errors become clean 500s without stack leaks. */
export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    console.error("[api]", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonError(message, 500);
  }
}

export interface AuthedContext {
  userId: string;
  profile: Profile;
  role: UserRole;
}

/**
 * Route-handler auth guard.
 * - `capability` (optional) enforces the RBAC matrix.
 */
export async function requireUser(
  capability?: Capability,
): Promise<{ ok: true; ctx: AuthedContext } | { ok: false; response: NextResponse }> {
  const auth = await getAuthContext();
  if (!auth) {
    return { ok: false, response: jsonError("Authentication required", 401) };
  }
  if (auth.profile.suspended) {
    return { ok: false, response: jsonError("Account suspended", 403) };
  }
  if (
    capability &&
    !can(auth.profile.role, capability, auth.profile.staff_abilities ?? [])
  ) {
    return { ok: false, response: jsonError("Insufficient permissions", 403) };
  }
  return {
    ok: true,
    ctx: { userId: auth.user.id, profile: auth.profile, role: auth.profile.role },
  };
}

/** Verifies the external cron bearer token on /api/cron/* routes. */
export function verifyCronAuth(request: Request): boolean {
  const secret = env.cronSecret();
  if (!secret) return false; // refuse when unconfigured — no open cron endpoints
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}
