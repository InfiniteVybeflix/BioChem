import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { QuestionBank, type QuestionFilters } from "@/components/exam/question-bank";
import type { QuestionData } from "@/components/exam/question-card";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, ExamZone, QuestionOption } from "@/types/domain";

export const metadata: Metadata = {
  title: "Question bank",
  description:
    "Practise with published exam questions — filter by zone, topic, difficulty and type.",
};

const QUESTION_SELECT =
  "id, zone, difficulty, type, stem_md, options, answer_key, explanation_md, marks, source, " +
  "topic:topics!questions_topic_id_fkey (title, slug)";

const PAGE_SIZE = 20;

interface RawQuestionRow {
  id: string;
  zone: ExamZone;
  difficulty: Database["public"]["Enums"]["difficulty"];
  type: Database["public"]["Enums"]["question_type"];
  stem_md: string;
  options: QuestionOption[];
  answer_key: string;
  explanation_md: string;
  marks: number;
  source: string;
  topic: { title: string; slug: string } | null;
}

function isZone(value: string | null): value is ExamZone {
  return value === "cat1" || value === "cat2" || value === "main";
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Question bank page. Server-renders the first page honouring ?zone, ?topic
 * and ?q, then the client browser takes over filtering/pagination.
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <section>
        <PageHeader title="Question bank" />
        <SetupNotice missing="app" />
      </section>
    );
  }

  const query = await searchParams;
  const zoneParam = firstParam(query.zone);
  const filters: QuestionFilters = {
    zone: isZone(zoneParam) ? zoneParam : "all",
    topicSlug: firstParam(query.topic) ?? "all",
    difficulty: "all",
    type: "all",
    query: firstParam(query.q) ?? "",
  };

  const { data: topicRows } = await supabase
    .from("topics")
    .select("id, title, slug, zone")
    .order("order_index");
  const topics = topicRows ?? [];
  const activeTopic = topics.find((topic) => topic.slug === filters.topicSlug) ?? null;

  let request = supabase
    .from("questions")
    .select(QUESTION_SELECT, { count: "exact" })
    .eq("status", "published");
  if (filters.zone !== "all") request = request.eq("zone", filters.zone);
  if (activeTopic) request = request.eq("topic_id", activeTopic.id);
  const trimmed = filters.query.trim().replace(/[,()%\\]/g, " ");
  if (trimmed.length > 0) request = request.ilike("stem_md", `%${trimmed}%`);

  const { data, count } = await request
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  const questions: QuestionData[] = ((data ?? []) as unknown as RawQuestionRow[]).map((row) => ({
    id: row.id,
    zone: row.zone,
    difficulty: row.difficulty,
    type: row.type,
    stemMd: row.stem_md,
    options: row.options,
    answerKey: row.answer_key,
    explanationMd: row.explanation_md,
    marks: row.marks,
    source: row.source,
    topicTitle: row.topic?.title ?? null,
  }));

  return (
    <section>
      <PageHeader
        title="Question bank"
        description="Every published question across all zones. Pick an answer, reveal the explanation, and watch the correct option light up."
      />
      <QuestionBank
        initialQuestions={questions}
        initialTotal={count ?? 0}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          slug: topic.slug,
          zone: topic.zone,
        }))}
        initialFilters={filters}
      />
      <p className="text-muted-foreground mt-8 flex items-center justify-center gap-2 text-center text-xs">
        <ClipboardCheck className="size-3.5" aria-hidden />
        Guest browsing is open — sign in to record answers, sit timed mocks and build streaks.
      </p>
    </section>
  );
}
