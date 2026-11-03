import { encodeStep } from "@/lib/ai/nova/sse";
import { GatewayError } from "@/lib/ai/gateway";
import type { NovaStep } from "@/lib/ai/nova/turn";

/**
 * Shared SSE plumbing for Nova's streaming routes (chat, edit, regenerate).
 * Routes supply the turn generator; this module handles the wire format and
 * the gateway-failure fallback hook.
 */

export type { NovaStep };

/**
 * Drives the turn generator into a streaming Response.
 *
 * `onGatewayError` is called when the turn throws GatewayError before any
 * delta was produced (route decides: enqueue → 202, or 502/503).
 */
export async function startNovaStream(
  turn: AsyncGenerator<NovaStep>,
  conversationId: string,
  onGatewayError: () => Promise<Response>,
): Promise<Response> {
  let firstStep: NovaStep | null = null;
  try {
    const first = await turn.next();
    if (!first.done) firstStep = first.value;
  } catch (error) {
    if (error instanceof GatewayError) {
      return onGatewayError();
    }
    throw error;
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  void (async () => {
    try {
      if (firstStep !== null) {
        const encoded = encodeStep(firstStep);
        if (encoded) await writer.write(encoder.encode(encoded));
      }
      while (true) {
        const next = await turn.next();
        if (next.done) break;
        const encoded = encodeStep(next.value);
        if (encoded) await writer.write(encoder.encode(encoded));
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (error) {
      console.error("[nova:stream] stream failed:", error);
      try {
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              error: "Nova's stream ended unexpectedly — please resend your question.",
            })}\n\n`,
          ),
        );
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch {
        // The client already disconnected — nothing left to deliver.
      }
    } finally {
      void writer.close().catch(() => undefined);
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Conversation-Id": conversationId,
      "X-Accel-Buffering": "no",
    },
  });
}
