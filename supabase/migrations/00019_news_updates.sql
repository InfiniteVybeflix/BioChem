-- ============================================================
-- BioChem 00019 — News & live updates
--
-- A CMS-managed news desk:
--   * the console can hand-write articles (campus notices, exam
--     announcements) and/or let the AI digest live internet sources
--     (RSS feeds) into student-facing updates;
--   * auto mode (settings JSON in site_settings.key='news') fetches
--     the feeds on an interval and either publishes or queues drafts;
--   * students see the feed on the landing page news section and in
--     the signed-in /news page + dashboard strip.
-- ============================================================

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

-- Articles are readable by everyone (public pages render them);
-- writes go through the console with the service-role client.
drop policy if exists "news_select_all" on public.news_articles;
create policy "news_select_all" on public.news_articles
  for select using (true);

create trigger set_updated_at_news_articles
  before update on public.news_articles
  for each row execute function public.set_updated_at();

-- ---------- News flag for the module-switch lists ----------
insert into public.feature_flags (key, enabled, description) values
  ('news', true, 'News & live updates (landing section, /news page, dashboard strip)')
on conflict (key) do nothing;
