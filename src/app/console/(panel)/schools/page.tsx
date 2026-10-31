import { SchoolsManager, type SchoolRow } from "@/components/console/schools-manager";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — schools & the academic-year timeline.
 */
export default async function ConsoleSchoolsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const { data: schools } = await admin
    .from("schools")
    .select(
      "id, name, short_name, country, max_years, current_academic_year, year_advance_at, is_active",
    )
    .order("created_at", { ascending: true })
    .limit(200);

  const { data: counts } = await admin
    .from("profiles")
    .select("school_id")
    .eq("role", "student")
    .limit(10000);

  const studentsBySchool = new Map<string, number>();
  for (const row of counts ?? []) {
    if (row.school_id) {
      studentsBySchool.set(row.school_id, (studentsBySchool.get(row.school_id) ?? 0) + 1);
    }
  }

  const rows: SchoolRow[] = (schools ?? []).map((school) => ({
    id: school.id,
    name: school.name,
    shortName: school.short_name,
    country: school.country,
    maxYears: school.max_years,
    currentAcademicYear: school.current_academic_year,
    yearAdvanceAt: school.year_advance_at,
    isActive: school.is_active,
    students: studentsBySchool.get(school.id) ?? 0,
  }));

  return <SchoolsManager initialSchools={rows} />;
}
