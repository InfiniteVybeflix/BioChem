import { handleRoute, jsonOk, jsonError, verifyCronAuth } from "@/lib/api";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { zonedDayOfWeek, zonedMinutes, zonedToday } from "@/lib/ai/daily";
import { notifyUsers } from "@/lib/push";
import type { NextResponse } from "next/server";
import type { Database } from "@/types/domain";

/**
 * /api/cron/reminders — sends plan-event reminders.
 *
 * Runs every few minutes. For every plan event with a reminder that has not
 * been sent yet, computes this (local-day) occurrence's start datetime; when
 * `now` falls inside [start − reminder_minutes, start − reminder_minutes + 30)
 * in the owner's timezone, the user is notified and reminder_sent_at is set.
 */

const FIRE_WINDOW_MINUTES = 30;
/** Minutes since local midnight of "HH:MM" / "HH:MM:SS". */
function hmMinutes(value: string): number {
  const [h = "0", m = "0"] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

async function runReminders(): Promise<NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin) return jsonError("Supabase service role is not configured", 503);

  const { data: events } = await admin
    .from("plan_events")
    .select("*")
    .not("reminder_minutes", "is", null)
    .is("reminder_sent_at", null);
  if (!events || events.length === 0) return jsonOk({ sent: 0 });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone")
    .in("id", [...new Set(events.map((event) => event.user_id))]);
  const timezoneByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile.timezone]));

  const now = new Date();
  let sent = 0;

  for (const event of events) {
    try {
      const reminderMinutes = event.reminder_minutes;
      if (reminderMinutes === null) continue; // narrowed type guard for TS

      const profileTz = timezoneByUser.get(event.user_id) ?? "Africa/Nairobi";
      const timezone = validTimezone(profileTz) ? profileTz : "Africa/Nairobi";

      const today = zonedToday(timezone, now);
      const todayDow = zonedDayOfWeek(timezone, now);
      const nowMinutes = zonedMinutes(timezone, now);

      // Does this event occur today (local)?
      if (event.day_of_week !== null) {
        if (event.day_of_week !== todayDow) continue; // recurring, not today
      } else if (event.date !== null) {
        if (event.date !== today) continue; // one-off, not today
      } else {
        continue; // neither set — nothing to anchor a reminder to
      }

      const triggerMinutes = hmMinutes(event.start_time) - reminderMinutes;
      const windowEnd = triggerMinutes + FIRE_WINDOW_MINUTES;
      if (windowEnd <= 0) continue; // window closed before local midnight
      const windowStart = Math.max(0, triggerMinutes);
      if (nowMinutes < windowStart || nowMinutes >= windowEnd) continue;

      await notifyUsers([event.user_id], "system", {
        title: `Reminder: ${event.title}`,
        body: `Starts at ${event.start_time.slice(0, 5)}`,
        link: "/planner",
      });

      // reminder_sent_at is part of plan_events.Update (see database.ts).
      const patch: Database["public"]["Tables"]["plan_events"]["Update"] = {
        reminder_sent_at: new Date().toISOString(),
      };
      const { error } = await admin.from("plan_events").update(patch).eq("id", event.id);
      if (error) throw new Error(error.message);

      sent += 1;
    } catch (error) {
      console.error(
        `[cron:reminders] event ${event.id} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return jsonOk({ sent });
}

async function run(req: Request): Promise<NextResponse> {
  if (!verifyCronAuth(req)) return jsonError("Unauthorized", 401);
  return handleRoute(async () => runReminders());
}

export async function GET(req: Request): Promise<NextResponse> {
  return run(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return run(req);
}
