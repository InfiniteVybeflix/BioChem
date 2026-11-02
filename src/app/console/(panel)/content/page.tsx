import { ContentLibrary, type ContentTopicOption } from "@/components/console/content-library";
import type { UnitListRow } from "@/app/console-api/units/route";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — content library. Every note and question the importers
 * have created, searchable and filterable, with edit / move /
 * unpublish / delete on each row and bulk move + bulk delete on a
 * selection. This is where a wrongly-copied import gets corrected
 * without touching the CSVs.
 */
export default async function ConsoleContentPage() {
  const admin = getSupabaseAdminClient();

  let topics: ContentTopicOption[] = [];
  let units: UnitListRow[] = [];

  if (admin) {
    const [topicsResult, unitsResult] = await Promise.all([
      admin
        .from("topics")
        .select("id, title, slug, zone, unit_id, units(code, name)")
        .order("title")
        .limit(1000),
      admin
        .from("units")
        .select(
          "id, code, name, description, year, semester, order_index, is_active, school_id, schools(name, short_name), topics(count)",
        )
        .order("code"),
    ]);

    interface RawTopicRow {
      id: string;
      title: string;
      slug: string;
      zone: string;
      unit_id?: string | null;
      units?: { code?: string; name?: string } | null;
    }
    interface RawUnitRow {
      id: string;
      code: string;
      name: string;
      description: string | null;
      year: number;
      semester: number | null;
      order_index: number;
      is_active: boolean;
      school_id: string;
      schools?: { name?: string; short_name?: string } | null;
      topics?: { count: number }[];
    }

    topics = (topicsResult.data ?? []).map((row) => {
      const raw = row as RawTopicRow;
      return {
        id: raw.id,
        title: raw.title,
        slug: raw.slug,
        zone: raw.zone,
        unitId: raw.unit_id ?? null,
        unitCode: raw.units?.code ?? null,
        unitName: raw.units?.name ?? null,
      };
    });
    units = ((unitsResult.data ?? []) as unknown as RawUnitRow[]).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      schoolId: row.school_id,
      schoolName: row.schools?.name ?? "",
      schoolShort: row.schools?.short_name ?? "",
      year: row.year,
      semester: row.semester,
      orderIndex: row.order_index,
      isActive: row.is_active,
      topicsCount: row.topics?.[0]?.count ?? 0,
      notesCount: 0,
    }));
  }

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">Content library</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Everything you have imported — notes and questions — with search, filters and full control:
        edit a row, move wrongly-copied items to the right topic (one by one or in bulk), unpublish
        to hide without deleting, or delete outright. Deletions are permanent and remove the item
        from every student-facing page immediately.
      </p>
      <div className="mt-4">
        <ContentLibrary topics={topics} units={units} />
      </div>
    </div>
  );
}
