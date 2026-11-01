import { AdsManager, type AdRow, type FlagRow } from "@/components/admin/ads-manager";
import type { AdCardSize } from "@/components/ads/ad-card";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdPlacement } from "@/types/domain";

/**
 * Console — feature flags (the live on/off switches for every module)
 * and sponsored placements. Rows are normalised so the manager works
 * both before and after migration 00018 (placements / size columns).
 */
export default async function ConsoleAdsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [{ data: flags }, { data: ads }] = await Promise.all([
    admin.from("feature_flags").select("*").order("key"),
    admin.from("ads").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const flagRows: FlagRow[] = (flags ?? []).map((row) => ({
    key: row.key,
    enabled: row.enabled,
    description: row.description,
  }));

  const VALID_PLACEMENTS: readonly AdPlacement[] = [
    "banner",
    "sidebar",
    "jobs",
    "events",
    "resources",
  ];

  const adRows: AdRow[] = (ads ?? []).map((row) => {
    const record = row as {
      placement: string;
      placements?: string[] | null;
      size?: string | null;
      [key: string]: unknown;
    };
    const fromArray = (record.placements ?? []).filter((value): value is AdPlacement =>
      (VALID_PLACEMENTS as string[]).includes(value),
    );
    const placements: AdPlacement[] =
      fromArray.length > 0
        ? fromArray
        : (VALID_PLACEMENTS as string[]).includes(record.placement)
          ? [record.placement as AdPlacement]
          : ["banner"];
    const size: AdCardSize =
      record.size === "compact" || record.size === "large" ? record.size : "standard";
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      placements,
      size,
      targetUrl: row.target_url,
      imageUrl: row.image_url,
      ctaLabel: row.cta_label,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      impressions: row.impressions,
      clicks: row.clicks,
      enabled: row.enabled,
    };
  });

  return <AdsManager initialFlags={flagRows} initialAds={adRows} />;
}
