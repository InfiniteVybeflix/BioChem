import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { slugify } from "@/lib/content/schema";
import { XP_RULES } from "@/lib/xp";
import { notifyUsers } from "@/lib/push";
import { questionOptions, toJson, type NotificationType } from "@/types/domain";

/**
 * Console moderation endpoint — the three queues:
 *
 *   { submissionId, action: approve | reject, reviewNotes }
 *       approve → publishes the underlying content (note / question),
 *                 notifies the author and awards XP in one transaction.
 *   { jobId, action: approve | reject, reviewNotes }
 *   { reportId, action: resolve | dismiss }
 *       resolve → the reported chat message is removed (soft-deleted).
 *                 Its body is encrypted; moderation removes it unread.
 */

const schema = z.object({
  submissionId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  action: z.enum(["approve", "reject", "resolve", "dismiss"]),
  reviewNotes: z.string().max(1000).optional(),
});

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

async function notify(
  _admin: AdminClient,
  userId: string,
  title: string,
  body: string,
  link: string | null,
): Promise<void> {
  try {
    await notifyUsers([userId], "system" as NotificationType, {
      title,
      body,
      link: link ?? undefined,
    });
  } catch {
    // Notification failures must never block the moderation action.
  }
}

async function awardXp(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  const { data: profile } = await admin
    .from("profiles")
    .select("xp")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;

  const { data: entry } = await admin
    .from("leaderboard_entries")
    .select("points")
    .eq("user_id", userId)
    .eq("period", "all_time")
    .maybeSingle();

  await admin.from("xp_events").insert({ user_id: userId, amount, reason });
  await admin
    .from("profiles")
    .update({ xp: profile.xp + amount, updated_at: new Date().toISOString() })
    .eq("id", userId);
  await admin.from("leaderboard_entries").upsert(
    {
      user_id: userId,
      period: "all_time",
      points: (entry?.points ?? 0) + amount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,period" },
  );
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 422 });
  const { submissionId, jobId, reportId, action, reviewNotes } = parsed.data;

  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ error: "Service unavailable" }, { status: 503 });

  // ---------------- submissions ----------------
  if (submissionId) {
    const { data: submission } = await admin
      .from("submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (!submission) return Response.json({ error: "Submission not found" }, { status: 404 });

    if (action === "reject") {
      await admin
        .from("submissions")
        .update({
          status: "rejected",
          review_notes: reviewNotes ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      await notify(
        admin,
        submission.user_id,
        "Your submission wasn't approved",
        reviewNotes ??
          "It didn't meet the publishing bar — check the contribution guide and try again.",
        null,
      );
      return Response.json({ ok: true });
    }

    if (action !== "approve") {
      return Response.json({ error: "Unknown action" }, { status: 422 });
    }

    // Approve → publish the underlying content.
    if (submission.type === "note") {
      const payload = submission.payload as Record<string, unknown>;
      const summary = typeof payload["summary"] === "string" ? payload["summary"] : null;
      const tags = Array.isArray(payload["tags"])
        ? payload["tags"].filter((tag): tag is string => typeof tag === "string")
        : [];
      const { data: note, error } = await admin
        .from("notes")
        .insert({
          topic_id: submission.topic_id ?? "",
          title: submission.title,
          slug: `${slugify(submission.title)}-${Date.now().toString(36)}`,
          summary,
          content_md: submission.content_md ?? "",
          status: "published",
          is_exam_critical: false,
          contributed_by: submission.user_id,
          published_at: new Date().toISOString(),
          reading_minutes: Math.max(
            1,
            Math.round((submission.content_md ?? "").split(/\s+/).length / 180),
          ),
          tags,
        })
        .select("id, slug")
        .single();
      if (error) return Response.json({ error: "Could not publish this note" }, { status: 502 });
      await admin
        .from("submissions")
        .update({ status: "published", reviewed_at: new Date().toISOString() })
        .eq("id", submissionId);
      await awardXp(admin, submission.user_id, XP_RULES.note_published, "note_published");
      await notify(
        admin,
        submission.user_id,
        "Your note was published 🎉",
        `"${submission.title}" is live with your name on it — +${XP_RULES.note_published} XP.`,
        `/notes/${note.slug ?? note.id}`,
      );
      return Response.json({ ok: true });
    }

    if (submission.type === "question") {
      const payload = submission.payload as Record<string, unknown>;
      const zone =
        payload["zone"] === "cat1" || payload["zone"] === "cat2" || payload["zone"] === "main"
          ? payload["zone"]
          : "cat1";
      const difficulty =
        payload["difficulty"] === "easy" || payload["difficulty"] === "hard"
          ? payload["difficulty"]
          : "medium";
      const type =
        payload["type"] === "short_answer" ||
        payload["type"] === "long_answer" ||
        payload["type"] === "structured"
          ? payload["type"]
          : "mcq";
      const { error } = await admin.from("questions").insert({
        topic_id: submission.topic_id,
        zone,
        difficulty,
        type,
        stem_md:
          typeof payload["stem_md"] === "string"
            ? payload["stem_md"]
            : (submission.content_md ?? ""),
        options: toJson(questionOptions(payload["options"])),
        answer_key: typeof payload["answer_key"] === "string" ? payload["answer_key"] : "",
        explanation_md:
          typeof payload["explanation_md"] === "string" ? payload["explanation_md"] : "",
        marks: typeof payload["marks"] === "number" ? payload["marks"] : 1,
        created_by: submission.user_id,
        status: "published",
        source: "community",
        tags: Array.isArray(payload["tags"])
          ? payload["tags"].filter((tag): tag is string => typeof tag === "string")
          : [],
      });
      if (error)
        return Response.json({ error: "Could not publish this question" }, { status: 502 });
      await admin
        .from("submissions")
        .update({ status: "published", reviewed_at: new Date().toISOString() })
        .eq("id", submissionId);
      await awardXp(admin, submission.user_id, XP_RULES.submission_approved, "submission_approved");
      await notify(
        admin,
        submission.user_id,
        "Your question was published 🎉",
        `It's in the question bank — +${XP_RULES.submission_approved} XP.`,
        null,
      );
      return Response.json({ ok: true });
    }

    // Other submission types (past papers, flashcard sets) — approve as-is.
    await admin
      .from("submissions")
      .update({ status: "published", reviewed_at: new Date().toISOString() })
      .eq("id", submissionId);
    await notify(
      admin,
      submission.user_id,
      "Your submission was approved 🎉",
      "Thanks for contributing to the class.",
      null,
    );
    return Response.json({ ok: true });
  }

  // ---------------- jobs ----------------
  if (jobId) {
    const { data: job } = await admin
      .from("jobs")
      .select("id, title, posted_by")
      .eq("id", jobId)
      .maybeSingle();
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

    const status = action === "approve" ? "approved" : "rejected";
    const { error } = await admin.from("jobs").update({ status }).eq("id", jobId);
    if (error) return Response.json({ error: "Could not update the job" }, { status: 502 });

    if (job.posted_by) {
      await notify(
        admin,
        job.posted_by,
        action === "approve" ? "Job posting approved" : "Job posting declined",
        action === "approve"
          ? `"${job.title}" is now live on the board.`
          : (reviewNotes ?? "The posting didn't meet the board's requirements."),
        "/jobs",
      );
    }
    return Response.json({ ok: true });
  }

  // ---------------- chat reports ----------------
  if (reportId) {
    const { data: report } = await admin
      .from("chat_reports")
      .select("id, message_id, reporter_id")
      .eq("id", reportId)
      .maybeSingle();
    if (!report) return Response.json({ error: "Report not found" }, { status: 404 });

    if (action === "resolve") {
      // Remove the offending message (encrypted body stays unread).
      await admin
        .from("chat_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", report.message_id);
    }
    const { error } = await admin
      .from("chat_reports")
      .update({
        status: action === "resolve" ? "resolved" : "dismissed",
        resolved_at: new Date().toISOString(),
        resolution_notes: reviewNotes ?? null,
      })
      .eq("id", reportId);
    if (error) return Response.json({ error: "Could not update the report" }, { status: 502 });

    await notify(
      admin,
      report.reporter_id,
      action === "resolve" ? "Report actioned" : "Report reviewed",
      action === "resolve"
        ? "Thanks — the reported message has been removed."
        : "Thanks for the report — we reviewed it and kept the message.",
      null,
    );
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Nothing to do" }, { status: 422 });
}
