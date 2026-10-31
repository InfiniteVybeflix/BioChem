"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the service worker (production only), checks for updates, and
 * shows the install prompt with a dismiss that persists for a week.
 */
export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      const register = async () => {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Check for updates on each visit.
        registration.update().catch(() => undefined);
      };
      void register();
    }
  }, []);

  useEffect(() => {
    const dismissedAt = Number(window.localStorage.getItem("biochem:install-dismissed") ?? 0);
    // Re-offer installation after a week.
    if (Date.now() - dismissedAt > 7 * 24 * 3600 * 1000) setDismissed(false);

    const handler = (event: Event) => {
      event.preventDefault(); // keep the browser prompt; we show our own card
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!installEvent || dismissed) return null;

  const dismiss = () => {
    window.localStorage.setItem("biochem:install-dismissed", String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="glass-card fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 p-4">
      <span className="bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
        <Download className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install BioChem</p>
        <p className="text-muted-foreground text-xs">
          Study offline, get reminders, open it like a native app.
        </p>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await installEvent.prompt();
          dismiss();
        }}
      >
        Install
      </Button>
      <Button size="icon" variant="ghost" aria-label="Dismiss install prompt" onClick={dismiss}>
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
