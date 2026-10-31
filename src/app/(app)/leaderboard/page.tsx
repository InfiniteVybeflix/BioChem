import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { Leaderboard, type LeaderboardEntry } from "@/components/community/leaderboard";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Leaderboard — BioChem" };

interface EntryRow {
  user_id: string;
  points: number;
  contributions: number;
}

interface ProfileRow {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Leaderboard: top students by XP — all-time and the current month. The
 * monthly rollup is refreshed on visit (fire-and-forget) before the rows are
 * read; both periods are public (RLS: leaderboard_select_all).
 */
export default async function LeaderboardPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Leaderboard"
          description="Top BioChem students by XP — all time and this month."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Keep the monthly rollup fresh — best effort, never blocks the page.
  void Promise.resolve(supabase.rpc("refresh_monthly_leaderboard"))
    .then(() => undefined)
    .catch(() => undefined);

  const [{ data: allTimeRows }, { data: monthRows }] = await Promise.all([
    supabase
      .from("leaderboard_entries")
      .select("user_id, points, contributions")
      .eq("period", "all_time")
      .order("points", { ascending: false })
      .limit(20),
    supabase
      .from("leaderboard_entries")
      .select("user_id, points, contributions")
      .eq("period", period)
      .order("points", { ascending: false })
      .limit(20),
  ]);

  const userIds = [
    ...new Set([...(allTimeRows ?? []), ...(monthRows ?? [])].map((row) => row.user_id)),
  ];
  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
    : { data: [] as ProfileRow[] };

  const profilesById = new Map<string, ProfileRow>(
    (profileRows ?? []).map((profile) => [profile.id, profile]),
  );

  const toEntries = (rows: EntryRow[] | null): LeaderboardEntry[] =>
    (rows ?? []).map((row) => {
      const profile = profilesById.get(row.user_id);
      return {
        userId: row.user_id,
        name: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        points: row.points,
        contributions: row.contributions,
      };
    });

  const auth = await getAuthContext();

  return (
    <>
      <PageHeader
        title="Leaderboard"
        description="Top BioChem students by XP — all time and this month."
      />
      <Leaderboard
        allTime={toEntries(allTimeRows)}
        month={toEntries(monthRows)}
        currentUserId={auth?.user.id ?? null}
        monthLabel={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      />
    </>
  );
}
