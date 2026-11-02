-- ============================================================
-- BioChem 00021 — Fix the shared set_updated_at() trigger
--
-- Root cause: migration 00005 created public.ads WITHOUT an
-- updated_at column, then 00009 attached the set_updated_at()
-- trigger to it anyway. Every UPDATE on ads (ad edits, the
-- impression/click counters fired by handle_ad_impression(),
-- and the 00020 setup script's own `update public.ads …` line)
-- aborted with:
--
--   ERROR 42703: record "new" has no field "updated_at"
--
-- Two layers of fix:
--   1. set_updated_at() becomes defensive — it only assigns
--      new.updated_at when the row actually has that column
--      (to_jsonb(new) ? 'updated_at'), so attaching it to any
--      future table can never break writes again.
--   2. ads finally gets the column it should have had since 00005
--      (added BEFORE any update runs, so the 00020 script is safe).
-- ============================================================

-- ---------- 1. Defensive trigger function (safe on every table) ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp the timestamp when this table actually has the column.
  -- (JSONB `?` checks key existence; every row's JSONB always has all
  --  of its record's fields, so this is an exact column test.)
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------- 2. ads: add the missing column ----------
alter table public.ads
  add column if not exists updated_at timestamptz not null default now();

-- One-time backfill: the column was just added, so stamp every row
-- with its creation time instead of the ALTER's default.
update public.ads set updated_at = created_at;
