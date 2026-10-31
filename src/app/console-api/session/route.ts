import { headers } from "next/headers";
import { checkAdminCredentials, endAdminSession, startAdminSession } from "@/lib/admin/session";

/**
 * Console session endpoint (served at /{ADMIN_ROUTE_PATH}/api/session).
 *
 * POST   → sign in with the deployment's environment credentials.
 * DELETE → lock the console.
 *
 * There is no user record, no reset flow and no fallback credential:
 * the only valid email/password pair lives in ADMIN_EMAIL/ADMIN_PASSWORD.
 */
export async function POST(request: Request): Promise<Response> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const body: unknown = await request.json().catch(() => null);
  const credentials =
    body && typeof body === "object" && "email" in body && "password" in body
      ? {
          email: String((body as { email: unknown }).email ?? ""),
          password: String((body as { password: unknown }).password ?? ""),
        }
      : null;

  if (!credentials || credentials.email.length === 0 || credentials.password.length === 0) {
    return Response.json({ error: "Enter your email and password" }, { status: 422 });
  }

  const result = checkAdminCredentials(credentials.email, credentials.password, ip);
  if (!result.ok) {
    // Deliberately vague — never reveal which factor failed.
    return Response.json(
      {
        error:
          result.remaining === 0
            ? "Too many attempts — locked for 15 minutes."
            : `Invalid credentials. ${result.remaining} attempt${result.remaining === 1 ? "" : "s"} left.`,
      },
      { status: result.remaining === 0 ? 429 : 401 },
    );
  }

  await startAdminSession();
  return Response.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  await endAdminSession();
  return Response.json({ ok: true });
}
