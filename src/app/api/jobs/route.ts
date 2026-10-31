import { handleRoute, jsonError, jsonOk, requireUser } from "@/lib/api";
import { can } from "@/lib/rbac";
import { jobSchema } from "@/lib/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { NextResponse } from "next/server";

/**
 * /api/jobs — job board.
 *
 * GET  → public board feed: approved + closed jobs (sponsored first, then
 *        newest) with the poster's name. No auth required.
 * POST → staff-only (post_jobs capability): creates a *pending* job for admin
 *        review. Sponsored status is never settable from this endpoint.
 */

// NOTE: the shared Database type contract declares no FK relationship for
// jobs → profiles, so the poster's name is fetched with a second profiles
// query instead of an embedded select (same pattern as the community pages).
const JOB_FIELDS =
  "id, posted_by, title, org, location, type, description_md, contact, status, closes_at, is_sponsored, created_at";

export interface PublicJob {
  id: string;
  postedBy: string;
  title: string;
  org: string;
  location: string;
  type: "internship" | "entry" | "full_time";
  descriptionMd: string;
  contact: string;
  status: "pending" | "approved" | "rejected" | "closed";
  closesAt: string | null;
  isSponsored: boolean;
  createdAt: string;
  postedByName: string | null;
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const { data: rows, error } = await supabase
      .from("jobs")
      .select(JOB_FIELDS)
      .in("status", ["approved", "closed"])
      .order("is_sponsored", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return jsonError(`Could not load jobs: ${error.message}`, 500);

    const postedByIds = [...new Set((rows ?? []).map((row) => row.posted_by))];
    const { data: profileRows } = postedByIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", postedByIds)
      : { data: [] as { id: string; full_name: string }[] };
    const nameById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]));

    const jobs: PublicJob[] = (rows ?? []).map((row) => ({
      id: row.id,
      postedBy: row.posted_by,
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
      postedByName: nameById.get(row.posted_by) ?? null,
    }));
    return jsonOk({ jobs });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const auth = await requireUser();
    if (!auth.ok) return auth.response;

    // Deliberately checked separately (not via requireUser("post_jobs")) so
    // students attempting to post get an actionable message, not a bare 403.
    if (!can(auth.ctx.role, "post_jobs")) {
      return jsonError(
        "Job postings are created by lecturers and admins. Students can browse the board and enquire on roles instead.",
        403,
      );
    }

    const supabase = await getSupabaseServerClient();
    if (!supabase) return jsonError("Service temporarily unavailable", 503);

    const body: unknown = await req.json().catch(() => null);
    const parsed = jobSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid job details", 400);
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        posted_by: auth.ctx.userId,
        title: parsed.data.title,
        org: parsed.data.org,
        location: parsed.data.location,
        type: parsed.data.type,
        description_md: parsed.data.descriptionMd,
        contact: parsed.data.contact,
        closes_at: parsed.data.closesAt ?? null,
        status: "pending",
        is_sponsored: false,
      })
      .select("id")
      .single();

    if (error || !data) {
      return jsonError(`Could not submit the posting: ${error?.message ?? "unknown error"}`, 500);
    }

    return jsonOk({ job: { id: data.id } }, { status: 201 });
  });
}
