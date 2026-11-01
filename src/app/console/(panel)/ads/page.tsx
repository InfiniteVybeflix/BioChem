import { AdsManager } from "@/components/admin/ads-manager";
import type { AdRow, FlagRow } from "@/components/admin/ads-manager";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdPlacement } from "@/types/domain";

/**
 * Console — feature flags (the live on/off switches for every module)
 * and sponsored placements.
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

  const adRows: AdRow[] = (ads ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    placement: row.placement as AdPlacement,
    targetUrl: row.target_url,
    imageUrl: row.image_url,
    ctaLabel: row.cta_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    impressions: row.impressions,
    clicks: row.clicks,
    enabled: row.enabled,
  }));

  return <AdsManager initialFlags={flagRows} initialAds={adRows} />;
}
