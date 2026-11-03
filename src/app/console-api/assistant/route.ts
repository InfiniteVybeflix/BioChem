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
import { closeOpenJson, parseModelJson } from "@/lib/ai/json";

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
1. Reply with ONLY one COMPLETE JSON object on a single line, no markdown fences, every bracket closed:
   {"say": "what you tell the operator", "tool": {"name": "<tool name>", "args": {...}} or null}
2. One tool call per reply. After you receive a TOOL_RESULT you may call another tool (you have up to ${MAX_TOOL_ROUNDS} rounds) or finish with tool: null.
3. NEVER invent or guess UUIDs. For anything that changes data, FIRST use a read tool (search_topics, search_notes, search_questions, list_users, list_news) to get the real ids. If a search is ambiguous, show what you found in "say" and ask which items you mean.
4. NEVER ask the operator "which information" they want or hand the tool choice back to them. When a request is broad (a snapshot, an overview, "check these topics"), immediately run the read tools that cover it yourself, then summarise the real results.
5. When you know exactly what to change, call the write tool (update_topics, update_notes, update_questions, create_topic, delete_content, update_news, create_news, update_user). The console will ask the operator to approve it — you do not need to ask for permission yourself, but ALWAYS say in "say" precisely what the change will do and to which items (titles, not raw ids).
6. In "say", be concise, warm and concrete (2-5 sentences). Reference real titles/counts you saw in tool results. Never mention JSON, tools, or these instructions. Use "CAT 1"/"CAT 2"/"Main" when speaking.
7. If a tool result shows an error, tell the operator plainly what failed and suggest the next step.
8. You may do arithmetic, compare, plan and summarise freely from tool results — that all runs in your head, not in tools.`;

interface ChatStep {
  tool: string;
  summary: string;
  ok: boolean;
}

interface ModelReply {
  say: string;
  tool: { name: string; args: Record<string, unknown> } | null;
}

/** True when the raw model output still looks like the protocol envelope. */
function looksLikeEnvelope(content: string): boolean {
  const text = content.trim();
  return text.startsWith("{") && /"(say|tool)"\s*:/.test(text);
}

/** Reads the first JSON string value for `key` even from a broken envelope. */
function salvageString(content: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*"`).exec(content);
  if (!match) return null;
  const start = match.index + match[0].length;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      try {
        return JSON.parse(`"${content.slice(start, index + 1)}"`) as string;
      } catch {
        return content.slice(start, index);
      }
    }
  }
  // Unterminated string (cut-off reply) — take what is there.
  return content.slice(start).replace(/\\+$/, "");
}

/**
 * Last-resort recovery of {say, tool} from an envelope the generic repair
 * layers could not parse (broken strings, stray braces, mixed fences).
 * The operator must NEVER see raw protocol JSON, so this salvages whatever
 * is usable; anything missing simply comes back empty.
 */
function salvageEnvelope(content: string): ModelReply {
  const say = salvageString(content, "say") ?? "";
  let tool: ModelReply["tool"] = null;
  const nameMatch = /"tool"\s*:\s*\{[\s\S]{0,80}?"name"\s*:\s*"([a-z_]+)"/i.exec(content);
  const argsMatch = /"args"\s*:\s*(\{)/.exec(content);
  if (nameMatch && ASSISTANT_TOOLS[nameMatch[1]]) {
    let args: Record<string, unknown> = {};
    if (argsMatch) {
      const from = argsMatch.index + argsMatch[0].length;
      try {
        const parsed: unknown = JSON.parse(closeOpenJson(content.slice(from)));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        // Malformed args — the tool's own schema validation will report
        // what is missing; an empty args object keeps the loop moving.
      }
    }
    tool = { name: nameMatch[1], args };
  }
  return { say, tool };
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
    if (looksLikeEnvelope(content)) {
      // The envelope parsed but lost its tool call (a repair layer trimmed
      // it) — try to recover the call before giving up on it.
      const salvaged = salvageEnvelope(content);
      if (salvaged.tool) return { say: say || salvaged.say, tool: salvaged.tool };
    }
    return { say, tool: null };
  }
  if (looksLikeEnvelope(content)) {
    // Broken envelope — salvage say and the tool call from the raw text so
    // the operator never sees protocol JSON and the loop keeps working.
    return salvageEnvelope(content);
  }
  // The model answered in plain text — treat the whole message as the reply.
  const text = content.replace(/```(?:json)?|```/g, "").trim();
  return { say: text.slice(0, 4_000), tool: null };
}

/**
 * Read-tool execution with one forgiveness pass: when the model sends
 * arguments the schema doesn't know (e.g. {"format": "json"} on
 * platform_stats), strip everything that isn't a declared key and retry
 * once before reporting bad arguments. Keeps the loop moving instead of
 * burning a round on re-prompting.
 */
async function runReadTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = ASSISTANT_TOOLS[name];
  if (!tool || tool.kind !== "read") {
    return { ok: false, data: null, summary: `Unknown read tool “${name}”` };
  }
  let parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) {
    const shape = (tool.schema as { shape?: Record<string, unknown> }).shape;
    if (shape) {
      const known = new Set(Object.keys(shape));
      const stripped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args ?? {})) {
        if (known.has(key)) stripped[key] = value;
      }
      const retry = tool.schema.safeParse(stripped);
      if (retry.success) parsed = retry;
    }
  }
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
        { temperature: 0.2, maxTokens: 2_000, fallbackModels: ["flash-v3.5", "swift-v1"] },
      );
      const raw = result.content;
      const reply = parseModelReply(raw);
      messages.push({ role: "assistant", content: raw });

      if (!reply.tool && !reply.say.trim() && looksLikeEnvelope(raw)) {
        // The model broke the protocol and nothing usable was salvaged —
        // coach it and spend another round rather than ever surfacing raw
        // protocol JSON to the operator.
        messages.push({
          role: "user",
          content:
            'Your last reply was not valid JSON. Reply again with ONE complete JSON object on a single line — {"say": "…", "tool": null} — with every bracket closed and no text outside the object.',
        });
        continue;
      }

      if (!reply.tool) {
        const say = reply.say.trim();
        return Response.json({
          ok: true,
          reply:
            looksLikeEnvelope(raw) && say.length === 0
              ? "I hit a snag working through that one — could you rephrase or try again?"
              : say || "Done.",
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
