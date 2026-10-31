import { z } from "zod";
import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { enquirySchema } from "@/lib/validation";
import { notifyUsers } from "@/lib/push";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";

/**
 * /api/jobs/[id]/enquire — students (and admins) send an enquiry message to
 * the poster of an approved job. The enquiry row is written with the caller's
 * RLS client; the poster is then notified in-app + via web push using the
 * service-role client (notifications bypass RLS by design).
 */

const jobIdSchema = z.string().uuid();

interface JobLite {
  id: string;
  posted_by: string;
  status: string;
}

async function fetchJob(jobId: string): Promise<JobLite | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("jobs")
    .select("id, posted_by, status")
    .eq("id", jobId)
    .maybeSingle();
  if (data) return data;

  // RLS edge case (e.g. a staff-visible posting): fall back to the admin client.
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data: adminRow } = await admin
    .from("jobs")
    .select("id, posted_by, status")
    .eq("id", jobId)
    .maybeSingle();
  return adminRow ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser("enquire_jobs");
    if (!auth.ok) return auth.response;

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { id } = await params;
    if (!jobIdSchema.safeParse(id).success) return jsonError("Invalid job id", 400);

    const body: unknown = await req.json().catch(() => null);
    const parsed = enquirySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid message", 400);
    }

    const job = await fetchJob(id);
    if (!job) return jsonError("Job not found", 404);
    if (job.status !== "approved") {
      return jsonError("This position is no longer accepting enquiries", 400);
    }

    const { error } = await supabase.from("job_enquiries").insert({
      job_id: job.id,
      user_id: auth.ctx.userId,
      message: parsed.data.message,
      status: "sent",
    });
    if (error) return jsonError(`Could not send your enquiry: ${error.message}`, 500);

    await notifyUsers([job.posted_by], "jobs", {
      title: "New job enquiry",
      body: parsed.data.message.slice(0, 100),
      link: "/jobs",
    });

    return jsonOk({ ok: true });
  });
}
