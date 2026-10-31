import type { Metadata } from "next";
import { PageHeader } from "@/components/common/ui-bits";
import { PublicHeader } from "@/components/layout/public-header";
import { SupportCenter } from "@/components/support/support-center";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { supportSettings } from "@/types/domain";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Contact the BioChem platform team — bug reports, complaints, questions and feedback.",
};

/**
 * Public support page. Signed-in users get the full desk (tickets +
 * replies in-app); guests can still send a message with an email.
 * The contact note is CMS-driven (site_settings → support).
 */
export default async function SupportPage() {
  const supabase = await getSupabaseServerClient();
  const auth = supabase ? await getAuthContext() : null;

  let contactNote: string | undefined;
  if (supabase) {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "support")
      .maybeSingle();
    contactNote = data ? supportSettings(data.value).contact_note : undefined;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PublicHeader />
      <PageHeader
        title="Support"
        description="Something broken? Something unfair? Something brilliant? Tell the team."
      />
      <SupportCenter signedIn={auth !== null} contactNote={contactNote} />
      <p className="text-muted-foreground/70 mt-8 text-center text-xs">
        BioChem — built by Aevibron.
      </p>
    </div>
  );
}
