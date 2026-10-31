import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { notifyUsers } from "@/lib/push";

/**
 * Console support endpoint — the customer-care inbox.
 *
 *   { action: "reply",  ticketId, body }   → the operator's answer is
 *     stored and the user is notified in-app (and via push when enabled).
 *   { action: "status", ticketId, status } → open | in_progress | resolved.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reply"),
    ticketId: z.string().uuid(),
    body: z.string().trim().min(2).max(5000),
  }),
  z.object({
    action: z.literal("status"),
    ticketId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "resolved"]),
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

  const { data: ticket } = await admin
    .from("support_tickets")
    .select("id, user_id, subject, status")
    .eq("id", body.ticketId)
    .maybeSingle();
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  if (body.action === "reply") {
    const { error } = await admin
      .from("support_replies")
      .insert({ ticket_id: body.ticketId, body: body.body });
    if (error) return Response.json({ error: "Could not send the reply" }, { status: 502 });

    if (body.body.trim().length > 0) {
      await admin
        .from("support_tickets")
        .update({
          status: ticket.status === "resolved" ? "resolved" : "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.ticketId);
    }

    if (ticket.user_id) {
      await notifyUsers([ticket.user_id], "system", {
        title: "Support replied to your message",
        body: body.body.slice(0, 140),
        link: "/support",
      });
    }
    return Response.json({ ok: true });
  }

  const { error } = await admin
    .from("support_tickets")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.ticketId);
  if (error) return Response.json({ error: "Could not update the ticket" }, { status: 502 });
  return Response.json({ ok: true });
}
