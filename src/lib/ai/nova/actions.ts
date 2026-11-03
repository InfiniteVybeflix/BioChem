import { resolvePage, type SitePage } from "@/lib/ai/nova/directory";
import type { NovaAction } from "@/lib/ai/nova/facts";

/**
 * Nova's action protocol.
 *
 * The model cannot click anything. What it CAN do is finish a sentence with
 * a marker like `[[ACTION: navigate:/mocks]]` or `[[ACTION: tab:/mocks]]`.
 * The server validates the path against the real site directory, strips the
 * marker from the visible text, and ships a structured action to the
 * browser, which then performs the actual navigation or opens a real tab.
 * The UI shows exactly what was executed — nothing more, nothing invented.
 *
 * Direct commands ("open the mock zone") are detected in `facts.ts` and
 * skip the model entirely; this module covers navigation Nova suggests
 * while answering a richer question.
 */

const ACTION_MARKER_RE = /\[\[ACTION:\s*(navigate|tab|open)\s*:\s*([^\]|]+?)\s*\]\]/gi;

export interface ParsedActions {
  /** Reply text with all action markers removed. */
  text: string;
  /** Validated actions to execute in the browser. */
  actions: NovaAction[];
}

/**
 * Extracts and validates action markers from a model reply.
 * Unknown paths are dropped silently — never surfaced, never guessed.
 */
export function parseActions(raw: string, pages: SitePage[]): ParsedActions {
  const actions: NovaAction[] = [];

  const text = raw.replace(ACTION_MARKER_RE, (_match, kind: string, target: string) => {
    // Accept absolute in-app paths the model saw in the directory context,
    // or free-text page names — both must resolve to a real directory page.
    const page = resolvePage(target.trim(), pages);
    if (!page) return "";
    const path = page.path;
    if (
      !actions.some((action) => action.path === path && action.kind === "navigate") &&
      !actions.some((action) => action.path === path)
    ) {
      actions.push({
        kind: kind.toLowerCase() === "tab" ? "open_tab" : "navigate",
        path,
        title: page.title,
      });
    }
    return "";
  });

  return { text: text.replace(/[ \t]+\n/g, "\n").trimEnd(), actions };
}

/**
 * Builds the model-facing directory context: the only routes Nova may
 * reference or open. Kept compact so it can ship on every turn.
 */
export function buildDirectoryContext(pages: SitePage[]): string {
  const lines = pages.map((page) => `- ${page.path} — ${page.title}: ${page.description}`);
  return [
    "## SITE DIRECTORY (the only real pages on this platform)",
    "When suggesting navigation, finish your reply with a marker on its own final line:",
    '  [[ACTION: navigate:/mocks]]   → opens the page in this tab',
    '  [[ACTION: tab:/jobs]]         → opens the page in a new browser tab',
    "Only use paths from this list; a marker with any other path is discarded and nothing will happen.",
    ...lines,
  ].join("\n");
}

/**
 * Persists validated actions as a hidden footer on the stored assistant
 * message, mirroring the BCMEDIA footer format. The chat bubble parses it
 * and renders real, clickable page chips — history keeps working offline.
 */
export function actionsFooter(actions: NovaAction[]): string {
  if (actions.length === 0) return "";
  return `\n\n<!--BCACTIONS:${JSON.stringify(actions)}-->`;
}

/** Extracts validated actions from a persisted assistant message footer. */
export function parseStoredActions(content: string): NovaAction[] {
  const match = content.match(/<!--BCACTIONS:(\[[\s\S]*?\])-->/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(["navigate", "open_tab"]);
    return parsed.filter(
      (item): item is NovaAction =>
        !!item &&
        typeof item === "object" &&
        allowed.has((item as NovaAction).kind) &&
        typeof (item as NovaAction).path === "string" &&
        (item as NovaAction).path.startsWith("/") &&
        typeof (item as NovaAction).title === "string",
    );
  } catch {
    return [];
  }
}

/** Strips the persisted actions footer from display text. */
export function stripStoredActions(content: string): string {
  return content.replace(/<!--BCACTIONS:\[[\s\S]*?\]?-->\s*$/, "").trimEnd();
}
