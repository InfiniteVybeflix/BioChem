import { env } from "@/lib/env";
import { modelForTask, type AiModel, type AiTask } from "@/lib/ai/models";

/**
 * Aevibron Gateway client.
 *
 * Contract:
 *   POST {AEVIBRON_GATEWAY_URL}{AEVIBRON_CHAT_PATH}   header: X-Aevibron-Key
 *   GET  {AEVIBRON_GATEWAY_URL}{AEVIBRON_STATUS_PATH} header: X-Aevibron-Key
 *
 * Request body:  { model, messages: [{role, content}], temperature?, max_tokens?, stream? }
 * The response parser is intentionally tolerant — it accepts the common
 * `{ choices: [{ message: { content } }] }` shape as well as flat
 * `{ content }` / `{ output }` / `{ text }` / plain-string bodies.
 */

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * Extra models tried (one param-free attempt each) when the primary
   * model is rejected. A gateway can have a single broken/overloaded
   * model while the rest still work — the news desk keeps working by
   * silently moving to the next one.
   */
  fallbackModels?: AiModel[];
}

export interface ChatResult {
  content: string;
  model: string;
  latencyMs: number;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function gatewayConfigured(): boolean {
  return Boolean(env.gatewayUrl() && env.gatewayApiKey());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract assistant text from any of the common gateway response shapes. */
export function parseGatewayContent(payload: unknown): string {
  if (typeof payload === "string") return payload;

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    const choices = record.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first.message as Record<string, unknown> | undefined;
      if (message && typeof message.content === "string") return message.content;
      const delta = first.delta as Record<string, unknown> | undefined;
      if (delta && typeof delta.content === "string") return delta.content;
      if (typeof first.text === "string") return first.text;
      if (typeof first.content === "string") return first.content;
    }

    for (const key of ["content", "output", "text", "response", "result"]) {
      const value = record[key];
      if (typeof value === "string") return value;
    }
  }

  throw new GatewayError("Unrecognised gateway response shape");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends a chat completion with retry + model fallback.
 *
 *   * network errors, 408, 429, 5xx — retried with backoff (up to 2 retries)
 *   * 400 — gateways reject `temperature` / `max_tokens` they don't support
 *     for the requested model, so the first 400 is retried immediately
 *     without the optional parameters before the error is treated as fatal
 *   * `fallbackModels` — when the primary model still fails, each fallback
 *     gets one param-free attempt, so one broken model never takes a
 *     feature down.
 *
 * The gateway's own response body is included in the error message so the
 * console can show WHY the request was rejected instead of a bare
 * "responded 400".
 */
export async function gatewayChat(
  task: AiTask,
  messages: GatewayMessage[],
  options: ChatOptions & { model?: AiModel } = {},
): Promise<ChatResult> {
  const baseUrl = env.gatewayUrl();
  const apiKey = env.gatewayApiKey();
  if (!baseUrl || !apiKey) {
    throw new GatewayError("Aevibron gateway is not configured", undefined, false);
  }

  const primary = options.model ?? modelForTask(task);
  const models = [primary, ...(options.fallbackModels ?? []).filter((m) => m !== primary)];
  const url = `${baseUrl.replace(/\/+$/, "")}${env.gatewayChatPath()}`;
  const startedAt = Date.now();

  const send = (model: AiModel, withOptionalParams: boolean): Promise<Response> =>
    fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aevibron-Key": apiKey,
        },
        body: JSON.stringify({
          model,
          messages,
          ...(withOptionalParams && options.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
          ...(withOptionalParams && options.maxTokens !== undefined
            ? { max_tokens: options.maxTokens }
            : {}),
        }),
      },
      env.gatewayTimeoutMs(),
    );

  /** Pull a short, human-readable reason out of a gateway error body. */
  async function rejectionDetail(response: Response): Promise<string> {
    try {
      const text = (await response.text()).slice(0, 300);
      if (!text) return "";
      try {
        const payload = JSON.parse(text) as { error?: { message?: string }; message?: string };
        const detail = payload.error?.message ?? payload.message ?? text;
        return ` — ${String(detail).slice(0, 200)}`;
      } catch {
        return ` — ${text.slice(0, 200)}`;
      }
    } catch {
      return "";
    }
  }

  let lastError: GatewayError = new GatewayError("Gateway request failed");
  const rejected: string[] = [];

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const isPrimary = modelIndex === 0;
    // The primary model gets the full retry loop; fallback models get a
    // single param-free attempt each (they exist to dodge a broken
    // primary, not to absorb its load).
    const attempts = isPrimary ? 3 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        let response = await send(model, isPrimary);

        if (
          isPrimary &&
          response.status === 400 &&
          (options.temperature !== undefined || options.maxTokens !== undefined)
        ) {
          // The model/gateway may not accept the optional parameters —
          // retry once in the gateway's default configuration.
          response = await send(model, false);
        }

        if (response.ok) {
          const payload: unknown = await response.json();
          const content = parseGatewayContent(payload);
          return { content, model, latencyMs: Date.now() - startedAt };
        }

        const retriable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        const detail = await rejectionDetail(response);
        lastError = new GatewayError(
          `Gateway responded ${response.status}${detail}`,
          response.status,
          retriable,
        );
        rejected.push(`"${model}": ${response.status}`);
        if (!retriable) break; // a different model may still work
      } catch (error) {
        if (error instanceof GatewayError && !error.retriable) {
          lastError = error;
          rejected.push(`"${model}": ${error.message}`);
          break;
        }
        lastError =
          error instanceof GatewayError
            ? error
            : new GatewayError(
                error instanceof Error ? error.message : "Network error contacting gateway",
                undefined,
                true,
              );
      }

      if (attempt < attempts - 1) {
        await sleep(500 * 2 ** attempt); // 500ms, 1s
      }
    }
    // Fall through to the next model.
  }

  if (models.length > 1 && rejected.length > 0) {
    throw new GatewayError(
      `${lastError.message} (tried ${rejected.join(", ")})`,
      lastError.status,
      lastError.retriable,
    );
  }
  throw lastError;
}

/**
 * Streams a chat completion. Yields text deltas as they arrive.
 * Falls back to a single chunk when the gateway answers non-streamed.
 */
export async function* gatewayChatStream(
  task: AiTask,
  messages: GatewayMessage[],
  options: ChatOptions & { model?: AiModel } = {},
): AsyncGenerator<string> {
  const baseUrl = env.gatewayUrl();
  const apiKey = env.gatewayApiKey();
  if (!baseUrl || !apiKey) {
    throw new GatewayError("Aevibron gateway is not configured", undefined, false);
  }

  const model = options.model ?? modelForTask(task);
  const url = `${baseUrl.replace(/\/+$/, "")}${env.gatewayChatPath()}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Aevibron-Key": apiKey,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      }),
    },
    env.gatewayTimeoutMs(),
  );

  if (!response.ok) {
    throw new GatewayError(`Gateway responded ${response.status}`, response.status);
  }

  if (!response.body) {
    throw new GatewayError("Gateway returned an empty stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const payload: unknown = JSON.parse(data);
          // SSE chunks: {choices:[{delta:{content}}]} or {content}/plain text.
          if (payload && typeof payload === "object") {
            const record = payload as Record<string, unknown>;
            const choices = record.choices;
            if (Array.isArray(choices) && choices.length > 0) {
              const first = choices[0] as Record<string, unknown>;
              const delta = first.delta as Record<string, unknown> | undefined;
              if (delta && typeof delta.content === "string" && delta.content.length > 0) {
                yield delta.content;
              }
            }
            const flat = record.content ?? record.text ?? record.output;
            if (typeof flat === "string" && flat.length > 0) {
              yield flat;
            }
          } else if (typeof payload === "string" && payload.length > 0) {
            yield payload;
          }
        } catch {
          // Non-JSON data line — ignore.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Health check against the gateway status endpoint. */
export async function gatewayStatus(): Promise<
  { ok: true; detail: unknown } | { ok: false; error: string }
> {
  const baseUrl = env.gatewayUrl();
  const apiKey = env.gatewayApiKey();
  if (!baseUrl || !apiKey) {
    return { ok: false, error: "Gateway not configured (AEVIBRON_GATEWAY_URL / AEVIBRON_API_KEY)" };
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/+$/, "")}${env.gatewayStatusPath()}`,
      { method: "GET", headers: { "X-Aevibron-Key": apiKey } },
      10_000,
    );
    if (!response.ok) {
      return { ok: false, error: `Status endpoint responded ${response.status}` };
    }
    const detail: unknown = await response.json().catch(() => ({}));
    return { ok: true, detail };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Gateway unreachable",
    };
  }
}
