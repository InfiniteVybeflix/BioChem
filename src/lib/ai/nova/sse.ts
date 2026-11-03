import type { NovaStep } from "@/lib/ai/nova/turn";

/**
 * SSE wire format for Nova's streaming routes.
 * `data: {"delta":"…"}` chunks, optional `{"actions":[…]}` / `{"media":{…}}`
 * payloads, `{"error":"…"}` notices, terminated by `data: [DONE]`.
 */

export function sseData(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function encodeStep(step: NovaStep): string | null {
  switch (step.type) {
    case "delta":
      return sseData({ delta: step.text });
    case "media":
      return sseData({ media: { images: step.images, links: step.links } });
    case "actions":
      return sseData({ actions: step.actions });
    case "error":
      return sseData({ error: step.message });
    case "done":
      return "data: [DONE]\n\n";
  }
}
