-- ============================================================
-- 00024 — Answer control & attempt marking
--
-- Lecturers (and the operations console) can now decide WHEN the
-- answer of a bank question becomes visible to students:
--
--   answers_hidden     = the answer/explanation are withheld
--   answers_release_at = optional moment the answer opens up
--                        (NULL = released manually, whenever the
--                        lecturer flips answers_hidden off)
--
-- While a question is locked the answer key and explanation are
-- stripped from every student-facing payload — the /api/questions/
-- [id] route hands them out only when the lecturer's rule allows it.
--
-- Every MCQ attempt is recorded in question_attempts so students get
-- instant right/wrong feedback (scored on the server) and lecturers
-- can review and mark attempts from the lecturer panel.
--
-- IDEMPOTENT: safe to run once, ten times, on any state.
-- ============================================================

-- ---------- 1. questions: answer visibility controls ----------
alter table public.questions
  add column if not exists answers_hidden boolean not null default false;

alter table public.questions
  add column if not exists answers_release_at timestamptz;

create index if not exists questions_release_idx
  on public.questions (answers_hidden, answers_release_at);

-- ---------- 2. question_attempts ----------
create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- For MCQs the chosen option key ("A".."D"); free text for written types.
  selected text not null default '',
  -- Server-scored result for MCQs (selected matches answer_key).
  auto_correct boolean,
  -- Lecturer marking: overrides/adds to the auto score.
  marked_by uuid references public.profiles (id) on delete set null,
  marked_result text check (marked_result in ('correct', 'incorrect')),
  marked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists question_attempts_question_idx
  on public.question_attempts (question_id, created_at desc);
create index if not exists question_attempts_user_idx
  on public.question_attempts (user_id, created_at desc);

alter table public.question_attempts enable row level security;

drop policy if exists "question_attempts_select_own_or_staff" on public.question_attempts;
create policy "question_attempts_select_own_or_staff" on public.question_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop policy if exists "question_attempts_insert_own" on public.question_attempts;
create policy "question_attempts_insert_own" on public.question_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

-- Only staff mark attempts (set/clear marked_result).
drop policy if exists "question_attempts_update_staff" on public.question_attempts;
create policy "question_attempts_update_staff" on public.question_attempts
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
