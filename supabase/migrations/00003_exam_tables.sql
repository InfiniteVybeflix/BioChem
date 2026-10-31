-- ============================================================
-- BioChem 00003 — Exam tables
-- exams, exam_questions, exam_attempts, flashcards, flashcard_reviews
-- ============================================================

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  zone public.exam_zone not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 300),
  total_marks integer not null default 0 check (total_marks >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  is_past_paper boolean not null default false,
  past_paper_url text,
  worked_solutions_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exams_zone_idx on public.exams (zone, is_past_paper, published);

create table public.exam_questions (
  exam_id uuid not null references public.exams (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  order_index integer not null default 0,
  marks integer not null default 1,
  primary key (exam_id, question_id)
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exam_id uuid references public.exams (id) on delete set null,
  zone public.exam_zone not null,
  mode text not null default 'mock'
    check (mode in ('practice', 'mock', 'custom', 'past_paper')),
  config jsonb not null default '{}'::jsonb,
  question_ids uuid[] not null default '{}',
  answers jsonb not null default '{}'::jsonb,
  score numeric(6,2) not null default 0,
  max_score numeric(6,2) not null default 0,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create index exam_attempts_user_idx on public.exam_attempts (user_id, status);
create index exam_attempts_zone_idx on public.exam_attempts (zone, submitted_at desc);

create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics (id) on delete set null,
  note_id uuid references public.notes (id) on delete cascade,
  front_md text not null,
  back_md text not null,
  source text not null default 'manual' check (source in ('manual', 'ai', 'community')),
  visibility public.visibility not null default 'public',
  created_by uuid references public.profiles (id) on delete set null,
  status public.content_status not null default 'published',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_due_pool_idx on public.flashcards (status, visibility, topic_id);

create table public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  flashcard_id uuid not null references public.flashcards (id) on delete cascade,
  ease real not null default 2.5 check (ease between 1.3 and 3.0),
  interval_days real not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  due_date date not null default current_date,
  last_reviewed_at timestamptz,
  unique (user_id, flashcard_id)
);

create index flashcard_reviews_due_idx on public.flashcard_reviews (user_id, due_date);
