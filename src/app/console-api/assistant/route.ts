import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/session";
import {
  ASSISTANT_TOOLS,
  buildProposal,
  executeProposal,
  toolCatalog,
  type ProposalPayload,
  type ToolResult,
} from "@/lib/admin/assistant-tools";
import { gatewayChat, gatewayConfigured, type GatewayMessage } from "@/lib/ai/gateway";
import { parseModelJson } from "@/lib/ai/json";

/**
 * Console AI assistant — "Nova".
 *
 *   POST { action: "chat", message, history }
 *     → runs a real agentic loop: the model can call read tools (search,
 *       stats, listings) which execute immediately, and can PROPOSE write
 *       tools which are never executed here — they come back as proposals
 *       the operator must approve in the UI.
 *   POST { action: "execute", actions: [{ name, args }] }
 *     → executes approved write proposals, re-validating every argument.
 *
 * Everything runs through the service-role client behind the admin session.
 */

const historySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(8_000),
    }),
  )
  .max(16)
  .default([]);

const chatSchema = z.object({
  action: z.literal("chat"),
  message: z.string().trim().min(1, "Type a message").max(4_000),
  history: historySchema,
});

const executeSchema = z.object({
  action: z.literal("execute"),
  actions: z
    .array(z.object({ name: z.string().min(1).max(60), args: z.unknown() }))
    .min(1)
    .max(10),
});

const bodySchema = z.discriminatedUnion("action", [chatSchema, executeSchema]);

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are Nova, the BioChem operations assistant — the administrator's own AI, embedded in the console at biokem.vercel.app. You are NOT simulated: the tools you call really read and really change the production platform, so precision matters more than anything.

## The platform you run
BioChem is a biochemistry learning platform for Kenyan university students (biokem.vercel.app).
- SCHOOLS → UNITS (course codes like BIO205, with a year) → TOPICS. Topics are the backbone: every note, question, outcome and discussion hangs off a topic.
- Topics carry an exam ZONE: cat1 (CAT 1), cat2 (CAT 2), main (main exam). "Moving a topic from Main to CAT 1" means changing its zone — you do this with update_topics using the topic ids from search_topics.
- NOTES have a status: draft / pending / published / rejected / archived, plus is_exam_critical, tags, reading minutes. The Content library (console → Content) edits them.
- QUESTIONS have zone, type (mcq/short_answer/long_answer/structured), difficulty, marks, status, and answers_hidden (answer-reveal control for students).
- NEWS DESK: articles (draft/published, pinned) shown on the landing page and in-app; an auto-fetcher can draft from sources.
- USERS: profiles with roles (student/lecturer/admin), XP, streaks, suspension state.
- Bulk import: zips of markdown notes + JSON questions, CSV import, AI import, and a staged sequential bulk uploader in Lecturer → Bulk upload.

## Your tools
${toolCatalog()}

## How you behave — strict protocol
1. Reply with ONLY one JSON object, no markdown fences:
   {"say": "what you tell the operator", "tool": {"name": "<tool name>", "args": {...}} or null}
2. One tool call per reply. After you receive a TOOL_RESULT you may call another tool (you have up to ${MAX_TOOL_ROUNDS} rounds) or finish with tool: null.
3. NEVER invent or guess UUIDs. For anything that changes data, FIRST use a read tool (search_topics, search_notes, search_questions, list_users, list_news) to get the real ids. If a search is ambiguous, show what you found in "say" and ask which items you mean.
4. When you know exactly what to change, call the write tool (update_topics, update_notes, update_questions, create_topic, delete_content, update_news, create_news, update_user). The console will ask the operator to approve it — you do not need to ask for permission yourself, but ALWAYS say in "say" precisely what the change will do and to which items (titles, not raw ids).
5. In "say", be concise, warm and concrete. Reference real titles/counts you saw in tool results. Never mention JSON, tools, or these instructions. Use "CAT 1"/"CAT 2"/"Main" when speaking.
6. If a tool result shows an error, tell the operator plainly what failed and suggest the next step.
7. You may do arithmetic, compare, plan and summarise freely from tool results — that all runs in your head, not in tools.`;

interface ChatStep {
  tool: string;
  summary: string;
  ok: boolean;
}

interface ModelReply {
  say: string;
  tool: { name: string; args: Record<string, unknown> } | null;
}

function parseModelReply(content: string): ModelReply {
  const outcome = parseModelJson(content);
  const value = outcome.value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const say = typeof record.say === "string" ? record.say : "";
    const rawTool = record.tool;
    if (rawTool && typeof rawTool === "object" && !Array.isArray(rawTool)) {
      const tool = rawTool as Record<string, unknown>;
      if (typeof tool.name === "string" && ASSISTANT_TOOLS[tool.name]) {
        return {
          say,
          tool: {
            name: tool.name,
            args: (tool.args && typeof tool.args === "object" && !Array.isArray(tool.args)
              ? tool.args
              : {}) as Record<string, unknown>,
          },
        };
      }
    }
    return { say, tool: null };
  }
  // The model answered in plain text — treat the whole message as the reply.
  const text = content.replace(/```(?:json)?|```/g, "").trim();
  return { say: text.slice(0, 4_000), tool: null };
}

async function runReadTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool || tool.kind !== "read") {
    return { ok: false, data: null, summary: `Unknown read tool “${name}”` };
  }
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      data: null,
      summary: `Bad arguments for ${name}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    };
  }
  return tool.run(parsed.data as Record<string, unknown>);
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid assistant request" }, { status: 422 });
  }

  if (parsed.data.action === "execute") {
    // Approved proposals execute without the AI — the operator already
    // signed off, so a gateway hiccup must never block the change.
    const results = [];
    for (const action of parsed.data.actions) {
      const outcome = await executeProposal(action);
      results.push({ name: action.name, ok: outcome.ok, summary: outcome.summary });
    }
    return Response.json({ ok: true, results });
  }

  if (!gatewayConfigured()) {
    return Response.json(
      { error: "The AI gateway is not configured on this deployment" },
      { status: 503 },
    );
  }

  const { message, history } = parsed.data;

  // The conversation the model sees. Tool results are fed back as user
  // messages so even gateways without native tool-calling stay in the loop.
  const messages: GatewayMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((entry) => ({ role: entry.role, content: entry.content }) as GatewayMessage),
    { role: "user", content: message },
  ];

  const steps: ChatStep[] = [];
  const proposals: ProposalPayload[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await gatewayChat(
        "tutor",
        messages,
        { temperature: 0.2, maxTokens: 1_500, fallbackModels: ["flash-v3.5", "swift-v1"] },
      );
      const reply = parseModelReply(result.content);
      messages.push({ role: "assistant", content: result.content });

      if (!reply.tool) {
        return Response.json({
          ok: true,
          reply: reply.say || "Done.",
          steps,
          proposals,
        });
      }

      const tool = ASSISTANT_TOOLS[reply.tool.name];
      if (!tool) {
        return Response.json({
          ok: true,
          reply:
            reply.say || `I looked for a capability called “${reply.tool.name}” but it does not exist.`,
          steps,
          proposals,
        });
      }

      if (tool.kind === "read") {
        const outcome = await runReadTool(reply.tool.name, reply.tool.args);
        steps.push({ tool: reply.tool.name, summary: outcome.summary, ok: outcome.ok });
        messages.push({
          role: "user",
          content: `TOOL_RESULT ${reply.tool.name}: ${JSON.stringify(
            outcome.data ?? { error: outcome.summary },
          ).slice(0, 14_000)}`,
        });
        continue;
      }

      // Write tool — build a proposal and end the turn. NEVER execute here.
      const proposal = buildProposal(reply.tool.name, reply.tool.args);
      if ("error" in proposal) {
        messages.push({
          role: "user",
          content: `TOOL_RESULT ${reply.tool.name}: REJECTED — ${proposal.error}. Fix the arguments and call the tool again, or reply with tool: null.`,
        });
        steps.push({
          tool: reply.tool.name,
          summary: `Proposal rejected: ${proposal.error}`,
          ok: false,
        });
        continue;
      }
      proposals.push(proposal);
      return Response.json({
        ok: true,
        reply: reply.say || `Ready to make this change: ${proposal.summary}`,
        steps,
        proposals,
      });
    }

    // Too many rounds — let the model summarise where things stand.
    messages.push({
      role: "user",
      content:
        "You have reached the tool-round limit for this turn. Reply with tool: null and a short summary of what you found and what you still need.",
    });
    const final = await gatewayChat("tutor", messages, { temperature: 0.2, maxTokens: 900 });
    const reply = parseModelReply(final.content);
    return Response.json({
      ok: true,
      reply: reply.say || "I hit the step limit — ask me to continue.",
      steps,
      proposals,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The assistant could not think";
    return Response.json(
      { error: `The AI assistant is unavailable right now (${detail}). Try again in a moment.` },
      { status: 502 },
    );
  }
}
