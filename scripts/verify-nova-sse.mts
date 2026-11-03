/**
 * SSE contract test — the exact bytes `encodeStep` produces must be parsed
 * losslessly by the client's `readNovaStream` logic. The parsing algorithm
 * below mirrors tutor-chat.tsx's (buffer-split on "\n\n", "data: " prefix).
 */
import { encodeStep, sseData } from "../src/lib/ai/nova/sse.ts";
import type { NovaStep } from "../src/lib/ai/nova/turn.ts";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const steps: NovaStep[] = [
  { type: "delta", text: "Opening the " },
  { type: "delta", text: "**Mock Exams** page." },
  {
    type: "actions",
    actions: [{ kind: "navigate", path: "/mocks", title: "Mock Exams" }],
  },
  { type: "error", message: "boom" },
  { type: "done" },
];

// Encode every step exactly as the route would, concatenated into one body.
let body = "";
for (const step of steps) {
  const encoded = encodeStep(step);
  if (encoded) body += encoded;
}
body = body.replace("data: [DONE]\n\n", "data: [DONE]\n\n"); // identical wire format

// Stream it through a fake Response body in awkward chunk sizes to prove
// the splitter tolerates partial frames.
function makeResponse(payload: string, chunkSize: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(payload);
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

async function parse(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const actions: unknown[] = [];
  const errors: string[] = [];
  let done = false;

  while (true) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") {
        done = true;
        continue;
      }
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (typeof payload.delta === "string") full += payload.delta;
      if (Array.isArray(payload.actions)) actions.push(...payload.actions);
      if (typeof payload.error === "string") errors.push(payload.error);
    }
  }
  return { full, actions, errors, done };
}

const byteBody = Buffer.from(body, "utf8");
for (const chunkSize of [1, 7, 64, byteBody.length]) {
  const result = await parse(makeResponse(body, chunkSize));
  check(
    `chunk ${chunkSize}: deltas reassemble`,
    result.full === "Opening the **Mock Exams** page.",
    JSON.stringify(result.full),
  );
  check(
    `chunk ${chunkSize}: actions parsed`,
    (result.actions[0] as { path?: string })?.path === "/mocks",
  );
  check(`chunk ${chunkSize}: errors parsed`, result.errors[0] === "boom");
  check(`chunk ${chunkSize}: [DONE] seen`, result.done === true);
}

// Multi-byte characters split across chunks (Chinese text, emoji).
const unicodeSteps = sseData({ delta: "生物化学 🧬 biochemistry" }) + "data: [DONE]\n\n";
const unicodeResult = await parse(makeResponse(unicodeSteps, 3));
check("unicode split-safe", unicodeResult.full === "生物化学 🧬 biochemistry", unicodeResult.full);

console.log(failures === 0 ? "\nSSE CONTRACT HOLDS" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
