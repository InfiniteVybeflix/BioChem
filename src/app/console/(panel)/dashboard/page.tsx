import Link from "next/link";
import { CalendarClock, Flag, LifeBuoy, Users } from "lucide-react";
import { GatewayHealth } from "@/components/admin/gateway-health";
import { StatCard } from "@/components/common/ui-bits";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminBasePath } from "@/lib/admin/session";

/** Yesterday's date-string (UTC) for the 24h-active filter. */
function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Console overview — the numbers that matter today. Deep links go to
 * the other console sections via the obscure base path.
 */
export default async function ConsoleDashboardPage() {
  const admin = getSupabaseAdminClient();

  const [users, pendingStaff, openTickets, pendingSubmissions, pendingJobs, activeToday] =
    await Promise.all([
      admin
        ? admin.from("profiles").select("id", { count: "exact", head: true })
        : Promise.resolve({ count: 0 }),
      admin
        ? admin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "lecturer")
            .eq("approved", false)
        : Promise.resolve({ count: 0 }),
      admin
        ? admin
            .from("support_tickets")
            .select("id", { count: "exact", head: true })
            .eq("status", "open")
        : Promise.resolve({ count: 0 }),
      admin
        ? admin
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      admin
        ? admin.from("jobs").select("id", { count: "exact", head: true }).eq("status", "pending")
        : Promise.resolve({ count: 0 }),
      admin
        ? admin
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("last_active_date", yesterday())
        : Promise.resolve({ count: 0 }),
    ]);

  const base = adminBasePath();
  const needsAttention =
    (pendingStaff.count ?? 0) +
    (openTickets.count ?? 0) +
    (pendingSubmissions.count ?? 0) +
    (pendingJobs.count ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total users"
          value={users.count ?? 0}
          hint={`${activeToday.count ?? 0} active in the last 24h`}
          icon={<Users className="size-4" aria-hidden />}
        />
        <StatCard
          label="Awaiting your action"
          value={needsAttention}
          hint="Staff approvals, moderation, tickets, jobs"
          icon={<Flag className="size-4" aria-hidden />}
          tone={needsAttention > 0 ? "amber" : "default"}
        />
        <StatCard
          label="Open support tickets"
          value={openTickets.count ?? 0}
          hint="Users waiting on a reply"
          icon={<LifeBuoy className="size-4" aria-hidden />}
          tone={(openTickets.count ?? 0) > 0 ? "amber" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="size-4" aria-hidden /> Jump to
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { href: `${base}/users`, label: "Approve staff & users" },
              { href: `${base}/moderation`, label: "Moderation queue" },
              { href: `${base}/schools`, label: "Schools & academic year" },
              { href: `${base}/settings`, label: "CMS — site content" },
              { href: `${base}/support`, label: "Support inbox" },
              { href: `${base}/broadcast`, label: "Broadcast" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="bg-muted/40 hover:bg-muted rounded-lg px-3 py-2 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <GatewayHealth />
      </div>
    </div>
  );
}
