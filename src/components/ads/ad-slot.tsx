"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdPlacement } from "@/types/domain";

/**
 * Reusable sponsored-ad placement. Renders one clearly labelled glass card
 * (title, body, CTA) when the `ads_enabled` feature flag is on and an enabled,
 * in-flight ad exists for the placement — otherwise renders nothing at all.
 *
 * Impressions are recorded once per ad per browser session; clicks are always
 * recorded before the target URL opens.
 */

interface AdRow {
  id: string;
  title: string;
  body: string;
  targetUrl: string;
  ctaLabel: string;
}

const SEEN_KEY_PREFIX = "biochem:ad-seen-";

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
          .select("id, title, body, target_url, cta_label")
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
      if (!adsOn || !row) return;

      setAd({
        id: row.id,
        title: row.title,
        body: row.body,
        targetUrl: row.target_url,
        ctaLabel: row.cta_label,
      });
    };

    void load();
    return () => {
      cancelled = true;
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
    <aside
      className="glass-card max-w-2xl border-amber-500/30 p-4 sm:p-5"
      aria-label="Sponsored placement"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
        <Sparkles className="size-3" aria-hidden />
        Sponsored
      </span>
      <p className="font-heading mt-2.5 font-semibold">{ad.title}</p>
      <p className="text-muted-foreground mt-1 text-sm leading-6">{ad.body}</p>
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
    </aside>
  );
}
