import { FileText } from "lucide-react";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/common/setup-notice";
import { EmptyState, PageHeader } from "@/components/common/ui-bits";
import { PastPapersList, type PastPaperExam } from "@/components/mocks/past-papers-list";

/**
 * Past papers — published exams flagged `is_past_paper`. Students sit them
 * under timed conditions from the linked question set, and can open the
 * original PDF (public `past-papers` storage bucket) plus worked solutions.
 */
export default async function PastPapersPage() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Past Papers"
          description="Sit real past exams under timed conditions — with worked solutions when available."
        />
        <SetupNotice missing="app" />
      </div>
    );
  }

  const { data: exams } = await supabase
    .from("exams")
    .select(
      "id, title, zone, description, duration_minutes, total_marks, past_paper_url, worked_solutions_url",
    )
    .eq("is_past_paper", true)
    .eq("published", true)
    .order("created_at", { ascending: false });

  const papers: PastPaperExam[] = (exams ?? []).map((exam) => ({
    id: exam.id,
    title: exam.title,
    zone: exam.zone,
    description: exam.description,
    durationMinutes: exam.duration_minutes,
    totalMarks: exam.total_marks,
    pastPaperUrl: exam.past_paper_url,
    workedSolutionsUrl: exam.worked_solutions_url,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Past Papers"
        description="Sit real past exams under timed conditions — with worked solutions when available."
      />
      {papers.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" aria-hidden />}
          title="No past papers uploaded yet"
          description="Lecturers publish these after each exam — the PDFs live in the past-papers storage bucket, and staff can upload them from the lecturer panel."
        />
      ) : (
        <PastPapersList exams={papers} />
      )}
    </div>
  );
}
