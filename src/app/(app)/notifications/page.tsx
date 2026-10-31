import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, type InboxItem } from "@/components/notifications/inbox";
import {
  NotificationPrefs,
  type NotificationPrefsValue,
} from "@/components/notifications/notification-prefs";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Notifications — BioChem",
  description: "Your inbox for results, mentions and daily questions — plus notification settings.",
};

/** Mirrors the notification_prefs column defaults from the migration. */
const DEFAULT_PREFS: NotificationPrefsValue = {
  new_notes: true,
  mock_results: true,
  chat_mentions: true,
  daily_questions: true,
  announcements: true,
  jobs: false,
  push_enabled: false,
  email_digest: false,
  quiet_start: "22:00",
  quiet_end: "07:00",
};

/**
 * Notifications page: the latest 50 of the signed-in user's notifications plus
 * their preference row, rendered server-side; the client components handle
 * realtime inserts, mark-read and saving settings.
 */
export default async function NotificationsPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Notifications"
          description="Results, mentions and daily questions land in this inbox."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const [{ data: notificationRows }, { data: prefsRow }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notification_prefs").select("*").maybeSingle(),
  ]);

  // RLS scopes both queries to the signed-in user.
  const notifications: InboxItem[] = (notificationRows ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

  // `time` columns arrive as "HH:MM:SS" — the shared schema expects "HH:MM".
  const prefs: NotificationPrefsValue = prefsRow
    ? {
        new_notes: prefsRow.new_notes,
        mock_results: prefsRow.mock_results,
        chat_mentions: prefsRow.chat_mentions,
        daily_questions: prefsRow.daily_questions,
        announcements: prefsRow.announcements,
        jobs: prefsRow.jobs,
        push_enabled: prefsRow.push_enabled,
        email_digest: prefsRow.email_digest,
        quiet_start: prefsRow.quiet_start.slice(0, 5),
        quiet_end: prefsRow.quiet_end.slice(0, 5),
      }
    : DEFAULT_PREFS;

  return (
    <section>
      <PageHeader
        title="Notifications"
        description="Your inbox for results, mentions and daily questions — plus push and quiet-hours settings."
      />
      <Tabs defaultValue="inbox">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="inbox" className="flex-1 sm:flex-none">
            <Bell className="size-4" aria-hidden />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex-1 sm:flex-none">
            Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">
          <Inbox initialNotifications={notifications} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <NotificationPrefs initialPrefs={prefs} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
