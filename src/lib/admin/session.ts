import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

/**
 * Operations-console session security.
 *
 * The console has exactly one operator, defined by environment
 * variables only (ADMIN_EMAIL / ADMIN_PASSWORD) — there is no admin
 * account in the database, no admin role in the app, and no
 * fallback credential. The browser URL is an obscure path from
 * ADMIN_ROUTE_PATH; /admin does not exist.
 *
 * Sessions are stateless: an HMAC-SHA256-signed expiry timestamp in
 * an HttpOnly cookie. Verification is constant-time.
 */

const COOKIE_NAME = "bc_ops_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function adminConfigured(): boolean {
  return Boolean(
    env.adminRoutePath() && env.adminEmail() && env.adminPassword() && env.adminSessionSecret(),
  );
}

/** Base path (no trailing slash) the operator types in the browser. */
export function adminBasePath(): string {
  return `/${(env.adminRoutePath() ?? "").replace(/^\/+|\/+$/g, "")}`;
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", env.adminSessionSecret() ?? "")
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    // Compare against self to keep constant time, then fail.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function createSessionToken(): { token: string; maxAgeSeconds: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `ops.${expiresAt}`;
  return { token: `${payload}.${sign(payload)}`, maxAgeSeconds: SESSION_TTL_MS / 1000 };
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token || !env.adminSessionSecret()) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [, expiresAt, signature] = parts;
  const payload = `ops.${expiresAt}`;
  if (!safeEqual(signature, sign(payload))) return false;
  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------

export async function startAdminSession(): Promise<void> {
  const { token, maxAgeSeconds } = createSessionToken();
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

/**
 * Guard for console API routes: valid session AND same-origin request.
 * Returns a 401/403 Response when the caller must be rejected.
 */
export async function requireAdminApi(): Promise<Response | null> {
  if (!(await hasAdminSession())) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) {
    const host = headerList.get("host");
    try {
      if (new URL(origin).host !== host) {
        return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Login (constant-time credential check + best-effort lockout)
// ---------------------------------------------------------------------------

const attempts = new Map<string, { count: number; lockedUntil: number }>();

function attemptKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

export function isLockedOut(email: string, ip: string): boolean {
  const entry = attempts.get(attemptKey(email, ip));
  return Boolean(entry && entry.lockedUntil > Date.now());
}

export function adminLoginAttemptsRemaining(email: string, ip: string): number {
  const entry = attempts.get(attemptKey(email, ip));
  if (!entry || entry.lockedUntil > Date.now()) return entry ? 0 : MAX_LOGIN_ATTEMPTS;
  return Math.max(0, MAX_LOGIN_ATTEMPTS - entry.count);
}

export function checkAdminCredentials(
  email: string,
  password: string,
  ip: string,
): { ok: true } | { ok: false; remaining: number } {
  if (isLockedOut(email, ip)) {
    return { ok: false, remaining: 0 };
  }

  const expectedEmail = env.adminEmail() ?? "";
  const expectedPassword = env.adminPassword() ?? "";

  // Constant-time comparison of both factors.
  const emailOk = safeEqual(email.trim().toLowerCase(), expectedEmail.trim().toLowerCase());
  const passwordOk = safeEqual(password, expectedPassword);

  if (emailOk && passwordOk) {
    attempts.delete(attemptKey(email, ip));
    return { ok: true };
  }

  const key = attemptKey(email, ip);
  const entry = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(key, entry);
  return { ok: false, remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - entry.count) };
}
