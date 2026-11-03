-- 00025 — Onboarding: semester of study
--
-- Students already pick their school and year of study during onboarding
-- (00012). This closes the loop by adding the SEMESTER, so the dashboard,
-- unit lists and study plans can be tailored to the current half of the
-- academic year. Units carry `semester (1–3)` (00023); profiles now match.
--
-- Idempotent: safe to run more than once. After running it, redeploy the
-- app (the wizard saves `semester` during onboarding).

-- ---------- profiles.semester ----------
alter table public.profiles
  add column if not exists semester integer check (semester between 1 and 3);

comment on column public.profiles.semester is
  'Semester the student is currently in (1–3), chosen during onboarding. Null for staff and for students who onboarded before this column existed.';

-- ---------- permissions ----------
-- 00012 locked profile updates down to an explicit column list. New
-- columns are NOT writable until granted, so re-issue the grant including
-- `semester` — otherwise the onboarding wizard would silently fail to
-- save it for students.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, timezone, school_id, year_of_study, semester,
              onboarding_done, updated_at)
  on public.profiles to authenticated;
