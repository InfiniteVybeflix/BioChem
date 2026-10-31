-- ============================================================
-- BioChem 00008 — System tables
-- announcements, feature flags, leaderboard, xp, ai usage + queue
-- ============================================================

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body_md text not null,
  audience text not null default 'all' check (audience in ('all', 'students', 'lecturers')),
  created_at timestamptz not null default now()
);

create index announcements_created_idx on public.announcements (created_at desc);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  period text not null check (period = 'all_time' or period ~ '^[0-9]{4}-[0-9]{2}$'),
  points integer not null default 0,
  contributions integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period)
);

create index leaderboard_period_idx on public.leaderboard_entries (period, points desc);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index xp_events_user_idx on public.xp_events (user_id, created_at desc);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  task public.ai_task_type not null,
  model text not null,
  status text not null default 'ok' check (status in ('ok', 'queued', 'failed')),
  latency_ms integer,
  created_at timestamptz not null default now()
);

-- Sliding-window rate limiting: one row per AI call, counted per user+task.
create index ai_usage_rate_idx on public.ai_usage (user_id, task, created_at desc);

create table public.ai_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  task public.ai_task_type not null,
  payload jsonb not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  status public.ai_queue_status not null default 'pending',
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index ai_queue_pending_idx on public.ai_queue (status, next_attempt_at) where status = 'pending';
