import { SupportInbox, type ConsoleTicket } from "@/components/console/support-inbox";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — support inbox (customer care).
 */
export default async function ConsoleSupportPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const { data: tickets } = await admin
    .from("support_tickets")
    .select(
      "id, category, subject, message, status, email, page, created_at, support_replies(body, created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const rows: ConsoleTicket[] = (tickets ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    email: row.email,
    from: row.email || "signed-in user",
    page: row.page,
    createdAt: row.created_at,
    replies: (row.support_replies ?? []).map((reply) => ({
      body: reply.body,
      createdAt: reply.created_at,
    })),
  }));

  return <SupportInbox initialTickets={rows} />;
}
