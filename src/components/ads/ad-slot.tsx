"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdPlacement } from "@/types/domain";
import { AdCard, type AdCardSize } from "@/components/ads/ad-card";

/**
 * Reusable sponsored-ad placement. Renders one clearly labelled card
 * (image, title, body, CTA) when the `ads_enabled` feature flag is on
 * and an enabled, in-flight ad targets this placement — otherwise
 * renders nothing at all.
 *
 * An ad can target SEVERAL placements at once (migration 00018): every
 * slot it lists renders the same card, sized per the ad's `size`
 * setting. Before the migration exists the slot transparently falls
 * back to the legacy single-placement column.
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
  ctaLabel: string;
  imageUrl: string | null;
  targetUrl: string;
  size: AdCardSize;
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

function normaliseSize(value: string | null | undefined): AdCardSize {
  return value === "compact" || value === "large" ? value : "standard";
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
        // Modern schema first: match against the multi-placement array.
        client
          .from("ads")
          .select("id, title, body, target_url, cta_label, image_url, size")
          .contains("placements", [placement])
          .eq("enabled", true)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      // Shared shape: `size` is absent on a pre-00018 database.
      let row:
        | {
            id: string;
            title: string;
            body: string;
            target_url: string;
            cta_label: string;
            image_url: string | null;
            size?: string | null;
          }
        | undefined = adsResult.data?.[0];
      let size = normaliseSize(row?.size);

      // Legacy fallback (pre-00018 database): the placements column doesn't
      // exist yet, so match the synced single-placement column instead.
      if (adsResult.error) {
        const legacy = await client
          .from("ads")
          .select("id, title, body, target_url, cta_label, image_url")
          .eq("placement", placement)
          .eq("enabled", true)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        size = "standard";
        row = legacy.data?.[0];
      }

      if (cancelled) return;
      // Ads default OFF when the flag row is missing (seed default: disabled).
      const adsOn = flagsResult.data?.enabled === true;
      if (!adsOn || !row) {
        setAd(null);
        return;
      }

      setAd({
        id: row.id,
        title: row.title,
        body: row.body,
        ctaLabel: row.cta_label,
        imageUrl: row.image_url ?? null,
        targetUrl: row.target_url,
        size,
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

  return (
    <AdCard
      ad={{ title: ad.title, body: ad.body, ctaLabel: ad.ctaLabel, imageUrl: ad.imageUrl }}
      variant={variantFor(placement)}
      size={ad.size}
      onCta={onCtaClick}
    />
  );
}
