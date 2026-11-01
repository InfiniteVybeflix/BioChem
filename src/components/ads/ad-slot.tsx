"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdPlacement } from "@/types/domain";
import { cn } from "@/lib/utils";

/**
 * Reusable sponsored-ad placement. Renders one clearly labelled glass card
 * (image, title, body, CTA) when the `ads_enabled` feature flag is on and an
 * enabled, in-flight ad exists for the placement — otherwise renders nothing
 * at all.
 *
 * Ads re-sync every 60 seconds (and when the tab becomes visible again), so a
 * placement created in the console appears for students without a reload.
 * Impressions are recorded once per ad per browser session; clicks are always
 * recorded before the target URL opens.
 */

interface AdRow {
  id: string;
  title: string;
  body: string;
  targetUrl: string;
  ctaLabel: string;
  imageUrl: string | null;
}

const SEEN_KEY_PREFIX = "biochem:ad-seen-";
const REFRESH_MS = 60_000;

async function recordImpression(adId: string, kind: "impression" | "click"): Promise<void> {
  try {
    await fetch("/api/ads/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adId, kind }),
    });
  } catch {
    // Offline or unauthenticated — the ad still renders, tracking is best-effort.
  }
}

/**
 * Banner placements render as a wide horizontal strip, sidebar placements as a
 * compact rail card, everything else as the standard inline card.
 */
function variantFor(placement: AdPlacement): "banner" | "sidebar" | "card" {
  if (placement === "banner") return "banner";
  if (placement === "sidebar") return "sidebar";
  return "card";
}

export function AdSlot({ placement }: { placement: AdPlacement }) {
  const { supabase: userClient } = useUser();
  const [ad, setAd] = useState<AdRow | null>(null);

  // On public pages useUser() may not be inside the authed shell — fall back
  // to the shared browser client so placements work for guests too.
  const client = userClient ?? getSupabaseBrowserClient();

  useEffect(() => {
    if (!client) return;
    let cancelled = false;

    const load = async () => {
      const nowIso = new Date().toISOString();
      const [flagsResult, adsResult] = await Promise.all([
        client.from("feature_flags").select("enabled").eq("key", "ads_enabled").maybeSingle(),
        client
          .from("ads")
          .select("id, title, body, target_url, cta_label, image_url")
          .eq("placement", placement)
          .eq("enabled", true)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (cancelled) return;
      // Ads default OFF when the flag row is missing (seed default: disabled).
      const adsOn = flagsResult.data?.enabled === true;
      const row = adsResult.data?.[0];
      if (!adsOn || !row) {
        setAd(null);
        return;
      }

      setAd({
        id: row.id,
        title: row.title,
        body: row.body,
        targetUrl: row.target_url,
        ctaLabel: row.cta_label,
        imageUrl: row.image_url ?? null,
      });
    };

    void load();

    // Keep placements in sync with the console: poll + refresh on tab focus.
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, placement]);

  // One impression per ad per session (sessionStorage guard).
  useEffect(() => {
    if (!ad) return;
    const key = `${SEEN_KEY_PREFIX}${ad.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage unavailable (private mode) — still record the impression.
    }
    void recordImpression(ad.id, "impression");
  }, [ad]);

  const onCtaClick = useCallback(() => {
    if (!ad) return;
    void recordImpression(ad.id, "click");
    window.open(ad.targetUrl, "_blank", "noopener,noreferrer");
  }, [ad]);

  if (!ad) return null;

  const variant = variantFor(placement);

  // image_url is an arbitrary external URL set from the console — a plain img
  // keeps deployments working without extending next/image remote patterns.
  /* eslint-disable @next/next/no-img-element */
  return (
    <aside
      className={cn(
        "glass-card border-amber-500/30",
        variant === "banner" &&
          "flex max-w-none flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5",
        variant === "sidebar" && "p-4",
        variant === "card" && "max-w-2xl p-4 sm:p-5",
      )}
      aria-label="Sponsored placement"
    >
      {ad.imageUrl && variant === "banner" ? (
        <img
          src={ad.imageUrl}
          alt=""
          className="ring-border/60 h-20 w-full rounded-lg object-cover ring-1 sm:w-36"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
          <Sparkles className="size-3" aria-hidden />
          Sponsored
        </span>
        <p
          className={cn(
            "font-heading mt-2.5 font-semibold",
            variant === "sidebar" && "text-sm",
          )}
        >
          {ad.title}
        </p>
        <p
          className={cn(
            "text-muted-foreground mt-1 text-sm leading-6",
            variant === "sidebar" && "text-xs leading-5",
          )}
        >
          {ad.body}
        </p>
        {ad.imageUrl && variant !== "banner" ? (
          <img
            src={ad.imageUrl}
            alt=""
            className="ring-border/60 mt-3 max-h-40 w-full rounded-lg object-cover ring-1"
            loading="lazy"
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCtaClick}
          className="focus-ring mt-3 border-amber-500/40 hover:border-amber-500/60"
        >
          {ad.ctaLabel}
          <ExternalLink className="size-3.5" aria-hidden />
        </Button>
      </div>
    </aside>
  );
  /* eslint-enable @next/next/no-img-element */
}
