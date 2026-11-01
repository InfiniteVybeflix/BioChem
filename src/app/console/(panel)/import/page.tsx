import { ContentImporter } from "@/components/console/content-importer";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — bulk content import. Questions and notes arrive as CSV
 * (paste or file upload) or as an AI conversion of a PDF / Word /
 * PowerPoint / Excel document. Rows land in the exam bank and Explore
 * feed immediately; unknown topics can be auto-created on the way in.
 */
export default async function ConsoleImportPage() {
  const admin = getSupabaseAdminClient();

  const [{ data: topicRows }, { data: schoolRows }] = admin
    ? await Promise.all([
        admin.from("topics").select("slug, title, zone").order("title").limit(500),
        admin.from("schools").select("id, name").eq("is_active", true).order("name").limit(100),
      ])
    : [{ data: null }, { data: null }];

  const topics = (topicRows ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    zone: row.zone,
  }));
  const schools = (schoolRows ?? []).map((row) => ({ id: row.id, name: row.name }));

  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">Import content</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Bulk-load questions and notes from a CSV — or drop a document and let the AI convert it.
        Choose where the content goes (topic, zone, school) below; rows land in the exam bank and
        Explore feed immediately. Invalid rows are reported per-row and never block the rest of the
        batch.
      </p>
      <div className="mt-4">
        <ContentImporter topics={topics} schools={schools} />
      </div>
    </div>
  );
}
