"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Offline fallback page served by the service worker. */
export default function OfflinePage() {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
        <WifiOff className="size-8" aria-hidden />
      </span>
      <h1 className="font-heading mt-6 text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        Pages and study material you visited recently still work from the offline cache. Anything
        you submit while offline syncs automatically once you reconnect.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
          <RotateCw className="size-4" aria-hidden />
          Try again
        </Button>
        <Button asChild>
          <Link href="/dashboard">Go to cached dashboard</Link>
        </Button>
      </div>
      <p className="text-muted-foreground mt-4 text-xs">
        {online ? "Connection is back — reload to continue." : "Waiting for connection…"}
      </p>
    </div>
  );
}
