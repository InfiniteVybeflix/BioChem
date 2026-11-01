-- ============================================================
-- BioChem 00016 — Restore Data API grants
--
-- WHY THIS EXISTS
-- The console broadcast (announcements) and schools writes failed
-- with Postgres 42501 "permission denied for table …" even though
-- the tables exist. That error means the role PostgREST used to
-- connect (anon / authenticated / service_role) has no TABLE-level
-- GRANT on the table. Supabase normally grants these automatically
-- (default privileges of the postgres role), but they can end up
-- missing when:
--   • a hardening script ran `revoke … from anon, authenticated`
--   • the Dashboard's "Automatically expose new tables via the
--     Data API" toggle is off (Integrations → Data API)
--   • tables were recreated outside the normal flow
--
-- These statements are idempotent — safe to run any number of times.
-- RLS (migration 00010) still governs every row for anon and
-- authenticated; this only restores Supabase's standard grants.
--
-- Run with: supabase db push  (or paste into the SQL editor).
-- ============================================================

-- 1. Schema usage (prerequisite for any table access via the API)
grant usage on schema public to anon, authenticated, service_role;

-- 2. Standard CRUD on every existing table
--    anon/authenticated: the same SELECT/INSERT/UPDATE/DELETE set
--    Supabase grants by default (RLS decides what actually passes).
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated;

--    service_role: full access (used by the operations console and
--    cron routes; it bypasses RLS but still needs table grants).
grant all on all tables in schema public to service_role;

-- 3. Sequences (serial/identity defaults touched via the API)
grant all on all sequences in schema public to anon, authenticated, service_role;

-- 4. Functions (RPCs such as advance_school_year, is_staff, …)
grant execute on all functions in schema public to anon, authenticated, service_role;

-- 5. Future-proofing: every table/sequence/function created later by
--    the postgres role (SQL editor, supabase db push, psql) gets the
--    same grants automatically.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
