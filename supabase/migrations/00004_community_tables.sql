-- ============================================================
-- BioChem 00004 — Community tables
-- submissions, discussions, replies, upvotes, chat, reports
-- ============================================================

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.submission_type not null,
  topic_id uuid references public.topics (id) on delete set null,
  title text not null,
  content_md text,
  payload jsonb not null default '{}'::jsonb,
  status public.content_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index submissions_status_idx on public.submissions (status, created_at desc);
create index submissions_user_idx on public.submissions (user_id);

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body_md text not null,
  is_answered boolean not null default false,
  is_pinned boolean not null default false,
  views integer not null default 0,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_md, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index discussions_topic_idx on public.discussions (topic_id);
create index discussions_activity_idx on public.discussions (last_activity_at desc);
create index discussions_search_idx on public.discussions using gin (search);

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_reply_id uuid references public.discussion_replies (id) on delete cascade,
  body_md text not null,
  is_verified boolean not null default false,
  verified_by uuid references public.profiles (id) on delete set null,
  upvotes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index replies_discussion_idx on public.discussion_replies (discussion_id, created_at);

create table public.discussion_upvotes (
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (discussion_id, user_id)
);

create table public.reply_upvotes (
  reply_id uuid not null references public.discussion_replies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  room text not null default 'general',
  body text not null check (char_length(body) between 1 and 1000),
  is_deleted boolean not null default false,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index chat_messages_room_idx on public.chat_messages (room, created_at desc);
-- Realtime publication is enabled for this table in 00011.

create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  reason text not null,
  status public.chat_report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index chat_reports_status_idx on public.chat_reports (status, created_at desc);
