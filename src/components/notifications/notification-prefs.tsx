"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, Loader2, Mail, Save, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SetupNotice } from "@/components/common/setup-notice";
import { useUser } from "@/hooks/use-user";
import { notificationPrefsSchema } from "@/lib/validation";

/**
 * Notification settings: per-type switches (validated with the shared
 * notificationPrefsSchema), quiet hours with a live preview, the weekly email
 * digest opt-in, and the web-push enable/disable/test flow. Preferences are
 * saved straight to `notification_prefs` with the user's own RLS client.
 */

type PrefsInput = z.input<typeof notificationPrefsSchema>;
type PrefsOutput = z.output<typeof notificationPrefsSchema>;

type PrefToggleKey =
  | "new_notes"
  | "mock_results"
  | "chat_mentions"
  | "daily_questions"
  | "announcements"
  | "jobs"
  | "push_enabled"
  | "email_digest";

export interface NotificationPrefsValue {
  new_notes: boolean;
  mock_results: boolean;
  chat_mentions: boolean;
  daily_questions: boolean;
  announcements: boolean;
  jobs: boolean;
  push_enabled: boolean;
  email_digest: boolean;
  quiet_start: string;
  quiet_end: string;
}

const PREF_ITEMS: Array<{ key: PrefToggleKey; label: string; hint: string }> = [
  { key: "new_notes", label: "New notes", hint: "Notes published in your topics" },
  { key: "mock_results", label: "Mock results", hint: "Graded mock attempts" },
  { key: "chat_mentions", label: "Chat mentions", hint: "When someone @mentions you" },
  { key: "daily_questions", label: "Daily questions", hint: "Question of the Day drops" },
  { key: "announcements", label: "Announcements", hint: "Platform-wide broadcasts" },
  { key: "jobs", label: "Jobs", hint: "Enquiries + posting decisions" },
];

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** base64url (VAPID key) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatClock(hhmm: string): string {
  const [hourRaw, minute] = hhmm.split(":").map(Number);
  if (Number.isNaN(hourRaw) || Number.isNaN(minute)) return hhmm;
  const suffix = hourRaw >= 12 ? "PM" : "AM";
  const hour = hourRaw % 12 === 0 ? 12 : hourRaw % 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export function NotificationPrefs({ initialPrefs }: { initialPrefs: NotificationPrefsValue }) {
  const { supabase, userId } = useUser();
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  const form = useForm<PrefsInput, unknown, PrefsOutput>({
    resolver: zodResolver(notificationPrefsSchema),
    defaultValues: initialPrefs,
  });
  const errors = form.formState.errors;
  const pushEnabled = form.watch("push_enabled");
  const quietStart = form.watch("quiet_start");
  const quietEnd = form.watch("quiet_end");

  // Current browser permission state (no Notification API → unsupported).
  useEffect(() => {
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const savePrefs = useCallback(
    async (values: PrefsOutput): Promise<boolean> => {
      if (!supabase || !userId) {
        toast.error("Sign in to save your notification settings");
        return false;
      }
      const { error } = await supabase.from("notification_prefs").upsert(
        {
          user_id: userId,
          new_notes: values.new_notes,
          mock_results: values.mock_results,
          chat_mentions: values.chat_mentions,
          daily_questions: values.daily_questions,
          announcements: values.announcements,
          jobs: values.jobs,
          push_enabled: values.push_enabled,
          email_digest: values.email_digest,
          quiet_start: values.quiet_start,
          quiet_end: values.quiet_end,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        toast.error(`Couldn't save settings: ${error.message}`);
        return false;
      }
      return true;
    },
    [supabase, userId],
  );

  const onSubmit = form.handleSubmit(async (values: PrefsOutput) => {
    setSaving(true);
    try {
      if (await savePrefs(values)) toast.success("Notification settings saved");
    } finally {
      setSaving(false);
    }
  });

  const enablePush = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY || !supabase || !userId) return;
    setPushBusy(true);
    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        toast.error("Push permission was denied — re-enable it in your browser settings");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        toast.error("The browser returned an incomplete push subscription");
        return;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys: { p256dh, auth } }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't enable push"));
        return;
      }

      const values = form.getValues();
      if (await savePrefs({ ...values, push_enabled: true })) {
        form.setValue("push_enabled", true);
        toast.success("Push enabled");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? `Couldn't enable push: ${error.message}` : "Couldn't enable push",
      );
    } finally {
      setPushBusy(false);
    }
  }, [form, savePrefs, supabase, userId]);

  const disablePush = useCallback(async () => {
    setPushBusy(true);
    try {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (!response.ok) {
            toast.error(await readError(response, "Couldn't disable push"));
            return;
          }
          await subscription.unsubscribe();
        }
      }
      const values = form.getValues();
      if (await savePrefs({ ...values, push_enabled: false })) {
        form.setValue("push_enabled", false);
        toast.success("Push disabled");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Couldn't disable push: ${error.message}`
          : "Couldn't disable push",
      );
    } finally {
      setPushBusy(false);
    }
  }, [form, savePrefs]);

  const sendTest = useCallback(async () => {
    setPushBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't send the test notification"));
        return;
      }
      toast.success("Test notification sent — check your devices");
    } catch {
      toast.error("Couldn't send the test notification — check your connection");
    } finally {
      setPushBusy(false);
    }
  }, []);

  const permissionLabel = useMemo(() => {
    if (permission === "granted") return "Granted";
    if (permission === "denied") return "Denied";
    if (permission === "unsupported") return "Not supported in this browser";
    return "Not asked yet";
  }, [permission]);

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <fieldset className="space-y-3">
          <legend className="font-heading text-base font-semibold">What lands in your inbox</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {PREF_ITEMS.map((item) => (
              <label
                key={item.key}
                htmlFor={`pref-${item.key}`}
                className="glass-card flex items-center justify-between gap-3 p-4 transition-all hover:-translate-y-0.5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">{item.hint}</span>
                </span>
                <Switch
                  id={`pref-${item.key}`}
                  checked={Boolean(form.watch(item.key))}
                  onCheckedChange={(checked) =>
                    form.setValue(item.key, checked, { shouldDirty: true })
                  }
                  aria-label={item.label}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="glass-card space-y-4 p-4 sm:p-5">
          <legend className="font-heading text-base font-semibold">Quiet hours</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quiet-start">From</Label>
              <Input id="quiet-start" type="time" {...form.register("quiet_start")} />
              {errors.quiet_start ? (
                <p role="alert" className="text-destructive text-xs font-medium">
                  {errors.quiet_start.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="quiet-end">Until</Label>
              <Input id="quiet-end" type="time" {...form.register("quiet_end")} />
              {errors.quiet_end ? (
                <p role="alert" className="text-destructive text-xs font-medium">
                  {errors.quiet_end.message}
                </p>
              ) : null}
            </div>
          </div>
          <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
            <Sparkles className="text-primary size-4" aria-hidden />
            {formatClock(quietStart)} → {formatClock(quietEnd)}
          </p>
          <p className="text-muted-foreground text-xs">
            Push notifications pause during quiet hours; the inbox still collects everything.
          </p>
        </fieldset>

        <fieldset className="glass-card space-y-3 p-4 sm:p-5">
          <legend className="font-heading text-base font-semibold">Email digest</legend>
          <label htmlFor="pref-email-digest" className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">Weekly summary email</span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                <Mail className="size-3.5 shrink-0" aria-hidden />
                Sent weekly via the scheduled digest job — requires SMTP to be configured by the
                admin
              </span>
            </span>
            <Switch
              id="pref-email-digest"
              checked={Boolean(form.watch("email_digest"))}
              onCheckedChange={(checked) =>
                form.setValue("email_digest", checked, { shouldDirty: true })
              }
              aria-label="Weekly summary email"
            />
          </label>
        </fieldset>

        <div>
          <Button type="submit" disabled={saving} className="focus-ring">
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <section className="glass-card space-y-4 p-4 sm:p-5" aria-label="Push notifications">
        <div>
          <h3 className="font-heading text-base font-semibold">Push notifications</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Browser permission:{" "}
            <span className="text-foreground font-medium">{permissionLabel}</span>
            {permission === "denied" ? " — re-enable notifications in your browser settings" : ""}
          </p>
        </div>

        {VAPID_PUBLIC_KEY ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={pushEnabled ? "outline" : "default"}
              onClick={pushEnabled ? disablePush : enablePush}
              disabled={pushBusy}
              className="focus-ring"
            >
              {pushBusy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <BellRing className="size-4" aria-hidden />
              )}
              {pushBusy ? "Working…" : pushEnabled ? "Disable push" : "Enable push notifications"}
            </Button>
            {pushEnabled ? (
              <Button
                type="button"
                variant="ghost"
                onClick={sendTest}
                disabled={pushBusy}
                className="focus-ring"
              >
                <Send className="size-4" aria-hidden />
                Send test notification
              </Button>
            ) : null}
          </div>
        ) : (
          <SetupNotice missing="push" />
        )}
      </section>
    </div>
  );
}
