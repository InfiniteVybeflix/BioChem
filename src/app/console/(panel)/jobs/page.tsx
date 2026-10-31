import {
  JobsConsole,
  type ConsoleEnquiry,
  type ConsoleJob,
} from "@/components/console/jobs-console";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Console — job board & enquiries.
 */
export default async function ConsoleJobsPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [{ data: jobs }, { data: enquiries }] = await Promise.all([
    admin
      .from("jobs")
      .select("id, title, org, location, type, status, created_at")
      .in("status", ["approved", "closed"])
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("job_enquiries")
      .select("id, message, status, created_at, jobs(title), profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const jobRows: ConsoleJob[] = (jobs ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    org: row.org,
    location: row.location,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
  }));

  const enquiryRows: ConsoleEnquiry[] = (enquiries ?? []).map((row) => ({
    id: row.id,
    studentName: row.profiles?.full_name ?? "Unknown",
    jobTitle: row.jobs?.title ?? "Unknown posting",
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  }));

  return <JobsConsole initialJobs={jobRows} initialEnquiries={enquiryRows} />;
}
