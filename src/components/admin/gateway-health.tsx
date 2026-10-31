"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type GatewayState = "loading" | "ok" | "unconfigured" | "error";

/**
 * Client-side AI gateway health card for the admin overview. Fetches the
 * public /api/ai/status endpoint on mount and refreshes once a minute.
 */
export function GatewayHealth() {
  const [state, setState] = useState<GatewayState>("loading");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/ai/status");
        if (!response.ok) throw new Error("status check failed");
        const data: unknown = await response.json();
        if (cancelled) return;
        if (typeof data === "object" && data !== null && "gateway" in data) {
          const gateway = (data as { gateway: { ok?: boolean; error?: string } }).gateway;
          if (gateway.ok === true) {
            setState("ok");
            setDetail(null);
          } else if (
            typeof gateway.error === "string" &&
            gateway.error.includes("not configured")
          ) {
            setState("unconfigured");
            setDetail(gateway.error);
          } else {
            setState("error");
            setDetail(
              typeof gateway.error === "string" ? gateway.error : "Gateway reported an error",
            );
          }
        } else {
          setState("error");
          setDetail("Unexpected status response");
        }
      } catch {
        if (!cancelled) {
          setState("error");
          setDetail("Could not reach /api/ai/status");
        }
      }
    };
    void load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const tone =
    state === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : state === "unconfigured"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : state === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground";

  const label =
    state === "ok"
      ? "AI gateway healthy"
      : state === "unconfigured"
        ? "AI gateway not configured"
        : state === "error"
          ? "AI gateway unreachable"
          : "Checking AI gateway…";

  return (
    <div className={cn("rounded-xl border px-4 py-3", tone)} role="status" aria-live="polite">
      <p className="text-sm font-semibold">{label}</p>
      {detail ? <p className="mt-0.5 text-xs opacity-80">{detail}</p> : null}
      {state !== "ok" ? (
        <p className="mt-1 text-xs opacity-75">
          Set <code className="font-mono">AEVIBRON_GATEWAY_URL</code> and{" "}
          <code className="font-mono">AEVIBRON_API_KEY</code> in .env to enable AI features.
        </p>
      ) : null}
    </div>
  );
}
