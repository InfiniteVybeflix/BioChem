import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";

/**
 * Console CSV export. GET ?type=users|attempts|notes|questions|
 * enquiries|tickets — streams a UTF-8 CSV with a BOM so Excel opens
 * it cleanly.
 */

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(","), ...rows.map((row) => row.map(csvEscape).join(","))];
  return `\uFEFF${lines.join("\r\n")}`;
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  const type = new URL(request.url).searchParams.get("type") ?? "users";
  let csv = "";
  const filename = `${type}.csv`;

  if (type === "users") {
    const { data } = await admin
      .from("profiles")
      .select(
        "full_name, role, approved, suspended, xp, streak_count, year_of_study, created_at, schools(name)",
      )
      .limit(10000);
    csv = toCsv(
      ["Name", "Role", "Approved", "Suspended", "XP", "Streak", "Year", "School", "Joined"],
      (data ?? []).map((row) => [
        row.full_name,
        row.role,
        row.approved ? "yes" : "no",
        row.suspended ? "yes" : "no",
        row.xp,
        row.streak_count,
        row.year_of_study,
        row.schools?.name ?? "",
        row.created_at,
      ]),
    );
  } else if (type === "attempts") {
    const { data } = await admin
      .from("exam_attempts")
      .select(
        "zone, mode, status, score, max_score, duration_seconds, submitted_at, profiles(full_name)",
      )
      .limit(20000);
    csv = toCsv(
      ["Student", "Zone", "Mode", "Status", "Score", "Max", "Seconds", "Submitted"],
      (data ?? []).map((row) => [
        row.profiles?.full_name ?? "",
        row.zone,
        row.mode,
        row.status,
        row.score,
        row.max_score,
        row.duration_seconds,
        row.submitted_at,
      ]),
    );
  } else if (type === "notes") {
    const { data } = await admin
      .from("notes")
      .select("title, status, views, reading_minutes, published_at, topics(title)")
      .limit(20000);
    csv = toCsv(
      ["Title", "Topic", "Status", "Views", "Reading minutes", "Published"],
      (data ?? []).map((row) => [
        row.title,
        row.topics?.title ?? "",
        row.status,
        row.views,
        row.reading_minutes,
        row.published_at,
      ]),
    );
  } else if (type === "questions") {
    const { data } = await admin
      .from("questions")
      .select("zone, difficulty, type, marks, status, stem_md, topics(title)")
      .limit(40000);
    csv = toCsv(
      ["Zone", "Topic", "Difficulty", "Type", "Marks", "Status", "Question"],
      (data ?? []).map((row) => [
        row.zone,
        row.topics?.title ?? "",
        row.difficulty,
        row.type,
        row.marks,
        row.status,
        row.stem_md,
      ]),
    );
  } else if (type === "enquiries") {
    const { data } = await admin
      .from("job_enquiries")
      .select("message, status, created_at, jobs(title), profiles(full_name)")
      .limit(10000);
    csv = toCsv(
      ["Student", "Job", "Status", "Message", "Sent"],
      (data ?? []).map((row) => [
        row.profiles?.full_name ?? "",
        row.jobs?.title ?? "",
        row.status,
        row.message,
        row.created_at,
      ]),
    );
  } else if (type === "tickets") {
    const { data } = await admin
      .from("support_tickets")
      .select("category, subject, status, email, message, created_at")
      .limit(10000);
    csv = toCsv(
      ["Category", "Subject", "Status", "Email", "Message", "Opened"],
      (data ?? []).map((row) => [
        row.category,
        row.subject,
        row.status,
        row.email,
        row.message,
        row.created_at,
      ]),
    );
  } else {
    return Response.json({ error: "Unknown export type" }, { status: 422 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
