import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, FolderTree, GraduationCap, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { UnitFilters } from "@/components/units/unit-filters";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Course units",
  description:
    "Your course units — BIO 205, MIC 205 and every other unit — scoped to your school and study year, with the notes filed inside.",
};

interface UnitCard {
  id: string;
  code: string;
  name: string;
  description: string | null;
  year: number;
  semester: number | null;
  schoolId: string;
  schoolName: string;
  schoolShort: string;
  topicsCount: number;
  notesCount: number;
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Course units — the student-facing catalogue. Defaults to the signed-in
 * student's own school + study year (from their profile); the pickers
 * switch to any other school/year. Each unit opens its own page with the
 * topics and published notes inside.
 */
export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Course units"
          description="Open your unit — BIO 205, MIC 205 — and read the notes filed inside."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const [auth, query] = await Promise.all([getAuthContext(), searchParams]);

  // Defaults: the student's own school + year from onboarding.
  const defaultSchool = auth?.profile.school_id ?? null;
  const defaultYear = auth?.profile.year_of_study ?? null;

  const schoolParam = firstParam(query.school);
  const yearParam = firstParam(query.year);
  // An explicit ?school=all / ?year=all overrides the profile defaults;
  // with no params at all the page personalises to the student's own
  // school + study year.
  const activeSchool =
    schoolParam === "all" ? "all" : (schoolParam ?? defaultSchool ?? "all");
  const activeYear =
    yearParam === "all"
      ? "all"
      : (yearParam ??
        (defaultYear && defaultYear >= 1 && defaultYear <= 8 ? String(defaultYear) : "all"));

  const [unitsResult, schoolsResult] = await Promise.all([
    supabase
      .from("units")
      .select(
        "id, code, name, description, year, semester, order_index, school_id, schools(name, short_name), topics(count)",
      )
      .eq("is_active", true)
      .order("school_id")
      .order("year")
      .order("order_index")
      .order("code"),
    supabase.from("schools").select("id, name, short_name").eq("is_active", true).order("name"),
  ]);

  if (unitsResult.error) {
    return (
      <section>
        <PageHeader
          title="Course units"
          description="Open your unit — BIO 205, MIC 205 — and read the notes filed inside."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  // Published-note counts per unit: topics carry unit_id; the embedded
  // notes(count) is filtered by RLS (students count published notes).
  const notesByUnit = new Map<string, number>();
  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, unit_id, notes(count)")
    .not("unit_id", "is", null);
  for (const topic of topicRows ?? []) {
    if (!topic.unit_id) continue;
    const count = (topic.notes as { count: number }[] | null)?.[0]?.count ?? 0;
    notesByUnit.set(topic.unit_id, (notesByUnit.get(topic.unit_id) ?? 0) + count);
  }

  interface RawUnitRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    year: number;
    semester: number | null;
    school_id: string;
    schools?: { name?: string; short_name?: string } | null;
    topics?: { count: number }[];
  }

  const allUnits: UnitCard[] = ((unitsResult.data ?? []) as unknown as RawUnitRow[]).map(
    (row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      year: row.year,
      semester: row.semester,
      schoolId: row.school_id,
      schoolName: row.schools?.name ?? "",
      schoolShort: row.schools?.short_name ?? "",
      topicsCount: row.topics?.[0]?.count ?? 0,
      notesCount: notesByUnit.get(row.id) ?? 0,
    }),
  );

  const filtered = allUnits.filter(
    (unit) =>
      (activeSchool === "all" || unit.schoolId === activeSchool) &&
      (activeYear === "all" || unit.year === Number(activeYear)),
  );

  // Group school → year (mirrors how the CMS lists them).
  const grouped = new Map<string, Map<number, UnitCard[]>>();
  for (const unit of filtered) {
    let years = grouped.get(unit.schoolId);
    if (!years) {
      years = new Map<number, UnitCard[]>();
      grouped.set(unit.schoolId, years);
    }
    const list = years.get(unit.year) ?? [];
    list.push(unit);
    years.set(unit.year, list);
  }

  const schools = (schoolsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
  }));
  // The student's own school stays selectable even if it was deactivated
  // (the embedded school rides along on the profile).
  const ownSchool = auth?.profile.schools as
    | { id: string; name: string; short_name: string }
    | null
    | undefined;
  if (ownSchool?.id && !schools.some((school) => school.id === ownSchool.id)) {
    schools.push({ id: ownSchool.id, name: ownSchool.name, shortName: ownSchool.short_name });
  }
  const years = [...new Set(allUnits.map((unit) => unit.year))].sort((a, b) => a - b);

  const personalising =
    activeSchool !== "all" && activeYear !== "all"
      ? (() => {
          const school = schools.find((entry) => entry.id === activeSchool);
          const name = school?.name ?? "your school";
          return `${name} · Year ${activeYear}`;
        })()
      : null;

  return (
    <section>
      <PageHeader
        title="Course units"
        description={
          personalising
            ? `Showing the units for ${personalising} — open yours and read the notes inside. Switch school or year any time.`
            : "Every unit the platform carries, scoped to a school and a study year. Open your unit and read the notes inside."
        }
      />

      <div className="mb-6">
        <UnitFilters
          schools={schools}
          years={years}
          activeSchool={activeSchool}
          activeYear={activeYear}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-6" aria-hidden />}
          title="No units here yet"
          description={
            activeSchool === "all" || activeYear === "all"
              ? "No units have been added for this view yet — the admin adds units in the console CMS (Units tab)."
              : "Your school's units for this year haven't been added yet — the admin adds them in the console CMS (Units tab). Try “All years” meanwhile."
          }
        />
      ) : (
        <div className="space-y-8">
          {[...grouped.entries()].map(([schoolId, yearsMap]) => {
            const school = schools.find((entry) => entry.id === schoolId);
            const schoolName =
              school?.name ??
              [...yearsMap.values()].flat().find((unit) => unit.schoolId === schoolId)?.schoolName ??
              "School";
            return (
              <div key={schoolId}>
                <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                  <School className="size-3.5" aria-hidden />
                  {school?.shortName || schoolName}
                  <span className="text-muted-foreground/60">· {schoolName}</span>
                </p>
                <div className="space-y-6">
                  {[...yearsMap.entries()]
                    .sort((a, b) => a[0] - b[0])
                    .map(([year, units]) => (
                      <div key={year}>
                        <p className="text-muted-foreground/80 mb-2 text-xs font-medium">
                          Year {year}
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {units.map((unit) => (
                            <Link
                              key={unit.id}
                              href={`/units/${unit.id}`}
                              className="glass-card group hover:border-primary/40 focus-ring flex flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none sm:p-5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <Badge variant="secondary" className="font-mono text-[11px]">
                                  {unit.code}
                                </Badge>
                                {unit.semester ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    Sem {unit.semester}
                                  </Badge>
                                ) : null}
                              </div>
                              <h3 className="font-heading group-hover:text-primary mt-3 text-base leading-snug font-semibold transition-colors sm:text-lg">
                                {unit.name}
                              </h3>
                              {unit.description ? (
                                <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm leading-6">
                                  {unit.description}
                                </p>
                              ) : null}
                              <div className="text-muted-foreground mt-auto flex items-center gap-3 pt-4 text-xs">
                                <span className="flex items-center gap-1">
                                  <FolderTree className="size-3.5" aria-hidden />
                                  {unit.topicsCount} {unit.topicsCount === 1 ? "topic" : "topics"}
                                </span>
                                <span className="flex items-center gap-1">
                                  <BookOpen className="size-3.5" aria-hidden />
                                  {unit.notesCount} {unit.notesCount === 1 ? "note" : "notes"}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
