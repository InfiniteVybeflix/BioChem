import type { SupabaseClient } from "@supabase/supabase-js";
import { gatewayChatStream } from "@/lib/ai/gateway";
import { modelForTask } from "@/lib/ai/models";
import { buildTutorMessages } from "@/lib/ai/tutor";
import { recordAiUsage } from "@/lib/rate-limit";
import { extractMediaMarkers, searchCommonsImage, searchWikipediaLinks } from "@/lib/ai/media";
import type { ResolvedImage, ResolvedLink } from "@/lib/ai/media";
import { collectFacts, type NovaAction } from "@/lib/ai/nova/facts";
import { actionsFooter, buildDirectoryContext, parseActions } from "@/lib/ai/nova/actions";
import { directoryForRole, type SitePage } from "@/lib/ai/nova/directory";
import type { Database } from "@/types/domain";

/**
 * Nova's shared turn engine.
 *
 * One async generator drives every streaming chat path (send, edit &
 * regenerate): collect real platform facts → build messages → stream the
 * gateway reply → resolve media markers → validate action markers →
 * persist everything. Routes translate the yielded steps into SSE.
 */

type Db = SupabaseClient<Database>;

export type NovaStep =
  | { type: "delta"; text: string }
  | { type: "media"; images: ResolvedImage[]; links: ResolvedLink[] }
  | { type: "actions"; actions: NovaAction[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface NovaTurnOptions {
  db: Db;
  userId: string;
  conversationId: string;
  message: string;
  noteIds: string[];
  /** The user message is already persisted (edit / regenerate paths). */
  skipUserInsert?: boolean;
}

export interface NovaTurnContext {
  facts: Awaited<ReturnType<typeof collectFacts>>;
  pages: ReturnType<typeof directoryForRole>;
}

/** Loads the caller's role-scoped directory and runs the fact queries. */
export async function prepareTurnContext(
  db: Db,
  userId: string,
  role: string,
  message: string,
  groundedTitles: string[],
): Promise<NovaTurnContext> {
  const pages = directoryForRole(role);
  const facts = await collectFacts(db, { message, role, userId, groundedTitles });
  return { facts, pages };
}

/**
 * Builds the full gateway message list for a turn, including the site
 * directory so the model can emit valid [[ACTION:…]] markers.
 */
export async function buildTurnMessages(
  db: Db,
  userId: string,
  conversationId: string,
  message: string,
  noteIds: string[],
  context: NovaTurnContext,
  skipUserInsert: boolean,
): Promise<ReturnType<typeof buildTutorMessages>> {
  let notes: { title: string; content_md: string }[] = [];
  if (noteIds.length > 0) {
    const { data } = await db
      .from("notes")
      .select("id, title, content_md")
      .eq("status", "published")
      .in("id", noteIds);
    notes = data ?? [];
  }

  const { data: historyRows } = await db
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (historyRows ?? []).reverse();

  // Trim the trailing user turn when it is already the persisted message
  // (send path after insert, edit and regenerate paths).
  const trimmed =
    !skipUserInsert &&
    history.length > 0 &&
    history[history.length - 1].role === "user" &&
    history[history.length - 1].content === message
      ? history.slice(0, -1)
      : history;

  return buildTutorMessages(trimmed, message, notes, [
    buildDirectoryContext(context.pages),
    ...context.facts.blocks,
  ]);
}

export async function persistUserMessage(
  db: Db,
  conversationId: string,
  message: string,
  noteIds: string[],
): Promise<boolean> {
  const { error } = await db.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message,
    grounding_note_ids: noteIds,
  });
  return !error;
}

export async function touchConversation(db: Db, conversationId: string): Promise<void> {
  await db
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/**
 * Direct navigation turn: "open the mock zone" etc. No model call — the
 * platform performs the action instantly and both messages are persisted.
 */
export async function* runNavigationTurn(options: {
  db: Db;
  conversationId: string;
  message: string;
  page: SitePage;
  noteIds: string[];
}): AsyncGenerator<NovaStep> {
  const { db, conversationId, message, page, noteIds } = options;
  const action: NovaAction = { kind: "navigate", path: page.path, title: page.title };

  const reply = `Opening the **${page.title}** page for you. ${page.description}`;

  const { error: userError } = await db
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role: "user", content: message, grounding_note_ids: noteIds });
  if (userError) {
    yield { type: "error", message: `Could not save your message: ${userError.message}` };
    yield { type: "done" };
    return;
  }

  const { error: replyError } = await db.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply + actionsFooter([action]),
    grounding_note_ids: noteIds,
  });
  if (replyError) {
    yield { type: "error", message: `Could not save the reply: ${replyError.message}` };
    yield { type: "done" };
    return;
  }

  await touchConversation(db, conversationId);
  yield { type: "delta", text: reply };
  yield { type: "actions", actions: [action] };
  yield { type: "done" };
}

/**
 * Runs a full Nova turn and yields steps. Throws GatewayError before the
 * first delta when the gateway is unreachable so the caller can queue.
 */
export async function* runNovaTurn(options: NovaTurnOptions): AsyncGenerator<NovaStep> {
  const { db, userId, conversationId, message, noteIds, skipUserInsert } = options;

  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = profile?.role ?? "student";

  const groundedTitles: string[] = [];
  if (noteIds.length > 0) {
    const { data } = await db
      .from("notes")
      .select("title")
      .eq("status", "published")
      .in("id", noteIds);
    for (const note of data ?? []) groundedTitles.push(note.title);
  }

  const context = await prepareTurnContext(db, userId, role, message, groundedTitles);
  const messages = await buildTurnMessages(
    db,
    userId,
    conversationId,
    message,
    noteIds,
    context,
    skipUserInsert ?? false,
  );

  const generator = gatewayChatStream("tutor", messages);
  const first = await generator.next();
  if (first.done) {
    yield { type: "error", message: "Nova returned an empty response — please resend." };
    yield { type: "done" };
    return;
  }

  const startedAt = Date.now();
  const model = modelForTask("tutor");
  let full = first.value as string;
  yield { type: "delta", text: full };

  while (true) {
    const next = await generator.next();
    if (next.done) break;
    full += next.value;
    yield { type: "delta", text: next.value };
  }

  try {
    if (full.trim().length === 0) {
      await recordAiUsage(userId, "tutor", model, "failed", Date.now() - startedAt);
      yield { type: "error", message: "Nova returned an empty response — please resend." };
      yield { type: "done" };
      return;
    }

    // 1. Validate action markers against the real directory.
    const parsed = parseActions(full, context.pages);

    // 2. Resolve media/link markers into attributed resources.
    const markers = extractMediaMarkers(parsed.text);
    const images: ResolvedImage[] = [];
    const links: ResolvedLink[] = [];
    if (markers.imageQueries.length > 0) {
      const found = await Promise.all(
        markers.imageQueries.map((query) => searchCommonsImage(query)),
      );
      for (const image of found) if (image) images.push(image);
    }
    if (markers.linkQueries.length > 0) {
      const found = await Promise.all(
        markers.linkQueries.map((query) => searchWikipediaLinks(query, 1)),
      );
      for (const group of found) links.push(...group);
    }

    // 3. Persist: text + hidden actions footer + hidden media footer.
    const mediaFooter =
      images.length > 0 || links.length > 0
        ? `\n\n<!--BCMEDIA:${JSON.stringify({ images, links }).replace(/-->/g, "-- >")}-->`
        : "";
    const { error } = await db.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: parsed.text + actionsFooter(parsed.actions) + mediaFooter,
      grounding_note_ids: noteIds,
      model,
    });
    if (error) throw new Error(`Could not save the reply: ${error.message}`);
    await touchConversation(db, conversationId);
    await recordAiUsage(userId, "tutor", model, "ok", Date.now() - startedAt);

    // 4. Ship the structured payloads the browser executes.
    if (parsed.actions.length > 0) {
      yield { type: "actions", actions: parsed.actions };
    }
    if (images.length > 0 || links.length > 0) {
      yield { type: "media", images, links };
    }

    yield { type: "done" };
  } catch (error) {
    console.error("[nova:turn] persist failed:", error);
    await recordAiUsage(userId, "tutor", model, "failed", Date.now() - startedAt);
    yield {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Nova's reply could not be saved — please resend.",
    };
    yield { type: "done" };
  }
}
