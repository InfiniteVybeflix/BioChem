import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { BulkUploader } from "@/components/lecturer/bulk-uploader";
import { CsvImporter } from "@/components/lecturer/csv-importer";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Bulk upload · Lecturer",
  description: "Publish a zip of markdown notes and JSON questions, or import questions from CSV.",
};

/** Lecturer bulk upload page — zip ingestion plus CSV question import. */
export default async function LecturerBulkPage() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!can(auth.profile.role, "publish_content", auth.profile.staff_abilities ?? [])) redirect("/dashboard");

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="Bulk upload"
          description="Publish a zip of markdown notes and JSON questions, or import questions from CSV."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bulk upload"
        description="Publish whole content packs at once — a zip of markdown notes and JSON question files, or a CSV of questions."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass-card p-4 sm:p-6" aria-labelledby="bulk-zip-heading">
          <h2 id="bulk-zip-heading" className="font-heading text-lg font-semibold">
            Zip archive
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">
            Drop a .zip of <span className="font-mono">.md</span> notes and{" "}
            <span className="font-mono">.json</span> question files — everything publishes
            instantly.
          </p>
          <BulkUploader />
        </section>

        <section className="glass-card p-4 sm:p-6" aria-labelledby="bulk-csv-heading">
          <h2 id="bulk-csv-heading" className="font-heading text-lg font-semibold">
            CSV questions
          </h2>
          <p className="text-muted-foreground mt-1 mb-4 text-sm">
            Paste or upload a CSV of bank questions — one question per row with a header line.
          </p>
          <CsvImporter />
        </section>
      </div>
    </>
  );
}
