import { CmsSettings, type CmsValues } from "@/components/console/cms-settings";
import { FeaturesManager, type FeatureFlagRow } from "@/components/console/features-manager";
import { TopicsManager } from "@/components/console/topics-manager";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { brandingSettings, landingSettings, supportSettings } from "@/types/domain";

/**
 * Console — the CMS (live site content). Besides the branding / landing /
 * support copy, the CMS owns the landing-page feature cards, the module
 * switches and the content topic tree (the importers resolve every row's
 * topic against it).
 */
export default async function ConsoleSettingsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [{ data }, { data: featureRows }, { data: topicRows }, { data: flagRows }] =
    await Promise.all([
      admin.from("site_settings").select("key, value").limit(50),
      admin
        .from("site_features")
        .select("id, icon, title, description, href, enabled, order_index")
        .order("order_index")
        .order("created_at"),
      admin
        .from("topics")
        .select("id, title, slug, zone, description, order_index, notes(count), questions(count)")
        .order("order_index")
        .order("title"),
      admin.from("feature_flags").select("key, enabled, description").order("key"),
    ]);

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

  const initial: CmsValues = {
    branding: brandingSettings(byKey.get("branding")),
    landing: landingSettings(byKey.get("landing")),
    support: supportSettings(byKey.get("support")),
  };

  const featureList = (featureRows ?? []).map((row) => ({
    id: row.id,
    icon: row.icon,
    title: row.title,
    description: row.description,
    href: row.href,
    enabled: row.enabled,
    orderIndex: row.order_index,
  }));

  const topicList = (topicRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    zone:
      row.zone === "cat1" ? ("cat1" as const) : row.zone === "cat2" ? ("cat2" as const) : ("main" as const),
    description: row.description,
    orderIndex: row.order_index,
    notesCount: row.notes?.[0]?.count ?? 0,
    questionsCount: row.questions?.[0]?.count ?? 0,
  }));

  const flags: FeatureFlagRow[] = (flagRows ?? [])
    .filter((row) => row.key !== "ads_enabled")
    .map((row) => ({ key: row.key, enabled: row.enabled, description: row.description }));

  return (
    <CmsSettings
      initial={initial}
      featuresSlot={<FeaturesManager initialFeatures={featureList} initialFlags={flags} />}
      topicsSlot={<TopicsManager initial={topicList} />}
    />
  );
}
