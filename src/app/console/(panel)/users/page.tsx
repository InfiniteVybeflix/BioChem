import { UsersTable, type AdminUserRow } from "@/components/admin/users-table";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — user directory. Loads the first 1000 profiles (school
 * names joined) and hands them to the interactive table.
 */
export default async function ConsoleUsersPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id, full_name, role, xp, streak_count, suspended, approved, school_id, year_of_study, created_at, last_active_date, schools(name)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: emails } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map((emails?.users ?? []).map((user) => [user.id, user.email ?? ""]));

  const rows: AdminUserRow[] = (profiles ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
    email: emailById.get(profile.id) ?? "",
    role: profile.role,
    xp: profile.xp,
    streak: profile.streak_count,
    suspended: profile.suspended,
    approved: profile.approved,
    schoolName: profile.schools?.name ?? null,
    yearOfStudy: profile.year_of_study,
    createdAt: profile.created_at,
    lastActiveDate: profile.last_active_date,
  }));

  return <UsersTable initialUsers={rows} />;
}
