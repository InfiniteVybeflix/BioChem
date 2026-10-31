import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, isPushConfigured } from "@/lib/env";
import type { Database, NotificationType } from "@/types/domain";
import { pushKeys } from "@/types/domain";

type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];
type NotificationPrefsRow = Database["public"]["Tables"]["notification_prefs"]["Row"];

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (!isPushConfigured()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      env.vapidSubject(),
      env.vapidPublicKey as string,
      env.vapidPrivateKey() as string,
    );
    vapidConfigured = true;
  }
  return true;
}

const PREF_COLUMN: Partial<Record<NotificationType, keyof NotificationPrefsRow>> = {
  new_notes: "new_notes",
  mock_results: "mock_results",
  chat_mentions: "chat_mentions",
  daily_questions: "daily_questions",
  announcements: "announcements",
  jobs: "jobs",
};

function parseHm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes-since-midnight of `at` rendered in `timeZone`. */
function localMinutes(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return (hour % 24) * 60 + minute;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

/**
 * True when the user's local time (in `timeZone`) falls inside their quiet
 * hours window. Handles windows that wrap midnight (e.g. 22:00 → 07:00).
 */
export function isWithinQuietHours(
  at: Date,
  timeZone: string,
  quietStart: string,
  quietEnd: string,
): boolean {
  const minutes = localMinutes(at, timeZone);
  const start = parseHm(quietStart);
  const end = parseHm(quietEnd);
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end; // wraps midnight
}

/**
 * Creates an in-app notification row for every targeted user and, when their
 * preferences allow it and it is not quiet hours in their timezone, sends a
 * web push. Privileged (service-role) — called from server flows only.
 */
export async function notifyUsers(
  userIds: string[],
  type: NotificationType,
  payload: { title: string; body?: string; link?: string },
): Promise<void> {
  if (userIds.length === 0) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const [{ data: prefs }, { data: profiles }] = await Promise.all([
    admin.from("notification_prefs").select("*").in("user_id", userIds),
    admin.from("profiles").select("id, timezone").in("id", userIds),
  ]);

  const prefsByUser = new Map((prefs ?? []).map((row) => [row.user_id, row]));
  const timezoneByUser = new Map((profiles ?? []).map((row) => [row.id, row.timezone]));

  const prefColumn = PREF_COLUMN[type];
  const now = new Date();

  // In-app inbox rows (respects per-type opt-outs; quiet hours never block
  // the inbox — they only defer the push).
  const recipients = userIds.filter((userId) => {
    const pref = prefsByUser.get(userId);
    if (!pref) return true;
    if (prefColumn && pref[prefColumn] === false) return false;
    return true;
  });

  if (recipients.length > 0) {
    await admin.from("notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
      })),
    );
  }

  // Web push: opted-in users only, and never inside their quiet hours.
  if (!ensureVapid()) return;

  const pushTargets = recipients.filter((userId) => {
    const pref = prefsByUser.get(userId);
    if (pref?.push_enabled !== true) return false;
    const timezone = timezoneByUser.get(userId) ?? "Africa/Nairobi";
    return !isWithinQuietHours(now, timezone, pref.quiet_start, pref.quiet_end);
  });
  if (pushTargets.length === 0) return;

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("*")
    .in("user_id", pushTargets);

  const sends = (subscriptions ?? []).flatMap((sub: PushSubscriptionRow) => {
    const keys = pushKeys(sub.keys);
    if (!keys.p256dh || !keys.auth) return [];
    return [
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
          JSON.stringify({
            title: payload.title,
            body: payload.body ?? "",
            url: payload.link ? `${env.appUrl}${payload.link}` : env.appUrl,
          }),
        )
        .catch((error: unknown) => {
          // 404/410 → subscription expired; remove it.
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            void admin.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }),
    ];
  });

  await Promise.allSettled(sends);
}
