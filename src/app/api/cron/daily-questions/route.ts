import { handleRoute, jsonOk, jsonError, verifyCronAuth } from "@/lib/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateDailyQuestions, parseHm, zonedMinutes, zonedToday } from "@/lib/ai/daily";
import type { NextResponse } from "next/server";
import type { Database } from "@/types/domain";

/**
 * /api/cron/daily-questions — delivers Question-of-the-Day sets.
 *
 * Runs every few minutes. For every user with daily questions enabled, if
 * their local delivery time passed within the last 15 minutes and no set
 * exists for their local today, one is generated. Per-user failures never
 * block the rest of the run.
 */

type SettingsRow = Database["public"]["Tables"]["daily_question_settings"]["Row"];

const DELIVERY_WINDOW_MINUTES = 15;

async function runDelivery(): Promise<NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin) return jsonError("Supabase service role is not configured", 503);

  const { data: settingsRows } = await admin
    .from("daily_question_settings")
    .select("*")
    .eq("enabled", true);
  if (!settingsRows || settingsRows.length === 0) return jsonOk({ generated: 0, errors: 0 });

  // profiles.timezone is the fallback when a settings row carries an invalid
  // timezone string (generateDailyQuestions itself falls back to UTC, so we
  // validate here to keep the delivery check and the insert date consistent).
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone")
    .in(
      "id",
      settingsRows.map((row) => row.user_id),
    );
  const profileTimezone = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.timezone]),
  );

  const now = new Date();
  let generated = 0;
  let errors = 0;

  for (const raw of settingsRows) {
    try {
      // Keep the delivery check and generateDailyQuestions on the same clock:
      // when the settings timezone is invalid, substitute the profile (or a
      // default) timezone in the row we hand on.
      const row: SettingsRow = validTimezone(raw.timezone)
        ? raw
        : { ...raw, timezone: profileTimezone.get(raw.user_id) ?? "Africa/Nairobi" };

      const today = zonedToday(row.timezone, now);
      const nowMinutes = zonedMinutes(row.timezone, now);
      const deliveryMinutes = parseHm(row.delivery_time);

      const withinWindow =
        nowMinutes >= deliveryMinutes && nowMinutes < deliveryMinutes + DELIVERY_WINDOW_MINUTES;
      if (!withinWindow) continue;

      const { count } = await admin
        .from("daily_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", row.user_id)
        .eq("for_date", today);
      if ((count ?? 0) > 0) continue;

      await generateDailyQuestions(row.user_id, row);
      generated += 1;
    } catch (error) {
      console.error(
        `[cron:daily-questions] user ${raw.user_id} failed:`,
        error instanceof Error ? error.message : error,
      );
      errors += 1;
    }
  }

  return jsonOk({ generated, errors });
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

async function run(req: Request): Promise<NextResponse> {
  if (!verifyCronAuth(req)) return jsonError("Unauthorized", 401);
  return handleRoute(async () => runDelivery());
}

export async function GET(req: Request): Promise<NextResponse> {
  return run(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return run(req);
}
