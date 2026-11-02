-- ============================================================
-- 00023 — Course UNITS (e.g. BIO 205 "Biochemistry of Plants")
--
-- Units are the real-world course units students study: each unit
-- belongs to a SCHOOL and a YEAR, carries a code (BIO205, MIC205…)
-- and a name. Topics — the backbone every note/question/discussion
-- hangs off — can now be filed under a unit, so a student opens
-- THEIR unit (their school + their year) and reads the notes inside.
--
-- Exam zones (CAT 1 / CAT 2 / Main) keep working exactly as before;
-- a unit is an additional, optional home for a topic.
--
-- IDEMPOTENT: safe to run once, ten times, on any state. Also
-- re-applies the guarded set_updated_at() function from 00022 so
-- this script can run even if 00022 hasn't been applied yet.
-- ============================================================

-- ---------- 0. Guarded trigger function (mirrors 00022) ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp the timestamp when this table actually has the column.
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------- 1. units ----------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  code text not null,                    -- "BIO205" (normalised, unique per school)
  name text not null,                    -- "Biochemistry of Plants"
  description text not null default '',
  year integer not null check (year between 1 and 8),
  semester integer check (semester between 1 and 3),
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.units enable row level security;

-- Anyone (including guests on the landing page) can read units;
-- only the service role (operations console) can write them —
-- the same model as schools.
drop policy if exists "units_select_all" on public.units;
create policy "units_select_all" on public.units
  for select using (true);

create index if not exists units_school_year_idx
  on public.units (school_id, year, order_index);
create unique index if not exists units_school_code_key
  on public.units (school_id, code);

drop trigger if exists set_updated_at_units on public.units;
create trigger set_updated_at_units
  before update on public.units
  for each row execute function public.set_updated_at();

-- ---------- 2. topics: optional unit home ----------
alter table public.topics
  add column if not exists unit_id uuid references public.units (id) on delete set null;

create index if not exists topics_unit_idx on public.topics (unit_id);

-- ---------- 3. Housekeeping: heal anything 00022 was meant to fix ----------
-- (No-op if 00022 already ran; heals a database where it didn't.)
do $$
declare
  r record;
begin
  for r in
    select distinct c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'set_updated_at'
      and not t.tgisinternal
      and n.nspname = 'public'
  loop
    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()',
      r.table_name
    );
  end loop;
end;
$$;
