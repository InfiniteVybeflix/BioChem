-- ============================================================
-- BioChem 00002 — Core content tables
-- profiles, admin_security, topics, notes, outcomes, progress, questions
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'Student',
  avatar_url text,
  role public.user_role not null default 'student',
  xp integer not null default 0 check (xp >= 0),
  streak_count integer not null default 0 check (streak_count >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_active_date date,
  timezone text not null default 'Africa/Nairobi',
  suspended boolean not null default false,
  suspension_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_security (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- PBKDF2-SHA256 hash, format: salt$iterations$hash (base64)
  passhash text not null,
  updated_at timestamptz not null default now()
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  zone public.exam_zone not null,
  parent_id uuid references public.topics (id) on delete set null,
  title text not null,
  slug text not null unique,
  description text,
  order_index integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index topics_zone_idx on public.topics (zone);
create index topics_parent_idx on public.topics (parent_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  title text not null,
  slug text not null unique,
  summary text,
  content_md text not null,
  status public.content_status not null default 'pending',
  is_exam_critical boolean not null default false,
  contributed_by uuid references public.profiles (id) on delete set null,
  published_by uuid references public.profiles (id) on delete set null,
  reading_minutes integer not null default 5 check (reading_minutes between 1 and 120),
  tags text[] not null default '{}',
  views integer not null default 0,
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content_md, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index notes_topic_idx on public.notes (topic_id);
create index notes_status_idx on public.notes (status);
create index notes_search_idx on public.notes using gin (search);
create index notes_tags_idx on public.notes using gin (tags);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  code text not null,
  statement text not null,
  order_index integer not null default 0,
  unique (topic_id, code)
);

create table public.user_outcome_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outcome_id uuid not null references public.outcomes (id) on delete cascade,
  mastered boolean not null default false,
  confidence smallint not null default 0 check (confidence between 0 and 3),
  updated_at timestamptz not null default now(),
  unique (user_id, outcome_id)
);

create index uop_user_idx on public.user_outcome_progress (user_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics (id) on delete set null,
  zone public.exam_zone not null,
  difficulty public.difficulty not null default 'medium',
  type public.question_type not null default 'mcq',
  stem_md text not null,
  options jsonb not null default '[]'::jsonb,
  answer_key text not null,
  explanation_md text not null default '',
  marks integer not null default 1 check (marks between 1 and 30),
  source text not null default 'bank',
  created_by uuid references public.profiles (id) on delete set null,
  status public.content_status not null default 'published',
  tags text[] not null default '{}',
  search tsvector generated always as (
    to_tsvector('english', coalesce(stem_md, '') || ' ' || coalesce(explanation_md, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_topic_idx on public.questions (topic_id);
create index questions_zone_diff_idx on public.questions (zone, difficulty);
create index questions_status_idx on public.questions (status);
create index questions_search_idx on public.questions using gin (search);
