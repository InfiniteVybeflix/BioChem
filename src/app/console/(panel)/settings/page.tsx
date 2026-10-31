import { CmsSettings, type CmsValues } from "@/components/console/cms-settings";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { brandingSettings, landingSettings, supportSettings } from "@/types/domain";

/**
 * Console — the CMS (live site content).
 */
export default async function ConsoleSettingsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const { data } = await admin.from("site_settings").select("key, value").limit(50);
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

  const initial: CmsValues = {
    branding: brandingSettings(byKey.get("branding")),
    landing: landingSettings(byKey.get("landing")),
    support: supportSettings(byKey.get("support")),
  };

  return <CmsSettings initial={initial} />;
}
