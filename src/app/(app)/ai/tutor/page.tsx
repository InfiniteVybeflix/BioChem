import { PageHeader } from "@/components/common/ui-bits";
import { SetupNotice } from "@/components/common/setup-notice";
import { TutorChat } from "@/components/ai/tutor-chat";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/domain";

export const metadata = { title: "AI Tutor — BioChem" };

type ConversationSummary = Pick<
  Database["public"]["Tables"]["ai_conversations"]["Row"],
  "id" | "title" | "updated_at"
>;

/**
 * AI tutor page. The server passes the user's recent conversations (RLS-
 * enforced); streaming, note grounding and the composer live in the client
 * component. When Supabase is not configured the setup state renders.
 */
export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note: noteId } = await searchParams;
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return (
      <>
        <PageHeader
          title="AI Tutor"
          description="Ask anything biochemistry — answers grounded in your course notes."
        />
        <SetupNotice missing="app" />
      </>
    );
  }

  const { data: conversations } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);

  const initialConversations: ConversationSummary[] = conversations ?? [];

  // "Ask about this note" deep link (?note=<id>) preselects the grounding.
  let preselectedNote: { id: string; title: string } | null = null;
  if (noteId) {
    const { data: note } = await supabase
      .from("notes")
      .select("id, title")
      .eq("id", noteId)
      .eq("status", "published")
      .maybeSingle();
    preselectedNote = note ?? null;
  }

  return (
    <>
      <PageHeader
        title="AI Tutor"
        description="Ask anything biochemistry — answers grounded in your course notes, with LaTeX rendering and exam-answer modes."
      />
      <TutorChat initialConversations={initialConversations} preselectedNote={preselectedNote} />
    </>
  );
}
