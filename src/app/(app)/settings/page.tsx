import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { ProfileForm } from "@/components/settings/profile-form";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { SupportCenter } from "@/components/support/support-center";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  description: "Profile, appearance and support for your BioChem account.",
};

/**
 * Settings page. The (app) layout already enforces sign-in; the defensive
 * auth check below keeps the page safe when rendered in parallel with it.
 */
export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title="Settings" description="Profile, appearance and support." />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const auth = await getAuthContext();
  if (!auth) redirect("/login");

  return (
    <section>
      <PageHeader
        title="Settings"
        description="Profile, appearance and support for your account."
      />
      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile" className="flex-1 sm:flex-none">
            Profile
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex-1 sm:flex-none">
            Appearance
          </TabsTrigger>
          <TabsTrigger value="support" className="flex-1 sm:flex-none">
            Support
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <div className="glass-card p-4 sm:p-6">
            <ProfileForm
              initialFullName={auth.profile.full_name}
              initialAvatarUrl={auth.profile.avatar_url}
              initialTimezone={auth.profile.timezone}
            />
          </div>
        </TabsContent>
        <TabsContent value="appearance" className="mt-6">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="support" className="mt-6">
          <SupportCenter />
        </TabsContent>
      </Tabs>
    </section>
  );
}
