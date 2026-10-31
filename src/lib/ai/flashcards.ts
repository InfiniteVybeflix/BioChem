import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/domain";
import { gatewayChat, type GatewayMessage } from "@/lib/ai/gateway";
import { FLASHCARDS_PROMPT, extractJsonArray } from "@/lib/ai/prompts";

/**
 * AI flashcard generation from a published note.
 * `client` is the caller's Supabase client (RLS-scoped in the API route,
 * service-role in the queue processor).
 */

const flashcardSchema = z.object({
  front: z.string().min(5),
  back: z.string().min(2),
});

export async function generateNoteFlashcards(
  client: SupabaseClient<Database>,
  userId: string,
  noteId: string,
  count: number,
): Promise<number> {
  const { data: note } = await client
    .from("notes")
    .select("id, topic_id, title, content_md, status, contributed_by")
    .eq("id", noteId)
    .maybeSingle();

  if (!note || (note.status !== "published" && note.contributed_by !== userId)) {
    throw new Error("Note not found or not published");
  }

  const messages: GatewayMessage[] = [
    { role: "system", content: FLASHCARDS_PROMPT },
    {
      role: "user",
      content: `Note title: ${note.title}\n\n${note.content_md.slice(0, 8000)}\n\nGenerate exactly ${count} cards.`,
    },
  ];

  const result = await gatewayChat("flashcards", messages);
  const raw = extractJsonArray(result.content);

  const cards: { front: string; back: string }[] = [];
  for (const element of raw) {
    const parsed = flashcardSchema.safeParse(element);
    if (parsed.success) cards.push(parsed.data);
    if (cards.length >= count) break;
  }
  if (cards.length === 0) {
    throw new Error("The model returned no valid flashcards — please try again");
  }

  const { error } = await client.from("flashcards").insert(
    cards.map((card) => ({
      topic_id: note.topic_id,
      note_id: noteId,
      front_md: card.front,
      back_md: card.back,
      source: "ai",
      visibility: "private" as const,
      created_by: userId,
      status: "published" as const,
    })),
  );
  if (error) throw new Error(`Failed to save flashcards: ${error.message}`);

  return cards.length;
}
