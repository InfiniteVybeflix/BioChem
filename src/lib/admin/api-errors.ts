/**
 * Console API error helpers.
 *
 * Every console write goes through the service-role client, so a
 * failure is almost always a database-state problem (a migration that
 * hasn't been applied, a column that doesn't exist yet). Surfacing the
 * real reason beats a generic "could not …" — the operator can act on
 * it (usually: open System → Database setup and run the SQL).
 */

interface DbErrorLike {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** Friendly one-liner for the common Postgres error codes we hit. */
function friendlyMessage(code: string | null | undefined): string | null {
  switch (code) {
    case "42P01":
      return "The table for this feature doesn't exist yet — open System → Database setup in the console and run the one-click SQL.";
    case "42703":
      return "A column this feature needs is missing — open System → Database setup in the console and run the one-click SQL.";
    case "42501":
      return "The database refused the write (row-level security). Check the service-role key is set on this deployment.";
    case "23505":
      return "An item with the same unique key already exists.";
    case "23503":
      return "This item references something that doesn't exist (foreign key).";
    case "23514":
      return "The database rejected a value that breaks a check constraint.";
    default:
      return null;
  }
}

/**
 * Build a Response for a failed Supabase write/read. The admin gets the
 * real database reason plus the fix hint — never a dead-end generic.
 */
export function dbErrorResponse(
  scope: string,
  error: DbErrorLike | null | undefined,
  status = 502,
): Response {
  const raw = (error?.message ?? "").trim();
  const friendly = friendlyMessage(error?.code);
  const detail = [friendly, raw ? `Database said: ${raw}` : null].filter(Boolean).join(" — ");
  console.error(`[console-api] ${scope} failed:`, error?.code ?? "-", raw || "unknown error");
  return Response.json(
    { error: detail ? `Could not ${scope} — ${detail}` : `Could not ${scope}.`, ok: false },
    { status },
  );
}

/** Human labels for the fields the console validates. */
const FIELD_LABELS: Record<string, string> = {
  title: "Headline",
  summary: "Summary",
  content_md: "Article body",
  category: "Category",
  source_url: "Source link",
  source_label: "Source name",
  image_url: "Image URL",
  status: "Status",
  pinned: "Pin",
  text: "Source material",
  urls: "Links",
  id: "ID",
  patch: "Settings",
  interests: "Interest keywords",
  sources: "Sources",
};

interface ZodIssueLike {
  code?: string;
  path?: (string | number | symbol)[];
  message?: string;
  maximum?: number | bigint;
  minimum?: number | bigint;
}

/**
 * Turn a Zod validation error into one plain-English sentence that
 * NAMES the field — "Summary is too long (max 400 characters)" beats a
 * bare "Too big: expected string to have ≤400 characters" the operator
 * can't act on.
 */
export function zodFieldMessage(error: { issues: ZodIssueLike[] }): string | null {
  const issue = error.issues[0];
  if (!issue) return null;
  const fieldKey = String(issue.path?.[0] ?? "");
  const label = FIELD_LABELS[fieldKey] ?? fieldKey;
  if (issue.code === "too_big" && issue.maximum !== undefined) {
    return `${label} is too long — keep it to ${issue.maximum.toString()} characters or fewer.`;
  }
  if (issue.code === "too_small" && issue.minimum !== undefined) {
    return `${label} is too short — it needs at least ${issue.minimum.toString()} characters.`;
  }
  return issue.message ?? null;
}
