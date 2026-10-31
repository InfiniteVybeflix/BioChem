import type { Metadata } from "next";
import { Briefcase, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { JobBoard } from "@/components/jobs/job-board";
import type { BoardJob } from "@/components/jobs/job-card";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Job board — BioChem",
  description:
    "Internships, entry-level and graduate roles posted by lecturers and department partners — enquire directly from the board.",
};

const JOB_FIELDS =
  "id, posted_by, title, org, location, type, description_md, contact, status, closes_at, is_sponsored, created_at";

/**
 * Job board page. The approved + closed board feed is rendered server-side;
 * the client component adds filtering, sponsored placement gating, enquiries,
 * posting (staff) and the admin review panel. Gated on the `job_board` flag.
 */
export default async function JobsPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader
          title="Job board"
          description="Internships, attachment opportunities and graduate roles for biochemistry students."
        />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const [{ data: flagRow }, { data: jobRows }] = await Promise.all([
    supabase.from("feature_flags").select("enabled").eq("key", "job_board").maybeSingle(),
    supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .in("status", ["approved", "closed"])
      .order("is_sponsored", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // The board is on by default; admins can switch it off platform-wide.
  const jobBoardEnabled = flagRow?.enabled ?? true;

  if (!jobBoardEnabled) {
    return (
      <section>
        <PageHeader
          title="Job board"
          description="Internships, attachment opportunities and graduate roles for biochemistry students."
        />
        <Alert>
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>The job board is switched off</AlertTitle>
          <AlertDescription>
            An admin has temporarily disabled the board. Check back soon — or ask your course rep
            when it will be back.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  // Poster names come from a second profiles query (the shared type contract
  // declares no jobs → profiles relationship, so embedded selects can't be
  // typed — same pattern as the community pages).
  const postedByIds = [...new Set((jobRows ?? []).map((row) => row.posted_by))];
  const { data: profileRows } = postedByIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", postedByIds)
    : { data: [] as { id: string; full_name: string }[] };
  const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));

  const jobs: BoardJob[] = (jobRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    org: row.org,
    location: row.location,
    type: row.type,
    descriptionMd: row.description_md,
    contact: row.contact,
    status: row.status,
    closesAt: row.closes_at,
    isSponsored: row.is_sponsored,
    createdAt: row.created_at,
    postedByName: nameById.get(row.posted_by) ?? "Department poster",
  }));

  return (
    <section>
      <PageHeader
        title="Job board"
        description="Internships, attachment opportunities and graduate roles posted by lecturers and department partners — enquire directly."
      />
      <JobBoard initialJobs={jobs} />
      <p className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
        <Briefcase className="size-3.5 shrink-0" aria-hidden />
        Every posting is reviewed by an admin before it goes live. Enquiries go straight to the
        poster — treat them like a professional email.
      </p>
    </section>
  );
}
