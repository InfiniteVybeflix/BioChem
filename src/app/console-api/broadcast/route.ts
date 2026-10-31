import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { notifyUsers } from "@/lib/push";

/**
 * Console broadcast endpoint — platform-wide announcements.
 * Creates the announcement row and notifies (in-app + push) every
 * user in the chosen audience.
 */

const schema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(5).max(4000),
  audience: z.enum(["all", "students", "lecturers"]),
});

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a title and a body" }, { status: 422 });
  const { title, body, audience } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // The console has no profile row — platform broadcasts are authored
  // by "the platform" (author_id null) and rendered as such.
  const { error } = await admin.from("announcements").insert({
    author_id: null,
    title,
    body_md: body,
    audience,
  });
  // Surface the real database error (logged server-side too) so a
  // missing table, bad key or policy problem is diagnosable at a glance.
  if (error) {
    console.error("[console-api/broadcast] insert failed:", error.message);
    return Response.json({ error: error.message }, { status: 502 });
  }

  let query = admin.from("profiles").select("id").eq("suspended", false).limit(5000);
  if (audience === "students") query = query.eq("role", "student");
  if (audience === "lecturers") query = query.eq("role", "lecturer");
  const { data: recipients } = await query;

  const users = (recipients ?? []).map((row) => row.id);
  if (users.length > 0) {
    // The announcement is already saved — a failure while delivering
    // notifications must not fail the request (a 500 would invite a
    // retry and a duplicate announcement). Log it and report the
    // audience size, which is what `notified` has always meant.
    try {
      await notifyUsers(users, "announcements", {
        title,
        body: body.slice(0, 180),
        link: "/dashboard",
      });
    } catch (notifyError) {
      console.error(
        "[console-api/broadcast] notification delivery failed:",
        notifyError instanceof Error ? notifyError.message : notifyError,
      );
    }
  }

  return Response.json({ ok: true, notified: users.length });
}
