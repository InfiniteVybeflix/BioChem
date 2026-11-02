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
