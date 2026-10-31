-- ============================================================
-- BioChem 00007 — AI tables
-- conversations, messages, daily questions, study plans, planner
-- ============================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'New conversation',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  grounding_note_ids uuid[] not null default '{}',
  model text,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

create table public.daily_question_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  topic_ids uuid[] not null default '{}',
  difficulty public.difficulty not null default 'medium',
  count integer not null default 5 check (count between 1 and 20),
  delivery_time time not null default '07:00',
  timezone text not null default 'Africa/Nairobi',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  for_date date not null default current_date,
  topic_id uuid references public.topics (id) on delete set null,
  difficulty public.difficulty not null default 'medium',
  payload jsonb not null,
  selected_answer text,
  is_correct boolean,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index daily_questions_user_date_idx on public.daily_questions (user_id, for_date desc);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'My study plan',
  source text not null default 'ai' check (source in ('ai', 'manual')),
  raw_input text,
  plan jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index study_plans_user_idx on public.study_plans (user_id, created_at desc);

create table public.plan_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  study_plan_id uuid references public.study_plans (id) on delete set null,
  title text not null,
  type public.plan_event_type not null default 'study',
  day_of_week smallint check (day_of_week between 0 and 6),
  date date,
  start_time time not null default '18:00',
  end_time time not null default '19:00',
  notes text,
  color text not null default 'teal',
  reminder_minutes integer check (reminder_minutes is null or reminder_minutes >= 0),
  reminder_sent_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (day_of_week is not null and date is null)
    or (day_of_week is null and date is not null)
  )
);

create index plan_events_user_idx on public.plan_events (user_id, day_of_week);
create index plan_events_date_idx on public.plan_events (date);
