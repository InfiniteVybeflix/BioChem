-- ============================================================
-- BioChem 00018 — Ads multi-placement & sizes, CMS site features
--
-- * ads.placements  — one ad can now appear in SEVERAL slots
--   (dashboard banner + sidebar + jobs…). The legacy `placement`
--   column is kept in sync (first entry) by trigger so older
--   queries keep working.
-- * ads.size        — compact | standard | large rendering size,
--   chosen per ad in the console.
-- * feature_flags.ads_enabled defaults to ON — placements created
--   in the console are live for students immediately; the switch
--   can still be turned off any time.
-- * site_features   — CMS-managed landing-page feature cards
--   (add / edit / reorder / hide from the console CMS Features tab).
-- ============================================================

-- ---------------------------------------------------------------------------
-- ads: multi-placement
-- ---------------------------------------------------------------------------

alter table public.ads add column if not exists placements text[] not null default '{}';

-- Backfill: every existing ad targets exactly its current slot.
update public.ads
set placements = array[placement::text]
where cardinality(placements) = 0;

-- Keep the legacy single-placement column aligned with placements[1]
-- so pre-00018 readers (and the fallback query path) stay correct.
create or replace function public.ads_sync_placement()
returns trigger
language plpgsql
as $$
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

-- ---------------------------------------------------------------------------
-- ads: rendering size
-- ---------------------------------------------------------------------------

alter table public.ads add column if not exists size text not null default 'standard';

alter table public.ads drop constraint if exists ads_size_check;
alter table public.ads add constraint ads_size_check
  check (size in ('compact', 'standard', 'large'));

-- ---------------------------------------------------------------------------
-- Ads live by default (the console can still switch them off)
-- ---------------------------------------------------------------------------

update public.feature_flags
set enabled = true, updated_at = now()
where key = 'ads_enabled';

-- ---------------------------------------------------------------------------
-- CMS-managed landing-page feature cards
-- ---------------------------------------------------------------------------

create table if not exists public.site_features (
  id uuid primary key default gen_random_uuid(),
  icon text not null default 'sparkles',
  title text not null,
  description text not null default '',
  href text,
  enabled boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_features enable row level security;

drop policy if exists "site_features_select_all" on public.site_features;
create policy "site_features_select_all" on public.site_features
  for select using (true);

-- Seed the cards that were previously hardcoded on the landing page —
-- only when the table is empty so re-running never duplicates.
insert into public.site_features (icon, title, description, href, order_index)
select * from (values
  ('layers',
   'Exam zones that match your course',
   'CAT 1, CAT 2 and Main Exam zones — each with a topic tree, LaTeX-rendered notes and an outcomes checklist tracking exactly what you must know.',
   '/explore', 0),
  ('brain-circuit',
   'AI tutor grounded in your notes',
   'Ask anything. Get answers that cite your actual course notes, in exam-answer, ELI5 or step-by-step mode — with full conversation memory.',
   '/ai', 1),
  ('atom',
   'Flashcards with real spaced repetition',
   'An SM-2 scheduling engine builds your daily review queue. Cards you struggle with come back sooner; mastered ones fade out.',
   '/flashcards', 2),
  ('graduation-cap',
   'Mock exams with instant grading',
   'Configurable timers, auto-graded answers, question-by-question review and a score-history chart that shows your trajectory.',
   '/mocks', 3),
  ('calendar',
   'Planner that actually plans',
   'Drag-and-drop timetable, exam countdowns, reminder alarms — and an AI assistant that fills your free evenings with the right revision.',
   '/planner', 4),
  ('messages-square',
   'Community with lecturer-verified answers',
   'Per-topic discussions, upvotes, @mentions and a realtime course chat room — with badges marking answers your lecturers verified.',
   '/community', 5),
  ('trophy',
   'Credit where it''s due',
   'Every contributed note carries its author''s name, and the leaderboard ranks the classmates who lift the whole year group.',
   '/leaderboard', 6),
  ('download',
   'Installable & offline-friendly',
   'A real PWA: notes, questions and attempted mocks cache for offline study, with background sync when you reconnect.',
   '/signup', 7)
) as seed(icon, title, description, href, order_index)
where not exists (select 1 from public.site_features);
