import type { NextResponse } from "next/server";
import { z } from "zod";
import { handleRoute, jsonError, jsonOk } from "@/lib/api";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { isSupportCategory, type SupportCategory } from "@/types/domain";

/**
 * /api/support — the customer-care desk.
 *
 * POST → create a ticket (works signed-in or as a guest with an email).
 *        Spam-hardened: honeypot field, strict zod validation, length
 *        caps and a best-effort per-IP rate limit. The platform team is
 *        pinged on the support webhook (if configured) and answers from
 *        the operations console; replies appear in the user's inbox here.
 * GET  → the signed-in user's tickets + replies (read via RLS).
 */

const ticketSchema = z.object({
  category: z.string().refine(isSupportCategory, "Pick a category"),
  subject: z.string().trim().min(4).max(120),
  message: z.string().trim().min(10).max(5000),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  // Honeypot — bots fill this, humans never see it.
  company: z.string().max(0).optional().or(z.literal("")),
});

const CATEGORY_LABELS: Record<SupportCategory, string> = {
  bug: "Bug report",
  complaint: "Complaint",
  question: "Question",
  feedback: "Feedback",
};

// Best-effort in-memory per-IP throttle (3 tickets / 10 min / IP).
// Serverless instances share nothing, but this still blunts floods
// and pairs with the length caps and zod validation below.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function ipThrottled(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

async function pingWebhook(ticket: {
  id: string;
  category: string;
  subject: string;
  message: string;
  from: string;
  page: string | null;
}): Promise<void> {
  const url = env.supportWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "BioChem support",
        event: "new_ticket",
        ticket,
        opened_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // An unreachable webhook must never block ticket creation.
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (ipThrottled(ip)) {
      return jsonError(
        "You've sent quite a few messages already — please wait a few minutes.",
        429,
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = ticketSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        "Please fill in the subject and describe the issue in a little more detail.",
        422,
      );
    }
    const { category, subject, message } = parsed.data;

    const admin = getSupabaseAdminClient();
    if (!admin) return jsonError("Service temporarily unavailable", 503);

    const auth = await getAuthContext();
    const email = auth?.user.email ?? parsed.data.email ?? "";
    if (!auth && !email) {
      return jsonError("Please add an email address so the team can get back to you.", 422);
    }

    const { data: ticket, error } = await admin
      .from("support_tickets")
      .insert({
        user_id: auth?.user.id ?? null,
        email,
        category,
        subject,
        message,
        page: request.headers.get("referer") ?? null,
        user_agent: request.headers.get("user-agent") ?? null,
      })
      .select("id")
      .single();

    if (error || !ticket) {
      return jsonError("Could not send your message — please try again.", 502);
    }

    void pingWebhook({
      id: ticket.id,
      category: CATEGORY_LABELS[category],
      subject,
      message,
      from: email || "signed-in user",
      page: request.headers.get("referer") ?? null,
    });

    return jsonOk({
      ticketId: ticket.id,
      message: "Message received — the team will reply here in the app.",
    });
  });
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);
    const auth = await getAuthContext();
    if (!auth) return jsonError("Sign in to see your tickets", 401);

    const { data: tickets } = await supabase
      .from("support_tickets")
      .select("id, category, subject, status, created_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    const ids = (tickets ?? []).map((ticket) => ticket.id);
    const { data: replies } = ids.length
      ? await supabase
          .from("support_replies")
          .select("ticket_id, body, created_at")
          .in("ticket_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] };

    return jsonOk({
      tickets: tickets ?? [],
      replies: replies ?? [],
    });
  });
}
