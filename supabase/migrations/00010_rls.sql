-- ============================================================
-- BioChem 00010 — Row Level Security (every table)
--
-- Roles: anon (guest) → browse published content only.
--        student      → study features, submit content (pending review).
--        lecturer     → publish directly, class analytics, verification.
--        admin        → full platform control.
--
-- Privileged flows (ingestion, queue processing, moderation actions,
-- push sending) run through API routes with the service-role key,
-- which bypasses RLS — the app layer enforces role checks there.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.admin_security enable row level security;
alter table public.topics enable row level security;
alter table public.notes enable row level security;
alter table public.outcomes enable row level security;
alter table public.user_outcome_progress enable row level security;
alter table public.questions enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.flashcards enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.submissions enable row level security;
alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.discussion_upvotes enable row level security;
alter table public.reply_upvotes enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
alter table public.jobs enable row level security;
alter table public.job_enquiries enable row level security;
alter table public.ads enable row level security;
alter table public.ad_impressions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.daily_question_settings enable row level security;
alter table public.daily_questions enable row level security;
alter table public.study_plans enable row level security;
alter table public.plan_events enable row level security;
alter table public.announcements enable row level security;
alter table public.feature_flags enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.xp_events enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_queue enable row level security;

-- ---------- profiles ----------
-- Public directory data (name/avatar/role/xp/streak) is visible to everyone
-- including guests (leaderboard + contribution credits need it).
create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- ---------- admin_security ----------
create policy "admin_security_select_own" on public.admin_security
  for select to authenticated using (user_id = auth.uid());
create policy "admin_security_insert_own" on public.admin_security
  for insert to authenticated with check (user_id = auth.uid() and public.is_admin());
create policy "admin_security_update_own" on public.admin_security
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- topics ----------
create policy "topics_select_all" on public.topics
  for select using (true);
create policy "topics_insert_staff" on public.topics
  for insert to authenticated with check (public.is_staff());

-- ---------- notes ----------
create policy "notes_select" on public.notes
  for select using (
    status = 'published'
    or contributed_by = auth.uid()
    or public.is_staff()
  );
create policy "notes_insert_staff" on public.notes
  for insert to authenticated with check (public.is_staff());
create policy "notes_update_own_or_staff" on public.notes
  for update to authenticated
  using (contributed_by = auth.uid() or public.is_staff())
  with check (contributed_by = auth.uid() or public.is_staff());

-- ---------- outcomes ----------
create policy "outcomes_select_all" on public.outcomes
  for select using (true);
create policy "outcomes_insert_staff" on public.outcomes
  for insert to authenticated with check (public.is_staff());

-- ---------- user_outcome_progress ----------
create policy "uop_select_own" on public.user_outcome_progress
  for select to authenticated using (user_id = auth.uid());
create policy "uop_insert_own" on public.user_outcome_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "uop_update_own" on public.user_outcome_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- questions ----------
create policy "questions_select" on public.questions
  for select using (
    status = 'published'
    or created_by = auth.uid()
    or public.is_staff()
  );
create policy "questions_insert_staff" on public.questions
  for insert to authenticated with check (public.is_staff());

-- ---------- exams / exam_questions ----------
create policy "exams_select_published" on public.exams
  for select using (published or created_by = auth.uid() or public.is_staff());
create policy "exams_insert_staff" on public.exams
  for insert to authenticated with check (public.is_staff());
create policy "exams_update_staff" on public.exams
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "exam_questions_select" on public.exam_questions
  for select using (
    exists (select 1 from public.exams e where e.id = exam_id and (e.published or public.is_staff()))
  );
create policy "exam_questions_insert_staff" on public.exam_questions
  for insert to authenticated with check (public.is_staff());

-- ---------- exam_attempts ----------
create policy "attempts_select_own" on public.exam_attempts
  for select to authenticated using (user_id = auth.uid());
create policy "attempts_insert_own" on public.exam_attempts
  for insert to authenticated with check (user_id = auth.uid());
create policy "attempts_update_own" on public.exam_attempts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- flashcards ----------
create policy "flashcards_select" on public.flashcards
  for select using (
    (status = 'published' and visibility = 'public')
    or created_by = auth.uid()
    or public.is_staff()
  );
create policy "flashcards_insert_own" on public.flashcards
  for insert to authenticated with check (created_by = auth.uid());
create policy "flashcards_update_own" on public.flashcards
  for update to authenticated
  using (created_by = auth.uid() or public.is_staff())
  with check (created_by = auth.uid() or public.is_staff());

-- ---------- flashcard_reviews ----------
create policy "reviews_select_own" on public.flashcard_reviews
  for select to authenticated using (user_id = auth.uid());
create policy "reviews_insert_own" on public.flashcard_reviews
  for insert to authenticated with check (user_id = auth.uid());
create policy "reviews_update_own" on public.flashcard_reviews
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- submissions ----------
create policy "submissions_select" on public.submissions
  for select using (
    user_id = auth.uid()
    or public.is_staff()
  );
create policy "submissions_insert_own" on public.submissions
  for insert to authenticated with check (user_id = auth.uid());
create policy "submissions_update_staff" on public.submissions
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- discussions ----------
create policy "discussions_select_all" on public.discussions
  for select using (true);
create policy "discussions_insert_own" on public.discussions
  for insert to authenticated with check (user_id = auth.uid());
create policy "discussions_update_own_or_staff" on public.discussions
  for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- ---------- discussion_replies ----------
create policy "replies_select_all" on public.discussion_replies
  for select using (true);
create policy "replies_insert_own" on public.discussion_replies
  for insert to authenticated with check (user_id = auth.uid());
create policy "replies_update_own_or_staff" on public.discussion_replies
  for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- ---------- upvotes ----------
create policy "discussion_upvotes_select_all" on public.discussion_upvotes
  for select using (true);
create policy "discussion_upvotes_insert_own" on public.discussion_upvotes
  for insert to authenticated with check (user_id = auth.uid());
create policy "discussion_upvotes_delete_own" on public.discussion_upvotes
  for delete to authenticated using (user_id = auth.uid());

create policy "reply_upvotes_select_all" on public.reply_upvotes
  for select using (true);
create policy "reply_upvotes_insert_own" on public.reply_upvotes
  for insert to authenticated with check (user_id = auth.uid());
create policy "reply_upvotes_delete_own" on public.reply_upvotes
  for delete to authenticated using (user_id = auth.uid());

-- ---------- chat ----------
create policy "chat_select_all" on public.chat_messages
  for select using (true);
create policy "chat_insert_own" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid());
create policy "chat_update_staff" on public.chat_messages
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "chat_reports_select_staff_or_own" on public.chat_reports
  for select using (reporter_id = auth.uid() or public.is_staff());
create policy "chat_reports_insert_own" on public.chat_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "chat_reports_update_staff" on public.chat_reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------- jobs ----------
create policy "jobs_select" on public.jobs
  for select using (
    status in ('approved', 'closed')
    or posted_by = auth.uid()
    or public.is_staff()
  );
create policy "jobs_insert_staff" on public.jobs
  for insert to authenticated with check (public.is_staff());
create policy "jobs_update_staff" on public.jobs
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "job_enquiries_select" on public.job_enquiries
  for select using (
    user_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.jobs j
      where j.id = job_id and j.posted_by = auth.uid()
    )
  );
create policy "job_enquiries_insert_own" on public.job_enquiries
  for insert to authenticated with check (user_id = auth.uid());

-- ---------- ads ----------
create policy "ads_select" on public.ads
  for select using (true);
create policy "ads_insert_staff" on public.ads
  for insert to authenticated with check (public.is_admin());
create policy "ads_update_admin" on public.ads
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "ad_impressions_insert" on public.ad_impressions
  for insert to authenticated with check (true);
create policy "ad_impressions_select_admin" on public.ad_impressions
  for select using (public.is_admin());

-- ---------- notifications ----------
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_prefs_select_own" on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
create policy "notification_prefs_insert_own" on public.notification_prefs
  for insert to authenticated with check (user_id = auth.uid());
create policy "notification_prefs_update_own" on public.notification_prefs
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- ---------- AI ----------
create policy "ai_conversations_own" on public.ai_conversations
  for select to authenticated using (user_id = auth.uid());
create policy "ai_conversations_insert_own" on public.ai_conversations
  for insert to authenticated with check (user_id = auth.uid());
create policy "ai_conversations_update_own" on public.ai_conversations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ai_messages_own" on public.ai_messages
  for select to authenticated using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
create policy "ai_messages_insert_own" on public.ai_messages
  for insert to authenticated with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "dq_settings_own" on public.daily_question_settings
  for select to authenticated using (user_id = auth.uid());
create policy "dq_settings_insert_own" on public.daily_question_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "dq_settings_update_own" on public.daily_question_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "daily_questions_own" on public.daily_questions
  for select to authenticated using (user_id = auth.uid());
create policy "daily_questions_insert_own" on public.daily_questions
  for insert to authenticated with check (user_id = auth.uid());
create policy "daily_questions_update_own" on public.daily_questions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "study_plans_own" on public.study_plans
  for select to authenticated using (user_id = auth.uid());
create policy "study_plans_insert_own" on public.study_plans
  for insert to authenticated with check (user_id = auth.uid());
create policy "study_plans_update_own" on public.study_plans
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "plan_events_own" on public.plan_events
  for select to authenticated using (user_id = auth.uid());
create policy "plan_events_insert_own" on public.plan_events
  for insert to authenticated with check (user_id = auth.uid());
create policy "plan_events_update_own" on public.plan_events
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plan_events_delete_own" on public.plan_events
  for delete to authenticated using (user_id = auth.uid());

-- ---------- announcements ----------
create policy "announcements_select_all" on public.announcements
  for select using (true);
create policy "announcements_insert_staff" on public.announcements
  for insert to authenticated with check (public.is_staff());

-- ---------- feature_flags ----------
create policy "feature_flags_select_all" on public.feature_flags
  for select using (true);
create policy "feature_flags_write_admin" on public.feature_flags
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "feature_flags_insert_admin" on public.feature_flags
  for insert to authenticated with check (public.is_admin());

-- ---------- leaderboard ----------
create policy "leaderboard_select_all" on public.leaderboard_entries
  for select using (true);

-- ---------- xp_events ----------
create policy "xp_events_select_own" on public.xp_events
  for select to authenticated using (user_id = auth.uid());

-- ---------- ai_usage (own rows, for rate limiting + feedback) ----------
create policy "ai_usage_select_own" on public.ai_usage
  for select to authenticated using (user_id = auth.uid());
create policy "ai_usage_insert_own" on public.ai_usage
  for insert to authenticated with check (user_id = auth.uid());

-- ai_queue: written and drained exclusively by privileged API routes
-- (service-role key) — no client policies by design.
