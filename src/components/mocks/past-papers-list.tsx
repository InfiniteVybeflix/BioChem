"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, ExternalLink, FileText, Loader2, Play, Sigma } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { zoneLabel } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

export interface PastPaperExam {
  id: string;
  title: string;
  zone: ExamZone;
  description: string | null;
  durationMinutes: number;
  totalMarks: number;
  pastPaperUrl: string | null;
  workedSolutionsUrl: string | null;
}

/** Public storage URL for a file in the `past-papers` bucket. */
function publicPaperUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/past-papers/${path}`;
}

/**
 * Past papers list — each card links to the original PDF and worked solutions,
 * and can start a timed attempt built from the exam's question set.
 */
export function PastPapersList({ exams }: { exams: PastPaperExam[] }) {
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);

  const sitPaper = async (exam: PastPaperExam) => {
    if (startingId) return;
    setStartingId(exam.id);
    try {
      const res = await fetch("/api/mocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zone: exam.zone,
          examId: exam.id,
          count: 500, // sentinel — the exam flow uses its own question set
          durationMinutes: exam.durationMinutes,
        }),
      });
      const body: unknown = await res.json().catch(() => ({}));
      const attemptId = (body as { attemptId?: string }).attemptId;
      if (!res.ok || !attemptId) {
        toast.error((body as { error?: string }).error ?? "Could not start this past paper");
        return;
      }
      router.push(`/mocks/${attemptId}`);
    } catch {
      toast.error("Network error — could not start this past paper");
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {exams.map((exam) => {
        const starting = startingId === exam.id;
        return (
          <article
            key={exam.id}
            className="glass-card flex flex-col gap-4 p-4 transition-all hover:-translate-y-0.5 sm:p-6"
            aria-label={exam.title}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{zoneLabel(exam.zone)}</Badge>
                <Badge variant="secondary">Past paper</Badge>
              </div>
              <h2 className="font-heading text-lg leading-snug font-semibold">{exam.title}</h2>
              {exam.description ? (
                <p className="text-muted-foreground line-clamp-2 text-sm">{exam.description}</p>
              ) : null}
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                {exam.durationMinutes} minutes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Sigma className="size-4" aria-hidden />
                {exam.totalMarks} marks
              </span>
            </div>

            <div className="mt-auto flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {exam.pastPaperUrl ? (
                <Button asChild variant="outline" className="sm:flex-1">
                  <a
                    href={publicPaperUrl(exam.pastPaperUrl)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open the PDF for ${exam.title} (new tab)`}
                  >
                    <FileText className="size-4" aria-hidden />
                    Open PDF
                  </a>
                </Button>
              ) : null}
              {exam.workedSolutionsUrl ? (
                <Button asChild variant="outline" className="sm:flex-1">
                  <a
                    href={publicPaperUrl(exam.workedSolutionsUrl)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open worked solutions for ${exam.title} (new tab)`}
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Worked solutions
                  </a>
                </Button>
              ) : null}
              <Button
                onClick={() => void sitPaper(exam)}
                disabled={starting || startingId !== null}
                className="sm:flex-1"
              >
                {starting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
                {starting ? "Preparing…" : "Sit this paper"}
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
