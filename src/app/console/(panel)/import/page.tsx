import { ContentImporter } from "@/components/console/content-importer";

/**
 * Console — bulk content import. Questions and notes arrive as CSV
 * (paste or file upload) and are written through console-api/import.
 */
export default function ConsoleImportPage() {
  return (
    <div className="glass-card p-5">
      <h2 className="font-semibold">Import content</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Bulk-load questions and notes from a CSV — rows land in the exam bank and Explore feed
        immediately. Invalid rows are reported per-row and never block the rest of the batch.
      </p>
      <div className="mt-4">
        <ContentImporter />
      </div>
    </div>
  );
}
