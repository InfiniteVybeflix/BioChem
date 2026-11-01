import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { GRANTABLE_ABILITIES } from "@/lib/rbac";

/**
 * Console users endpoint — staff approval, role changes, suspension and
 * ability grants (class rep etc.). Runs entirely with the service client
 * behind the console session.
 */

const actionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["approve", "set_role", "set_abilities", "suspend", "unsuspend"]),
  role: z.enum(["student", "lecturer"]).optional(),
  abilities: z.array(z.enum(GRANTABLE_ABILITIES)).max(GRANTABLE_ABILITIES.length).optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 422 });
  }
  const { userId, action, role, abilities, reason } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (action === "approve") {
    const { error } = await admin
      .from("profiles")
      .update({ approved: true, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .eq("role", "lecturer");
    if (error) return Response.json({ error: "Could not approve this account" }, { status: 502 });

    await admin.from("notifications").insert({
      user_id: userId,
      type: "system",
      title: "Your staff account is active",
      body: "Welcome aboard — you can now publish notes, questions and exams.",
      link: "/lecturer",
    });
    return Response.json({ ok: true });
  }

  if (action === "set_role") {
    if (!role) return Response.json({ error: "Missing role" }, { status: 422 });
    const { error } = await admin
      .from("profiles")
      .update({
        role,
        // Promoting someone to staff leaves them unapproved until activated.
        approved: role === "lecturer" ? false : true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) return Response.json({ error: "Could not change the role" }, { status: 502 });
    return Response.json({ ok: true });
  }

  if (action === "set_abilities") {
    if (!abilities) return Response.json({ error: "Missing abilities" }, { status: 422 });
    // Deduplicate + keep a stable order for cleaner diffs and debugging.
    const unique = [...new Set(abilities)];
    const { error } = await admin
      .from("profiles")
      .update({ staff_abilities: unique, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) return Response.json({ error: "Could not update abilities" }, { status: 502 });

    if (unique.length > 0) {
      await admin.from("notifications").insert({
        user_id: userId,
        type: "system",
        title: "Your abilities were updated",
        body: "You've been granted extra staff abilities — check the Lecturer panel for what's now available.",
        link: "/lecturer",
      });
    }
    return Response.json({ ok: true, abilities: unique });
  }

  const suspending = action === "suspend";
  const { error } = await admin
    .from("profiles")
    .update({
      suspended: suspending,
      suspension_reason: suspending ? (reason ?? "Contact support for details") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return Response.json({ error: "Could not update the account" }, { status: 502 });

  // Suspension takes effect on the user's next request (the app shell
  // checks `suspended` on every load) and blocks all API access.
  return Response.json({ ok: true });
}
