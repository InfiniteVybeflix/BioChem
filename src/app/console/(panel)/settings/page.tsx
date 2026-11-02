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
 *
 * Every query is defensive: a failed piece (usually a migration that
 * hasn't been applied) degrades that tab with a clear inline warning
 * instead of blanking the whole CMS page.
 */

interface TopicRowWithCounts {
  id: string;
  title: string;
  slug: string;
  zone: string;
  description: string | null;
  order_index: number;
  notes?: { count: number }[];
  questions?: { count: number }[];
}

type TopicRowPlain = Omit<TopicRowWithCounts, "notes" | "questions">;

function zoneOf(zone: string): "cat1" | "cat2" | "main" {
  return zone === "cat1" ? "cat1" : zone === "cat2" ? "cat2" : "main";
}

export default async function ConsoleSettingsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [settingsResult, featuresResult, topicsResult, flagsResult] = await Promise.all([
    admin.from("site_settings").select("key, value").limit(50),
    admin
      .from("site_features")
      .select("id, icon, title, description, href, enabled, order_index")
      .order("order_index")
      .order("created_at"),
    // Counts come from embedded aggregates; if the relationship can't
    // be resolved (or a migration is pending) fall back to a plain
    // select so the Topics tab still renders.
    admin
      .from("topics")
      .select("id, title, slug, zone, description, order_index, notes(count), questions(count)")
      .order("order_index")
      .order("title"),
    admin.from("feature_flags").select("key, enabled, description").order("key"),
  ]);

  let topicRows: (TopicRowWithCounts | TopicRowPlain)[] = topicsResult.data ?? [];
  if (topicsResult.error) {
    const fallback = await admin
      .from("topics")
      .select("id, title, slug, zone, description, order_index")
      .order("order_index")
      .order("title");
    topicRows = fallback.data ?? [];
  }
  const topicsWarned = topicsResult.error && !topicsResult.error.message.includes("does not exist");

  const featuresWarned =
    featuresResult.error && !featuresResult.error.message.includes("does not exist");
  const flagsWarned =
    flagsResult.error && !flagsResult.error.message.includes("does not exist");
  const settingsWarned =
    settingsResult.error && !settingsResult.error.message.includes("does not exist");

  const byKey = new Map((settingsResult.data ?? []).map((row) => [row.key, row.value]));

  const initial: CmsValues = {
    branding: brandingSettings(byKey.get("branding")),
    landing: landingSettings(byKey.get("landing")),
    support: supportSettings(byKey.get("support")),
  };

  const featureList = (featuresResult.data ?? []).map((row) => ({
    id: row.id,
    icon: row.icon,
    title: row.title,
    description: row.description,
    href: row.href,
    enabled: row.enabled,
    orderIndex: row.order_index,
  }));

  const topicList = topicRows.map((row) => {
    const withCounts = row as TopicRowWithCounts;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      zone: zoneOf(row.zone),
      description: row.description,
      orderIndex: row.order_index,
      notesCount: withCounts.notes?.[0]?.count ?? 0,
      questionsCount: withCounts.questions?.[0]?.count ?? 0,
    };
  });

  const flags: FeatureFlagRow[] = (flagsResult.data ?? [])
    .filter((row) => row.key !== "ads_enabled")
    .map((row) => ({ key: row.key, enabled: row.enabled, description: row.description }));

  const warnings = [
    featuresWarned ? `Landing features couldn't load: ${featuresResult.error?.message}` : null,
    topicsWarned ? `Topics couldn't load: ${topicsResult.error?.message}` : null,
    flagsWarned ? `Module switches couldn't load: ${flagsResult.error?.message}` : null,
    settingsWarned ? `CMS values couldn't load: ${settingsResult.error?.message}` : null,
  ].filter((warning): warning is string => warning !== null);

  return (
    <div className="space-y-3">
      {warnings.length > 0 ? (
        <div className="border-amber-500/40 bg-amber-500/10 rounded-lg border p-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-300">
            Some CMS data couldn&apos;t load
          </p>
          <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-2 text-xs">
            Open <strong>System → Database setup</strong> in the console nav and run the one-click
            SQL if any table is reported missing.
          </p>
        </div>
      ) : null}
      <CmsSettings
        initial={initial}
        featuresSlot={<FeaturesManager initialFeatures={featureList} initialFlags={flags} />}
        topicsSlot={<TopicsManager initial={topicList} />}
      />
    </div>
  );
}
