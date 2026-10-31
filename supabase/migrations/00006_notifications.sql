-- ============================================================
-- BioChem 00006 — Notifications
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  new_notes boolean not null default true,
  mock_results boolean not null default true,
  chat_mentions boolean not null default true,
  daily_questions boolean not null default true,
  announcements boolean not null default true,
  jobs boolean not null default false,
  push_enabled boolean not null default false,
  email_digest boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
