import { ContentImporter } from "@/components/console/content-importer";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — bulk content import. Questions and notes arrive as CSV
 * (paste or file upload) or as an AI conversion of a PDF / Word /
 * PowerPoint / Excel document. Rows land in the exam bank and Explore
 * feed immediately; unknown topics can be auto-created on the way in.
 * Content can be aimed at a course unit (BIO 205 …) as well as a
 * topic/zone/school, and questions can ship with hidden answers.
 */
export default async function ConsoleImportPage() {
  const admin = getSupabaseAdminClient();

  const results = admin
    ? await Promise.all([
        admin.from("topics").select("slug, title, zone").order("title").limit(500),
        admin.from("schools").select("id, name").eq("is_active", true).order("name").limit(100),
        admin.from("units").select("id, code, name, school_id, year, semester").order("code"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const [{ data: topicRows }, { data: schoolRows }, unitsResult] = results;

  const topics = (topicRows ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    zone: row.zone,
  }));
  const schools = (schoolRows ?? []).map((row) => ({ id: row.id, name: row.name }));
  // The units table arrives with the units migration — degrade quietly
  // when it hasn't been applied yet.
  const units =
    unitsResult && "error" in unitsResult && !unitsResult.error
      ? (unitsResult.data ?? []).map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          school_id: row.school_id,
          year: row.year,
          semester: row.semester,
        }))
      : [];

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">Import content</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Bulk-load questions and notes from a CSV — or drop one (or many) documents and let the AI
        convert them one at a time. Choose where the content goes (topic, course unit, zone, school)
        below; rows land in the exam bank and Explore feed immediately. Invalid rows are reported
        per-row and never block the rest of the batch.
      </p>
      <div className="mt-4">
        <ContentImporter topics={topics} schools={schools} units={units} />
      </div>
    </div>
  );
}
