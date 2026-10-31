import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { notifyUsers } from "@/lib/push";

/**
 * Console jobs endpoint:
 *
 *   { action: "close" | "reopen", id }        → change a posting's status
 *   { action: "enquiry_status", id, status }  → mark an enquiry read/replied
 *   { action: "enquiry_reply", id, body }     → answer a student's enquiry
 *       (the student is notified in-app + push)
 */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close"), id: z.string().uuid() }),
  z.object({ action: z.literal("reopen"), id: z.string().uuid() }),
  z.object({
    action: z.literal("enquiry_status"),
    id: z.string().uuid(),
    status: z.enum(["sent", "read", "replied"]),
  }),
  z.object({
    action: z.literal("enquiry_reply"),
    id: z.string().uuid(),
    body: z.string().trim().min(2).max(3000),
  }),
]);

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 422 });
  const body = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  if (body.action === "close" || body.action === "reopen") {
    const { error } = await admin
      .from("jobs")
      .update({
        status: body.action === "close" ? "closed" : "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.id);
    if (error) return Response.json({ error: "Could not update the posting" }, { status: 502 });
    return Response.json({ ok: true });
  }

  const { data: enquiry } = await admin
    .from("job_enquiries")
    .select("id, user_id, status, jobs(title)")
    .eq("id", body.id)
    .maybeSingle();
  if (!enquiry) return Response.json({ error: "Enquiry not found" }, { status: 404 });

  if (body.action === "enquiry_status") {
    const { error } = await admin
      .from("job_enquiries")
      .update({ status: body.status })
      .eq("id", body.id);
    if (error) return Response.json({ error: "Could not update the enquiry" }, { status: 502 });
    return Response.json({ ok: true });
  }

  // enquiry_reply → the answer reaches the student in-app + push.
  if (!enquiry.user_id) {
    return Response.json({ error: "This enquiry has no user to reply to" }, { status: 422 });
  }
  await notifyUsers([enquiry.user_id], "jobs", {
    title: `Reply about: ${enquiry.jobs?.title ?? "your enquiry"}`,
    body: body.body.slice(0, 180),
    link: "/jobs",
  });

  const { error } = await admin
    .from("job_enquiries")
    .update({ status: "replied" })
    .eq("id", body.id);
  if (error) return Response.json({ error: "Could not mark the enquiry" }, { status: 502 });
  return Response.json({ ok: true });
}
