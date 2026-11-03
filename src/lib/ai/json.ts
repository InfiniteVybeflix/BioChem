import { z } from "zod";

/**
 * Tolerant AI-JSON handling.
 *
 * Models occasionally wrap JSON in markdown fences, prepend a sentence,
 * or get cut off mid-object. Every console AI feature parses through
 * here so a single odd response never surfaces as raw "JSON" errors —
 * we extract, repair, validate and retry instead.
 */

/** Strip markdown fences and obvious prose around the payload. */
function stripFences(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/```(?:json|JSON)?/g, "```")
    .trim();
}

/**
 * Extract the first `{…}` or `[…]` block, ignoring braces inside
 * strings. When the payload was cut off mid-way the block is repaired
 * best-effort and `complete` is false, so callers can retry.
 */
export function extractBalanced(
  raw: string,
): { text: string; complete: boolean } | null {
  const text = stripFences(raw);
  // Prefer the bracket that starts earliest — a JSON array of objects
  // must be captured whole, not as its first element.
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  if (objStart === -1 && arrStart === -1) return null;
  const pairs: (readonly [string, string])[] =
    arrStart !== -1 && (objStart === -1 || arrStart < objStart)
      ? [
          ["[", "]"],
          ["{", "}"],
        ]
      : [
          ["{", "}"],
          ["[", "]"],
        ];
  for (const [open, close] of pairs) {
    const start = text.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) return { text: text.slice(start, index + 1), complete: true };
      }
    }
    // Unbalanced (truncated) — fall through to repair below.
    const repaired = repairTruncated(text.slice(start), open, close);
    return repaired ? { text: repaired, complete: false } : null;
  }
  return null;
}

/**
 * Best-effort repair of a truncated JSON object/array: drop the
 * incomplete trailing field and close the open strings/brackets.
 * Returns the repaired text (may still fail JSON.parse — callers
 * must handle that).
 */
function repairTruncated(chunk: string, open: string, close: string): string | null {
  let text = chunk.trimEnd();
  if (text.endsWith(close)) text = text.slice(0, -1);
  // Remove a dangling, incomplete "key": value fragment at the end.
  const cut = Math.max(
    text.lastIndexOf(","),
    text.lastIndexOf("{"),
    text.lastIndexOf("["),
    text.lastIndexOf(":"),
  );
  if (cut > 0) text = text.slice(0, cut).replace(/[,:\s]+$/, "");
  // Close any strings left open by the cut.
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) text += '"';
  return `${text}${close}`;
}

/**
 * The AI is asked for short fields but models overshoot — a 450-char
 * summary or 320-char headline is a GOOD draft, not a failure. Accept
 * generous inputs and clamp to the sizes the console/API expect, so a
 * usable draft never bounces back as a validation error.
 */
export const draftArticleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4)
    .max(600)
    .transform((value) => value.slice(0, 300)),
  summary: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value.slice(0, 400))
    .default(""),
  content_md: z.string().max(40_000).default(""),
  category: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(["research", "exams", "campus", "jobs", "general"]))
    .catch("general"),
  source_label: z
    .string()
    .trim()
    .max(240)
    .transform((value) => value.slice(0, 120))
    .default(""),
});

export type DraftArticlePayload = z.infer<typeof draftArticleSchema>;

export const digestArticleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(6)
    .max(600)
    .transform((value) => value.slice(0, 300)),
  summary: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value.slice(0, 400))
    .default(""),
  content_md: z.string().max(40_000).default(""),
  category: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(["research", "exams", "campus", "jobs", "general"]))
    .catch("general"),
  source_url: z.string().url(),
  source_label: z
    .string()
    .trim()
    .max(240)
    .nullish()
    .transform((value) => (value ? value.slice(0, 120) : null)),
});

export type DigestArticlePayload = z.infer<typeof digestArticleSchema>;

export interface ParseOutcome<T> {
  value?: T;
  error?: string;
  /** True when the payload looked like JSON but was cut off mid-way. */
  truncated?: boolean;
}

/** Parse one article object out of an arbitrary model response. */
export function parseDraftArticle(content: string): ParseOutcome<DraftArticlePayload> {
  const extracted = extractBalanced(content);
  if (!extracted) return { error: "no JSON found" };
  try {
    const parsed: unknown = JSON.parse(extracted.text);
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : Array.isArray(parsed)
          ? ((parsed[0] ?? {}) as Record<string, unknown>)
          : {};
    const result = draftArticleSchema.safeParse(record);
    if (result.success) {
      // A repaired (cut-off) payload parses but the article body is
      // likely incomplete — let the caller retry for the full text.
      return extracted.complete
        ? { value: result.data }
        : { value: result.data, truncated: true };
    }
    return { error: result.error.issues[0]?.message ?? "invalid article", truncated: !extracted.complete };
  } catch {
    return { error: "not valid JSON", truncated: true };
  }
}

/** Parse an array of digest articles out of an arbitrary model response. */
export function parseDigestArticles(content: string): ParseOutcome<DigestArticlePayload[]> {
  const extracted = extractBalanced(content);
  if (!extracted) return { error: "no JSON found" };
  try {
    const parsed: unknown = JSON.parse(extracted.text);
    const values = digestListFrom(parsed);
    if (values.length === 0) return { error: "no usable articles in the list" };
    return extracted.complete ? { value: values } : { value: values, truncated: true };
  } catch {
    // Truncated array — salvage every complete object inside it so one
    // cut-off entry at the end doesn't throw away the whole batch.
    const values = salvageObjects(extracted.text);
    if (values.length === 0) return { error: "not valid JSON", truncated: true };
    // Salvaged values are a last resort — the caller retries first.
    return { value: values, truncated: true };
  }
}

function digestListFrom(parsed: unknown): DigestArticlePayload[] {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { articles?: unknown }).articles)
      ? (parsed as { articles: unknown[] }).articles
      : [parsed];
  const values: DigestArticlePayload[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const result = digestArticleSchema.safeParse(entry);
    if (result.success) values.push(result.data);
  }
  return values;
}

/** Find every balanced `{…}` block inside a broken JSON payload. */
function salvageObjects(text: string): DigestArticlePayload[] {
  const values: DigestArticlePayload[] = [];
  for (const entry of salvageRawObjects(text)) {
    const result = digestArticleSchema.safeParse(entry);
    if (result.success) values.push(result.data);
  }
  return values;
}

/** Find every balanced `{…}` block inside a broken JSON payload (untyped). */
function salvageRawObjects(text: string): Record<string, unknown>[] {
  const values: Record<string, unknown>[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const entry: unknown = JSON.parse(text.slice(start, index + 1));
            if (entry && typeof entry === "object" && !Array.isArray(entry)) {
              values.push(entry as Record<string, unknown>);
            }
          } catch {
            // Skip the unparseable block.
          }
          cursor = index + 1;
          break;
        }
      }
    }
    if (depth !== 0) break; // last object never closed — nothing more to salvage
  }
  return values;
}

// ---------------------------------------------------------------------------
// Universal model-JSON repair — used by every question/plan/card generator.
// ---------------------------------------------------------------------------

/** Trailing commas are the #1 model slip: `…}, ], "answerKey"…`. */
function dropTrailingCommas(text: string): string {
  return text.replace(/,\s*([[\]}])/g, "$1");
}

/** Smart quotes, bare NaN/Infinity/undefined — common model slips. */
function normaliseTokens(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\bNaN\b/g, "null")
    .replace(/\b-?Infinity\b/g, "null")
    .replace(/\bundefined\b/g, "null");
}

/** Best effort for fully single-quoted payloads (no double quotes at all). */
function requoteSingleQuoted(text: string): string {
  if (text.includes('"')) return text;
  return text.replace(/'((?:[^'\\]|\\.)*)'/g, (_, body: string) => `"${body.replace(/"/g, '\\"')}"`);
}

/** Quote bare object keys: `{stem: …}` → `{"stem": …}`. */
function quoteBareKeys(text: string): string {
  return text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
}

/**
 * Cuts a truncated payload back to its last complete element and closes
 * every open string/bracket, so a response that hit the token limit still
 * parses (the caller retries for the full version; the repaired value is
 * a last-resort fallback, not the happy path).
 */
function repairTruncatedJson(input: string): string | null {
  let text = input.trimEnd();
  if (text.length === 0) return null;
  const cut = Math.max(
    text.lastIndexOf(","),
    text.lastIndexOf("{"),
    text.lastIndexOf("["),
    text.lastIndexOf(":"),
  );
  if (cut > 0) text = text.slice(0, cut).replace(/[,:\s]+$/, "");

  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }
  if (inString) text += '"';
  while (stack.length > 0) text += stack.pop() === "{" ? "}" : "]";
  return text;
}

/**
 * Parse ANY JSON payload out of a model response with layered repair:
 * extract → parse → drop trailing commas → normalise tokens → quote keys →
 * close truncation → salvage the complete objects from a broken array.
 * Never throws; reports `truncated` so callers can retry for the full text.
 */
export function parseModelJson(raw: string): ParseOutcome<unknown> {
  const extracted = extractBalanced(raw);
  if (!extracted) return { error: "no JSON found" };
  const { text, complete } = extracted;

  const candidates: string[] = [
    text,
    dropTrailingCommas(text),
    normaliseTokens(text),
    normaliseTokens(dropTrailingCommas(text)),
    quoteBareKeys(normaliseTokens(dropTrailingCommas(text))),
    requoteSingleQuoted(normaliseTokens(dropTrailingCommas(text))),
  ];
  if (!complete) {
    const repaired = repairTruncatedJson(text);
    if (repaired) {
      candidates.unshift(repaired);
      candidates.push(
        normaliseTokens(dropTrailingCommas(repaired)),
        quoteBareKeys(normaliseTokens(dropTrailingCommas(repaired))),
      );
    }
  }

  for (const candidate of candidates) {
    try {
      return { value: JSON.parse(candidate) as unknown, truncated: !complete };
    } catch {
      // Try the next repair layer.
    }
  }

  // Last resort: salvage every complete object from a broken array.
  const salvaged = salvageRawObjects(text);
  if (salvaged.length > 0) return { value: salvaged, truncated: true };
  return { error: "not valid JSON", truncated: !complete };
}

/**
 * Pull the first JSON array out of a model reply — tolerates fences,
 * prose, trailing commas, smart quotes and truncation. Accepts a bare
 * array or an object wrapping one (first array-valued property).
 * Throws only when there is genuinely nothing usable.
 */
export function extractModelArray(raw: string): unknown[] {
  const outcome = parseModelJson(raw);
  if (outcome.value !== undefined) {
    const value = outcome.value;
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(entry)) return entry;
      }
    }
  }
  throw new Error("Model response did not contain a usable JSON array");
}

/**
 * Pull the first JSON object out of a model reply with the same repair
 * layers. Throws only when there is genuinely nothing usable.
 */
export function extractModelObject(raw: string): Record<string, unknown> {
  const outcome = parseModelJson(raw);
  const value = outcome.value;
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
    if (first) return first as Record<string, unknown>;
  } else if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  throw new Error("Model response did not contain a usable JSON object");
}
