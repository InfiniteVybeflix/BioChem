-- ============================================================
-- BioChem 00012 — Schools, onboarding, academic years, CMS
--
-- * schools: managed from the operations console (no seed data —
--   the platform starts empty and real schools are added by the
--   administrator).
-- * profiles: school + year of study + approval state for staff.
-- * topics: optionally scoped to a school and a study year.
-- * site_settings: CMS values the administrator edits live.
-- * The staff role now requires approval before any capability
--   is granted (is_staff checks `approved`).
-- ============================================================

-- ---------- schools ----------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  country text not null default 'Kenya',
  logo_url text,
  max_years integer not null default 4 check (max_years between 1 and 8),
  current_academic_year text not null default '',
  year_advance_at timestamptz,
  last_advanced_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools enable row level security;

-- Anyone (including guests on the landing page) can read schools;
-- only the service role (operations console) can write them.
create policy "schools_select_all" on public.schools
  for select using (true);

create trigger set_updated_at_schools
  before update on public.schools
  for each row execute function public.set_updated_at();

-- ---------- profiles: school, year, approval, onboarding ----------
alter table public.profiles
  add column school_id uuid references public.schools (id) on delete set null,
  add column year_of_study integer check (year_of_study between 1 and 8),
  add column year_synced_at timestamptz,
  add column approved boolean not null default true,
  add column onboarding_done boolean not null default false;

create index profiles_school_idx on public.profiles (school_id);

-- ---------- topics: school / year scoping ----------
alter table public.topics
  add column school_id uuid references public.schools (id) on delete cascade,
  add column year integer check (year between 1 and 8);

create index topics_school_year_idx on public.topics (school_id, year);

-- ---------- site settings (CMS) ----------
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

create policy "site_settings_select_all" on public.site_settings
  for select using (true);

create trigger set_updated_at_site_settings
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Default branding values — every one of these is editable live
-- from the operations console (CMS → Site content).
insert into public.site_settings (key, value) values
  ('branding', jsonb_build_object(
    'site_name', 'BioChem',
    'tagline', 'The complete biochemistry study platform',
    'built_by', 'Aevibron'
  )),
  ('landing', jsonb_build_object(
    'hero_title', 'Master biochemistry. Together.',
    'hero_subtitle', 'Exam zones, an AI tutor grounded in your course notes, a smart planner, community, and jobs — in one installable app.',
    'schools_blurb', 'BioChem is live for students at these schools. Yours is not on the list? Ask a class rep or contact support.'
  )),
  ('support', jsonb_build_object(
    'contact_note', 'Found a bug, have a complaint, or need help? Send a message to the platform team — replies land right here in the app.'
  ))
on conflict (key) do nothing;

-- ---------- feature flags for the new modules ----------
insert into public.feature_flags (key, enabled, description) values
  ('messages', true, 'Direct and group messaging with encrypted attachments'),
  ('ai_assistant', true, 'AI notes/question assistant for staff')
on conflict (key) do nothing;

-- ---------- role model updates ----------
-- Staff accounts are created via sign-up (role=lecturer) but stay
-- unapproved until the administrator activates them in the console.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'lecturer'::public.user_role
      and approved
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role := case lower(coalesce(new.raw_user_meta_data ->> 'role', ''))
    when 'lecturer' then 'lecturer'::public.user_role
    else 'student'::public.user_role
  end;
begin
  insert into public.profiles (id, full_name, role, approved)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    ),
    v_role,
    v_role <> 'lecturer'::public.user_role
  )
  on conflict (id) do nothing;

  insert into public.notification_prefs (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.daily_question_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.leaderboard_entries (user_id, period) values (new.id, 'all_time')
  on conflict (user_id, period) do nothing;

  return new;
end;
$$;

-- approval + year_synced_at are service-managed columns.
create or replace function public.guard_profiles_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.role() <> 'service_role' then
    raise exception 'Roles are managed by the platform';
  end if;
  if (new.approved, new.year_synced_at) is distinct from (old.approved, old.year_synced_at)
     and current_setting('biochem.internal_write', true) <> 'on'
     and auth.role() <> 'service_role' then
    raise exception 'approved / year_synced_at are managed by the platform';
  end if;
  if (new.xp, new.streak_count, new.longest_streak, new.last_active_date)
     is distinct from
     (old.xp, old.streak_count, old.longest_streak, old.last_active_date)
     and current_setting('biochem.internal_write', true) <> 'on'
     and auth.role() <> 'service_role' then
    raise exception 'xp/streak columns are managed by award_xp() and touch_streak()';
  end if;
  return new;
end;
$$;

-- Users may set their own school / year during onboarding (and change
-- them in settings); everything else stays service-managed.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, timezone, school_id, year_of_study, onboarding_done, updated_at)
  on public.profiles to authenticated;

-- ---------- academic year sync ----------
-- Called (cheaply) whenever a student opens the app: if the school's
-- academic-year boundary has passed, the student moves up one year.
-- Idempotent; safe to call on every request.
create or replace function public.sync_my_year()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv timestamptz;
  v_max integer;
begin
  if auth.uid() is null then
    raise exception 'sync_my_year requires an authenticated user';
  end if;

  select s.year_advance_at, s.max_years
    into v_adv, v_max
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.id = auth.uid();

  if v_adv is null or v_adv > now() then
    return 0;
  end if;

  perform set_config('biochem.internal_write', 'on', true);

  update public.profiles
     set year_of_study = least(coalesce(year_of_study, 1) + 1, v_max),
         year_synced_at = v_adv
   where id = auth.uid()
     and (year_synced_at is null or year_synced_at < v_adv);

  update public.schools
     set current_academic_year = case
           when current_academic_year ~ '^\d{4}/\d{4}$'
             then (split_part(current_academic_year, '/', 1)::int + 1)::text
                  || '/' ||
                  (split_part(current_academic_year, '/', 2)::int + 1)::text
           else current_academic_year
         end,
         last_advanced_at = v_adv,
         updated_at = now()
   where year_advance_at is not null
     and year_advance_at <= now()
     and (last_advanced_at is null or last_advanced_at < year_advance_at);

  return 1;
end;
$$;

-- Console action: advance every student of a school immediately
-- (service role only — invoked from the operations console API).
create or replace function public.advance_school_year(p_school uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adv timestamptz;
  v_max integer;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'advance_school_year is restricted to the service role';
  end if;

  select year_advance_at, max_years into v_adv, v_max
  from public.schools where id = p_school;

  if v_adv is null then
    raise exception 'No academic-year boundary is set for this school';
  end if;

  update public.profiles
     set year_of_study = least(coalesce(year_of_study, 1) + 1, v_max),
         year_synced_at = greatest(v_adv, now())
   where school_id = p_school
     and role = 'student'::public.user_role
     and (year_synced_at is null or year_synced_at < v_adv);
  get diagnostics v_count = row_count;

  update public.schools
     set current_academic_year = case
           when current_academic_year ~ '^\d{4}/\d{4}$'
             then (split_part(current_academic_year, '/', 1)::int + 1)::text
                  || '/' ||
                  (split_part(current_academic_year, '/', 2)::int + 1)::text
           else current_academic_year
         end,
         last_advanced_at = greatest(v_adv, now()),
         updated_at = now()
   where id = p_school;

  return v_count;
end;
$$;

-- ---------- retire the in-app administrator account model ----------
-- Platform administration now happens exclusively through the
-- operations console (environment credentials + service role).
drop policy if exists "admin_security_select_own" on public.admin_security;
drop policy if exists "admin_security_insert_own" on public.admin_security;
drop policy if exists "admin_security_update_own" on public.admin_security;
drop table if exists public.admin_security;
