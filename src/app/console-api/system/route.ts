import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin/session";
import { gatewayConfigured } from "@/lib/ai/gateway";

/**
 * System health — answers "why does feature X fail?" in one screen.
 *
 * The console's write paths use the service-role client, so nearly
 * every "could not create/update" error traces back to database state
 * (a migration that hasn't been applied yet). This endpoint probes
 * every table/column the console needs and reports what's missing,
 * together with a single idempotent SQL script that fixes everything.
 *
 * GET → { configured, checks: [{ id, label, ok, detail? }], fixSql }
 */

export const runtime = "nodejs";

interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string | null;
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/**
 * The probe client deliberately drops the generated table typing —
 * probing tables that may not exist is the whole point.
 */
interface ProbeResult {
  error: { code?: string | null; message: string } | null;
}

type ProbeClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => Promise<ProbeResult>;
  };
};

function probeOf(admin: AdminClient): ProbeClient {
  return admin as unknown as ProbeClient;
}

async function tableExists(probe: ProbeClient, table: string): Promise<CheckResult> {
  const { error } = await probe.from(table).select("*", { count: "exact", head: true });
  if (!error) return { id: table, label: table, ok: true, detail: null };
  const missing = error.code === "42P01" || /does not exist/i.test(error.message);
  return {
    id: table,
    label: table,
    ok: false,
    detail: missing ? "Table missing — run the setup SQL below" : error.message,
  };
}

async function columnExists(
  probe: ProbeClient,
  table: string,
  column: string,
  label: string,
): Promise<CheckResult> {
  const { error } = await probe.from(table).select(column, { count: "exact", head: true });
  if (!error) return { id: `${table}.${column}`, label, ok: true, detail: null };
  const missing = error.code === "42703" || /column .* does not exist/i.test(error.message);
  return {
    id: `${table}.${column}`,
    label,
    ok: false,
    detail: missing ? "Column missing — run the setup SQL below" : error.message,
  };
}

/**
 * One idempotent script that brings ANY deployment up to the current
 * schema. Safe to run repeatedly: every statement is guarded
 * (if not exists / drop-if-exists). Mirrors
 * supabase/migrations/00020_console_setup_fix.sql.
 */
const FIX_SQL = `-- ============================================================
-- BioChem 00022 — Schema repair (paste into Supabase → SQL editor → Run)
--
-- Fixes the failed setup run:
--   ERROR 42703: record "new" has no field "updated_at"
--   CONTEXT: PL/pgSQL assignment "new.updated_at := now()"
--            PL/pgSQL function set_updated_at() line 3 at assignment
--
-- WHY IT HAPPENED
--   * Migration 00009 attached the set_updated_at() trigger to 18
--     tables — including public.ads — but ads was created (00005)
--     WITHOUT an updated_at column. PL/pgSQL only checks a
--     "record field" assignment when the trigger actually FIRES,
--     not when it is created.
--   * The old setup script (00020) re-created the unsafe function
--     and ran "update public.ads …" BEFORE adding the column —
--     the trigger fired, Postgres aborted the script, and every
--     statement after it (site_features, the news/ads feature
--     flags, topics.school_id / topics.year) never ran.
--
-- WHAT THAT BROKE (all fixed below)
--   * ads: every edit + the impression/click counters (500s)
--   * importer: auto-created topics with a school selected failed
--     ("topic not created in CMS") because topics.school_id never
--     got added
--   * CMS landing features, module-switch seeds, news desk pieces
--
-- This script is IDEMPOTENT: run it once, ten times, on any state —
-- it heals whatever is missing and changes nothing else.
-- ============================================================

-- ---------- 1. The trigger function, made safe forever ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp the timestamp when this table actually has the column.
  -- (to_jsonb(new) ? 'updated_at' is an exact column test.) With this
  -- guard, the trigger can never abort a write again, no matter which
  -- table it is attached to.
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------- 2. Heal every table that carries the trigger ----------
-- Any public table with a set_updated_at trigger gets updated_at if
-- it is missing — regardless of which earlier run attached it.
do $$
declare
  r record;
begin
  for r in
    select distinct n.nspname as schema_name, c.relname as table_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where p.proname = 'set_updated_at'
      and not t.tgisinternal
      and n.nspname = 'public'
  loop
    execute format(
      'alter table %I.%I add column if not exists updated_at timestamptz not null default now()',
      r.schema_name, r.table_name
    );
  end loop;
end;
$$;

-- ---------- 3. ads: the column that started it all ----------
alter table public.ads
  add column if not exists updated_at timestamptz not null default now();

-- One-time backfill (guarded by a marker, so re-runs never stomp real
-- edit timestamps): stamp existing ads with their creation time.
do $$
begin
  if to_regclass('public.site_settings') is not null
     and not exists (
       select 1 from public.site_settings where key = 'schema_repair_00022'
     )
  then
    update public.ads set updated_at = created_at;
    insert into public.site_settings (key, value)
    values ('schema_repair_00022', 'true'::jsonb);
  end if;
end;
$$;

-- ---------- 4. News desk ----------
create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  content_md text not null default '',
  category text not null default 'general',
  source_url text,
  source_label text,
  image_url text,
  status text not null default 'draft',
  pinned boolean not null default false,
  auto boolean not null default false,
  dedupe_key text unique,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_status_check check (status in ('draft', 'published')),
  constraint news_category_check
    check (category in ('research', 'exams', 'campus', 'jobs', 'general'))
);
create index if not exists news_articles_published_idx
  on public.news_articles (status, pinned desc, published_at desc);
alter table public.news_articles enable row level security;
drop policy if exists "news_select_all" on public.news_articles;
create policy "news_select_all" on public.news_articles for select using (true);
drop trigger if exists set_updated_at_news_articles on public.news_articles;
create trigger set_updated_at_news_articles
  before update on public.news_articles
  for each row execute function public.set_updated_at();

-- ---------- 5. ads: multi-placement + size ----------
alter table public.ads add column if not exists placements text[] not null default '{}';
update public.ads set placements = array[placement::text]
where cardinality(placements) = 0;
create or replace function public.ads_sync_placement()
returns trigger language plpgsql as $$
begin
  if new.placements is not null and cardinality(new.placements) > 0 then
    new.placements := (
      select array_agg(distinct p)
      from unnest(new.placements) as p
      where p in ('jobs', 'events', 'resources', 'sidebar', 'banner')
    );
    if new.placements is null or cardinality(new.placements) = 0 then
      raise exception 'ads.placements must contain at least one valid placement';
    end if;
    new.placement := (new.placements[1])::public.ad_placement;
  else
    new.placements := array[new.placement::text];
  end if;
  return new;
end;
$$;
drop trigger if exists ads_sync_placement_trigger on public.ads;
create trigger ads_sync_placement_trigger
  before insert or update of placement, placements on public.ads
  for each row execute function public.ads_sync_placement();
alter table public.ads drop constraint if exists ads_placements_valid;
alter table public.ads add constraint ads_placements_valid
  check (cardinality(placements) between 1 and 5);
create index if not exists ads_placements_idx on public.ads using gin (placements);
alter table public.ads add column if not exists size text not null default 'standard';
alter table public.ads drop constraint if exists ads_size_check;
alter table public.ads add constraint ads_size_check
  check (size in ('compact', 'standard', 'large'));

-- ---------- 6. CMS landing features ----------
create table if not exists public.site_features (
  id uuid primary key default gen_random_uuid(),
  icon text not null default 'atom',
  title text not null,
  description text not null default '',
  href text not null default '#',
  enabled boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.site_features enable row level security;
drop policy if exists "site_features_select_all" on public.site_features;
create policy "site_features_select_all" on public.site_features for select using (true);
drop trigger if exists set_updated_at_site_features on public.site_features;
create trigger set_updated_at_site_features
  before update on public.site_features
  for each row execute function public.set_updated_at();
insert into public.site_features (icon, title, description, href, order_index)
select * from (values
  ('atom', 'Exam zones', 'CAT 1, CAT 2 and Main exam banks organised by topic.', '/zones', 0),
  ('brain-circuit', 'AI tutor', 'Ask anything — explanations, practice and exam prep.', '/ai/tutor', 1),
  ('newspaper', 'News & updates', 'Live biochemistry stories and campus notices.', '/news', 2),
  ('briefcase', 'Job board', 'Internships and lab assistant openings for students.', '/jobs', 3)
) as seed(icon, title, description, href, order_index)
where not exists (select 1 from public.site_features);

-- ---------- 7. Feature flags ----------
insert into public.feature_flags (key, enabled, description) values
  ('news', true, 'News & live updates (landing section, /news page, dashboard strip)'),
  ('ads_enabled', true, 'Show ads in the selected placements')
on conflict (key) do nothing;
update public.feature_flags set enabled = true, updated_at = now()
where key = 'ads_enabled';

-- ---------- 8. Topics: school / year scoping (the importer needs this) ----------
alter table public.topics add column if not exists school_id uuid references public.schools (id) on delete cascade;
alter table public.topics add column if not exists year integer check (year between 1 and 8);
create index if not exists topics_school_year_idx on public.topics (school_id, year);

-- ---------- 9. Course units (BIO 205 · "Biochemistry of Plants" …) ----------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  year integer not null check (year between 1 and 8),
  semester integer check (semester between 1 and 3),
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.units enable row level security;
drop policy if exists "units_select_all" on public.units;
create policy "units_select_all" on public.units for select using (true);
create index if not exists units_school_year_idx
  on public.units (school_id, year, order_index);
create unique index if not exists units_school_code_key
  on public.units (school_id, code);
drop trigger if exists set_updated_at_units on public.units;
create trigger set_updated_at_units
  before update on public.units
  for each row execute function public.set_updated_at();
alter table public.topics add column if not exists unit_id uuid references public.units (id) on delete set null;
create index if not exists topics_unit_idx on public.topics (unit_id);
`;

export async function GET(): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return Response.json(
      {
        configured: false,
        checks: [
          {
            id: "supabase",
            label: "Supabase service key",
            ok: false,
            detail: "SUPABASE_SERVICE_ROLE_KEY is not set on this deployment",
          },
        ],
        fixSql: FIX_SQL,
      },
      { status: 200 },
    );
  }

  const tables = await Promise.all(
    [
      "profiles",
      "schools",
      "topics",
      "notes",
      "questions",
      "ads",
      "site_settings",
      "feature_flags",
      "site_features",
      "news_articles",
      "support_tickets",
      "units",
    ].map((table) => tableExists(probeOf(admin), table)),
  );

  const columns = await Promise.all([
    columnExists(probeOf(admin), "ads", "placements", "ads.placements (multi-placement)"),
    columnExists(probeOf(admin), "ads", "size", "ads.size (ad size control)"),
    columnExists(probeOf(admin), "topics", "school_id", "topics.school_id (school scoping)"),
    columnExists(probeOf(admin), "topics", "unit_id", "topics.unit_id (course-unit scoping)"),
  ]);

  return Response.json({
    configured: true,
    checks: [...tables, ...columns],
    fixSql: FIX_SQL,
    aiConfigured: gatewayConfigured(),
  });
}
