import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Awaiting activation",
  robots: { index: false, follow: false },
};

/**
 * Staff holding area — the account exists and signs in fine, but
 * publishing capability stays locked (enforced at the database level)
 * until the platform team activates it from the operations console.
 */
export default async function PendingApprovalPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login?next=/pending-approval");

  const profile = auth.profile;

  // Students don't belong here; staff who are approved go to work.
  if (profile.role !== "lecturer") redirect("/dashboard");
  if (profile.approved) redirect("/lecturer");

  return (
    <section className="mx-auto max-w-xl py-10">
      <div className="glass-card p-8 text-center">
        <span className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-2xl">
          <Clock3 className="size-7" aria-hidden />
        </span>
        <h1 className="font-display mt-4 text-xl font-semibold tracking-tight">
          Almost there, {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
          Your staff account is set up. The platform team activates new staff accounts after a quick
          review — usually within a day. You'll get a notification the moment it happens, and this
          screen will turn into the lecturer workspace.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/dashboard">Browse as a student meanwhile</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/support" className="gap-2">
              <LifeBuoy className="size-4" aria-hidden />
              Contact support
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
