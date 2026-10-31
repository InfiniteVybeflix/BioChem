import { ModerationQueue } from "@/components/admin/moderation-queue";
import type {
  ModerationJob,
  ModerationReport,
  ModerationSubmission,
} from "@/components/admin/moderation-queue";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SubmissionType } from "@/types/domain";

/**
 * Console — the moderation queue: student submissions, job postings
 * and chat reports. Chat message bodies are end-to-end encrypted;
 * reports are actioned (message removed) without reading them.
 */
export default async function ConsoleModerationPage() {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return <p className="text-muted-foreground text-sm">Service unavailable.</p>;
  }

  const [{ data: submissions }, { data: jobs }, { data: reports }] = await Promise.all([
    admin
      .from("submissions")
      .select(
        "id, type, title, content_md, payload, created_at, profiles(full_name), topics(title)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100),
    admin
      .from("jobs")
      .select("id, title, org, location, created_at, profiles(full_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("chat_reports")
      .select(
        "id, reason, created_at, profiles(full_name), chat_messages(created_at, deleted_at, profiles(full_name))",
      )
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const submissionRows: ModerationSubmission[] = (submissions ?? []).map((row) => ({
    id: row.id,
    type: row.type as SubmissionType,
    title: row.title,
    contentMd: row.content_md,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    authorName: row.profiles?.full_name ?? "Unknown",
    topicTitle: row.topics?.title ?? null,
  }));

  const jobRows: ModerationJob[] = (jobs ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    org: row.org,
    location: row.location,
    createdAt: row.created_at,
    postedByName: row.profiles?.full_name ?? "Unknown",
  }));

  const reportRows: ModerationReport[] = (reports ?? []).map((row) => {
    const message = Array.isArray(row.chat_messages) ? row.chat_messages[0] : row.chat_messages;
    const sender = message?.profiles;
    const reporter = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      reason: row.reason,
      createdAt: row.created_at,
      reporterName: reporter?.full_name ?? "Unknown",
      messageBody: null,
      messageDeleted: Boolean(message?.deleted_at),
      messageAuthorName: sender?.full_name ?? "Unknown",
      messageCreatedAt: message?.created_at ?? row.created_at,
    };
  });

  return (
    <ModerationQueue
      initialSubmissions={submissionRows}
      initialJobs={jobRows}
      initialReports={reportRows}
    />
  );
}
