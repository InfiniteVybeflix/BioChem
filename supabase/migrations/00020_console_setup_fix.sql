-- ============================================================
-- BioChem 00020 — Console setup fix (idempotent; safe to re-run)
--
-- One script that brings ANY deployment up to the current schema.
-- Every statement is guarded (if not exists / drop-if-exists), so
-- running it on a fully-migrated database changes nothing.
--
-- Covers the tables/columns the console depends on:
--   * news_articles        (00019 — news desk)
--   * ads.placements / size (00018 — multi-placement + sizes)
--   * site_features         (00018 — CMS landing feature cards)
--   * feature_flags news / ads_enabled seeds
--   * topics.school_id / year (00012 — school scoping, if missing)
-- ============================================================

-- ---------- helper trigger function ----------
-- Defensive version: only stamps updated_at on tables that actually
-- have the column. (ads didn't — the unguarded assignment aborted
-- every ads write with 42703, which also killed this script itself.)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ---------- ads: the missing updated_at column ----------
-- Must exist BEFORE any update runs against ads, or the
-- set_updated_at trigger aborts the statement (see migration 00021/00022).
alter table public.ads
  add column if not exists updated_at timestamptz not null default now();

-- ---------- news desk ----------
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

-- ---------- ads: multi-placement + size ----------
alter table public.ads add column if not exists placements text[] not null default '{}';
-- (ads.updated_at is ensured right after the trigger function above,
--  so this update can no longer trip the trigger.)
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

-- ---------- CMS landing features ----------
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

-- ---------- feature flags ----------
insert into public.feature_flags (key, enabled, description) values
  ('news', true, 'News & live updates (landing section, /news page, dashboard strip)'),
  ('ads_enabled', true, 'Show ads in the selected placements')
on conflict (key) do nothing;
update public.feature_flags set enabled = true, updated_at = now()
where key = 'ads_enabled';

-- ---------- topics: school / year scoping (if ever missing) ----------
alter table public.topics add column if not exists school_id uuid references public.schools (id) on delete cascade;
alter table public.topics add column if not exists year integer check (year between 1 and 8);
create index if not exists topics_school_year_idx on public.topics (school_id, year);
