import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Auth & routing edge proxy (Next 16 middleware convention).
 *
 * 1. Refreshes the session cookie on every request.
 * 2. Guards protected routes (redirect to /login with ?next=).
 * 3. Operations console routing — the console is served from an
 *    obscure path taken from ADMIN_ROUTE_PATH (e.g. /panel-x7k2m).
 *    The internal paths /console and /console-api answer 404 to
 *    direct requests, /admin never exists, and answers carry
 *    noindex headers so the console can never leak into search.
 */

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/reset",
  "/explore",
  "/about",
  "/support",
  "/offline",
  "/share-target",
];

const PUBLIC_PREFIXES = [
  "/auth",
  "/icons",
  "/manifest.webmanifest",
  "/sw.js",
  "/api/cron",
  "/api/ai/status",
  "/api/support",
];

/** Internal prefixes that must only ever be reached via rewrite. */
const INTERNAL_PREFIXES = ["/console", "/console-api"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  // Published notes are readable without an account (guest browsing).
  if (pathname.startsWith("/notes/")) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function notFound(): NextResponse {
  // Empty 404 — no HTML, no hints that anything ever existed here.
  return new NextResponse(null, { status: 404 });
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ---------- operations console: obscure external path ----------
  const adminPath = process.env.ADMIN_ROUTE_PATH?.replace(/^\/+|\/+$/g, "");
  const adminPrefix = adminPath ? `/${adminPath}` : null;

  // The old /admin route must never exist, whatever the config.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin")
  ) {
    return notFound();
  }

  // Internal console paths are only reachable through the rewrite.
  if (
    INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return notFound();
  }

  if (adminPrefix && (pathname === adminPrefix || pathname.startsWith(`${adminPrefix}/`))) {
    if (
      !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD ||
      !process.env.ADMIN_SESSION_SECRET
    ) {
      // Console not configured on this deployment — behave like a 404.
      return notFound();
    }
    const sub = pathname.slice(adminPrefix.length); // "" | "/…" | "/api/…"
    let destination: string;
    if (sub === "" || sub === "/") {
      destination = "/console";
    } else if (sub.startsWith("/api/")) {
      destination = `/console-api${sub.slice(4)}`;
    } else {
      destination = `/console${sub}`;
    }
    const rewrite = NextResponse.rewrite(new URL(destination, request.url));
    rewrite.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    rewrite.headers.set("Referrer-Policy", "no-referrer");
    return rewrite;
  }

  // ---------- normal session handling ----------
  const { response, user } = await updateSession(request);

  // API routes return their own 401/403 JSON — never redirect them to
  // the HTML login page (programmatic clients and cron jobs depend on
  // this). Admin API traffic was already handled above.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and _next internals.
    "/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|js|css|woff2?)$).*)",
  ],
};
