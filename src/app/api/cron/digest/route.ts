import nodemailer from "nodemailer";
import { handleRoute, jsonOk, jsonError, verifyCronAuth } from "@/lib/api";
import { env } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";

/**
 * /api/cron/digest — weekly activity digest.
 *
 * Runs hourly; outside DIGEST_SEND_HOUR_UTC it exits immediately. For every
 * user opted into email digests it summarises the day (new notes, mocks
 * submitted, flashcards due, unread alerts) into an in-app notification and —
 * when SMTP_URL is configured — a branded email. Per-user failures never
 * block the rest of the run.
 */

interface DigestCounters {
  notes: number;
  attempts: number;
  avgPercent: number | null;
  flashcardsDue: number;
  unread: number;
}

async function gatherDigest(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string,
  startOfDayUtc: string,
  today: string,
): Promise<DigestCounters> {
  const [notesResult, attemptsResult, dueResult, unreadResult] = await Promise.all([
    admin
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .gte("published_at", startOfDayUtc),
    admin
      .from("exam_attempts")
      .select("score, max_score")
      .eq("user_id", userId)
      .eq("status", "submitted")
      .gte("submitted_at", startOfDayUtc),
    admin
      .from("flashcard_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_date", today),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);

  const attempts = attemptsResult.data ?? [];
  const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
  const totalMax = attempts.reduce((sum, attempt) => sum + attempt.max_score, 0);

  return {
    notes: notesResult.count ?? 0,
    attempts: attempts.length,
    avgPercent: totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null,
    flashcardsDue: dueResult.count ?? 0,
    unread: unreadResult.count ?? 0,
  };
}

function digestBody(counters: DigestCounters): string {
  const parts = [
    `${counters.notes} new note${counters.notes === 1 ? "" : "s"}`,
    counters.attempts > 0
      ? `${counters.attempts} mock${counters.attempts === 1 ? "" : "s"} submitted${
          counters.avgPercent !== null ? ` (avg ${counters.avgPercent}%)` : ""
        }`
      : null,
    `${counters.flashcardsDue} flashcard${counters.flashcardsDue === 1 ? "" : "s"} due`,
    `${counters.unread} unread alert${counters.unread === 1 ? "" : "s"}`,
  ].filter((part): part is string => part !== null);
  return `Today: ${parts.join(" · ")}.`;
}

function digestHtml(counters: DigestCounters): string {
  const rows: [string, string][] = [
    ["New published notes", String(counters.notes)],
    [
      "Mocks submitted",
      counters.attempts > 0
        ? `${counters.attempts}${counters.avgPercent !== null ? ` (avg ${counters.avgPercent}%)` : ""}`
        : "0",
    ],
    ["Flashcards due", String(counters.flashcardsDue)],
    ["Unread alerts", String(counters.unread)],
  ];
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:Inter,Arial,sans-serif;color:#134e4a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border:1px solid #ccfbf1;overflow:hidden;">
    <tr><td style="padding:20px 24px;background:#f0fdfa;border-bottom:1px solid #ccfbf1;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#0f766e;">BioChem</p>
      <p style="margin:4px 0 0;font-size:13px;color:#5f6b68;">Your weekly study digest</p>
    </td></tr>
    <tr><td style="padding:8px 24px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
        ${rows
          .map(
            ([label, value]) => `<tr>
          <td style="padding:12px 0;border-bottom:1px solid #e6efec;color:#3f524e;">${label}</td>
          <td style="padding:12px 0;border-bottom:1px solid #e6efec;text-align:right;font-weight:600;color:#0f766e;">${value}</td>
        </tr>`,
          )
          .join("")}
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#5f6b68;">
        Keep the streak alive — open <a href="${env.appUrl}/dashboard" style="color:#0f766e;">your dashboard</a>.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

async function runDigest(): Promise<NextResponse> {
  const now = new Date();
  if (now.getUTCHours() !== env.digestSendHourUtc()) {
    return jsonOk({ skipped: "not digest hour" });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return jsonError("Supabase service role is not configured", 503);

  const { data: prefs } = await admin
    .from("notification_prefs")
    .select("user_id")
    .eq("email_digest", true);
  if (!prefs || prefs.length === 0) return jsonOk({ digests: 0 });

  const startOfDayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const today = startOfDayUtc.slice(0, 10);

  const smtpUrl = process.env.SMTP_URL;
  let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
  if (smtpUrl) {
    transport = nodemailer.createTransport(smtpUrl);
  }

  const from = process.env.DIGEST_FROM_EMAIL ?? "BioChem <digest@biochem.app>";

  let digests = 0;
  for (const pref of prefs) {
    try {
      const counters = await gatherDigest(admin, pref.user_id, startOfDayUtc, today);
      const body = digestBody(counters);

      const { error: notifyError } = await admin.from("notifications").insert({
        user_id: pref.user_id,
        type: "system",
        title: "Your BioChem digest",
        body,
        link: "/dashboard",
      });
      if (notifyError) throw new Error(notifyError.message);

      if (transport) {
        const { data: userData, error: userError } = await admin.auth.admin.getUserById(
          pref.user_id,
        );
        const email = userData?.user?.email;
        if (userError) throw new Error(userError.message);
        if (email) {
          await transport.sendMail({
            from,
            to: email,
            subject: "Your BioChem weekly digest",
            html: digestHtml(counters),
          });
        }
      }

      digests += 1;
    } catch (error) {
      console.error(
        `[cron:digest] user ${pref.user_id} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return jsonOk({ digests });
}

async function run(req: Request): Promise<NextResponse> {
  if (!verifyCronAuth(req)) return jsonError("Unauthorized", 401);
  return handleRoute(async () => runDigest());
}

export async function GET(req: Request): Promise<NextResponse> {
  return run(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return run(req);
}
