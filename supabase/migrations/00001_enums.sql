-- ============================================================
-- BioChem 00001 — Enum types
-- ============================================================

create type public.user_role as enum ('student', 'lecturer', 'admin');
create type public.exam_zone as enum ('cat1', 'cat2', 'main');
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.content_status as enum ('draft', 'pending', 'published', 'rejected', 'archived');
create type public.question_type as enum ('mcq', 'short_answer', 'long_answer', 'structured');
create type public.attempt_status as enum ('in_progress', 'submitted', 'abandoned');
create type public.job_type as enum ('internship', 'entry', 'full_time');
create type public.job_status as enum ('pending', 'approved', 'rejected', 'closed');
create type public.enquiry_status as enum ('sent', 'read', 'replied');
create type public.ad_placement as enum ('jobs', 'events', 'resources', 'sidebar', 'banner');
create type public.notification_type as enum (
  'new_notes', 'mock_results', 'chat_mentions',
  'daily_questions', 'announcements', 'jobs', 'system'
);
create type public.submission_type as enum ('note', 'question', 'past_paper', 'flashcard_set');
create type public.plan_event_type as enum ('study', 'class', 'exam', 'personal', 'deadline');
create type public.ai_task_type as enum (
  'tutor', 'explain', 'daily_questions', 'study_plan', 'flashcards', 'week_planner', 'moderation'
);
create type public.visibility as enum ('public', 'private');
create type public.chat_report_status as enum ('open', 'resolved', 'dismissed');
create type public.ai_queue_status as enum ('pending', 'processing', 'done', 'failed', 'dead');
