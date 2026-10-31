-- ============================================================
-- BioChem 00009 — Functions & triggers
-- ============================================================

-- ---------- helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Role helpers (SECURITY DEFINER to avoid RLS recursion on profiles).
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'student'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin'::public.user_role;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('lecturer'::public.user_role, 'admin'::public.user_role);
$$;

-- ---------- updated_at triggers ----------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','topics','notes','questions','exams','flashcards','discussions',
    'discussion_replies','jobs','ads','ai_conversations','study_plans','plan_events',
    'feature_flags','leaderboard_entries','daily_question_settings','notification_prefs',
    'submissions'
  ]
  loop
    execute format(
      'create trigger set_updated_at_%1$s before update on public.%1$s
       for each row execute function public.set_updated_at();', t);
  end loop;
end;
$$;

-- ---------- new user bootstrap ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    )
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- profile guards ----------
-- Sensitive columns (role, xp, streaks, suspension) are only writable by
-- SECURITY DEFINER functions and the service role. Column grants below
-- enforce this even if a row-level policy were to pass.

create or replace function public.guard_profiles_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (API routes) bypasses the role check; the app layer
  -- enforces requireUser('manage_users') before those calls.
  if new.role is distinct from old.role
     and auth.role() <> 'service_role'
     and not public.is_admin() then
    raise exception 'Only admins can change roles';
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

create trigger guard_profiles_update_trigger
before update on public.profiles
for each row execute function public.guard_profiles_update();

revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, timezone, updated_at) on public.profiles to authenticated;

-- ---------- XP & leaderboard ----------

create or replace function public.award_xp(p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_new_total integer;
begin
  if v_user is null then
    raise exception 'award_xp requires an authenticated user';
  end if;

  perform set_config('biochem.internal_write', 'on', true);

  insert into public.xp_events (user_id, amount, reason)
  values (v_user, p_amount, p_reason);

  update public.profiles
  set xp = xp + p_amount
  where id = v_user
  returning xp into v_new_total;

  insert into public.leaderboard_entries (user_id, period, points)
  values (v_user, 'all_time', p_amount)
  on conflict (user_id, period)
  do update set points = public.leaderboard_entries.points + p_amount, updated_at = now();

  return v_new_total;
end;
$$;

-- Staff variant: awards XP to a specific user (e.g. a student whose
-- submission was approved). Callable only by lecturers/admins.
create or replace function public.award_xp_to(p_user uuid, p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_total integer;
begin
  if not public.is_staff() then
    raise exception 'Only lecturers and admins can award XP to another user';
  end if;
  if p_user is null then
    raise exception 'award_xp_to requires a target user';
  end if;

  perform set_config('biochem.internal_write', 'on', true);

  insert into public.xp_events (user_id, amount, reason)
  values (p_user, p_amount, p_reason);

  update public.profiles
  set xp = xp + p_amount
  where id = p_user
  returning xp into v_new_total;

  insert into public.leaderboard_entries (user_id, period, points)
  values (p_user, 'all_time', p_amount)
  on conflict (user_id, period)
  do update set points = public.leaderboard_entries.points + p_amount, updated_at = now();

  return v_new_total;
end;
$$;

-- Recomputes the current month's leaderboard rows (xp + contributions).
create or replace function public.refresh_monthly_leaderboard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(now(), 'YYYY-MM');
begin
  delete from public.leaderboard_entries where period = v_period;

  insert into public.leaderboard_entries (user_id, period, points)
  select user_id, v_period, sum(amount)::integer
  from public.xp_events
  where created_at >= date_trunc('month', now())
  group by user_id;

  -- contributions: published notes + approved submissions this month
  insert into public.leaderboard_entries (user_id, period, contributions)
  select user_id, v_period, count(*)::integer
  from (
    select contributed_by as user_id from public.notes
    where status = 'published' and contributed_by is not null
      and created_at >= date_trunc('month', now())
    union all
    select user_id from public.submissions
    where status = 'published' and created_at >= date_trunc('month', now())
  ) c
  where user_id is not null
  group by user_id
  on conflict (user_id, period)
  do update set contributions = excluded.contributions, updated_at = now();
end;
$$;

-- ---------- streaks ----------

create or replace function public.touch_streak()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_today date;
  v_streak integer;
begin
  if v_user is null then
    raise exception 'touch_streak requires an authenticated user';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  v_today := (now() at time zone v_profile.timezone)::date;
  v_streak := v_profile.streak_count;

  if v_profile.last_active_date is null then
    v_streak := 1;
  elsif v_profile.last_active_date = v_today then
    return v_streak; -- idempotent within the same day
  elsif v_profile.last_active_date = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  perform set_config('biochem.internal_write', 'on', true);

  update public.profiles
  set last_active_date = v_today,
      streak_count = v_streak,
      longest_streak = greatest(longest_streak, v_streak)
  where id = v_user;

  if v_profile.last_active_date is distinct from v_today then
    perform public.award_xp(2, 'daily_active');
  end if;

  return v_streak;
end;
$$;

-- ---------- community counters ----------

create or replace function public.handle_reply_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.discussions
    set reply_count = reply_count + 1, last_activity_at = now()
    where id = new.discussion_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.discussions
    set reply_count = greatest(reply_count - 1, 0)
    where id = old.discussion_id;
    return old;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger reply_count_trigger
after insert or delete on public.discussion_replies
for each row execute function public.handle_reply_change();

create or replace function public.handle_reply_upvote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.discussion_replies
  set upvotes = upvotes + (case when tg_op = 'INSERT' then 1 else -1 end)
  where id = (case when tg_op = 'INSERT' then new.reply_id else old.reply_id end);
  return coalesce(new, old);
end;
$$;

create trigger reply_upvote_trigger
after insert or delete on public.reply_upvotes
for each row execute function public.handle_reply_upvote();

-- ---------- content counters ----------

create or replace function public.increment_note_views(p_note_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notes set views = views + 1 where id = p_note_id;
$$;

create or replace function public.increment_discussion_views(p_discussion_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.discussions set views = views + 1 where id = p_discussion_id;
$$;

-- ---------- ad statistics ----------

create or replace function public.handle_ad_impression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'click' then
    update public.ads set clicks = clicks + 1 where id = new.ad_id;
  else
    update public.ads set impressions = impressions + 1 where id = new.ad_id;
  end if;
  return new;
end;
$$;

create trigger ad_impression_trigger
after insert on public.ad_impressions
for each row execute function public.handle_ad_impression();
