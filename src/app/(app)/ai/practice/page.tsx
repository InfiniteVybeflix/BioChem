import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/ui-bits";
import { PracticeRunner } from "@/components/ai/practice-runner";
import { getAuthContext, getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AI Practice",
  description: "AI-generated MCQ practice with instant marking, remarks and coaching.",
};

/**
 * AI Practice — students generate fresh MCQ sets on any topic; the
 * selected answers are sent back with the questions and the AI marks
 * them, returning per-question remarks and what to note.
 */
export default async function AiPracticePage() {
  const supabase = await getSupabaseServerClient();
  const auth = supabase ? await getAuthContext() : null;
  if (!auth) redirect("/login?next=/ai/practice");

  const { data: topics } = supabase
    ? await supabase
        .from("topics")
        .select("id, title, zone")
        .order("order_index", { ascending: true })
        .limit(200)
    : { data: [] };

  return (
    <section className="space-y-6">
      <PageHeader
        title="AI Practice"
        description="Fresh questions, generated for you, marked with feedback — as many sets as you like."
      />
      <PracticeRunner topics={topics ?? []} />
    </section>
  );
}
