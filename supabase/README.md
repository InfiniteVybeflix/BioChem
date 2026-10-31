# Supabase setup

## Applying the migrations

Open your project's **SQL Editor** and run each file below **in order**.
Each file is idempotent-safe to re-run unless noted, and they depend on each
other — do not reorder. (Or push them with the Supabase CLI / the Database
sync GitHub workflow — the migrations are identical.)

| File                                  | Creates                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `00001_enums.sql`                     | All enum types (roles, zones, difficulties, statuses…)                                                                                          |
| `00002_core_tables.sql`               | profiles, topics, notes, outcomes, user_outcome_progress, questions (+ FTS columns)                                                             |
| `00003_exam_tables.sql`               | exams, exam_questions, exam_attempts, flashcards, flashcard_reviews                                                                             |
| `00004_community_tables.sql`          | submissions, discussions, replies, upvotes                                                                                                      |
| `00005_jobs_ads.sql`                  | jobs, job_enquiries, ads, ad_impressions                                                                                                        |
| `00006_notifications.sql`             | notifications, notification_prefs, push_subscriptions                                                                                           |
| `00007_ai_tables.sql`                 | ai_conversations, ai_messages, daily_question_settings, daily_questions, study_plans, plan_events                                               |
| `00008_system_tables.sql`             | announcements, feature_flags, leaderboard_entries, xp_events, ai_usage, ai_queue                                                                |
| `00009_functions.sql`                 | Triggers & RPCs: `handle_new_user`, `award_xp`, `award_xp_to`, `touch_streak`, leaderboard refresh, counters, the profiles guard, column grants |
| `00010_rls.sql`                       | Row Level Security policies on **every** table                                                                                                  |
| `00011_storage_realtime_defaults.sql` | Storage buckets + policies, realtime publications, feature-flag defaults                                                                        |
| `00012_schools_onboarding_cms.sql`    | schools, site_settings (CMS defaults), profiles school/year/approval columns, academic-year RPCs, topics scoping, staff-approval gating         |
| `00013_chat_tables.sql`               | Encrypted messaging: chat_conversations, chat_members, chat_keys, chat_messages (rebuilt), chat_reports, chat-files bucket + realtime           |
| `00014_support_desk.sql`              | support_tickets, support_replies (the customer-care desk)                                                                                       |
| `00015_console_adjustments.sql`       | Platform-authored announcements (nullable author)                                                                                               |

`seed.sql` is intentionally empty of demo content — run it only when you
have real rows you want on every fresh environment (opt-in via the
Database sync workflow).

## After migrating

1. **Auth → URL configuration**: set _Site URL_ to your deployment URL and add
   `http://localhost:3000/auth/callback` + your production callback to _Redirect URLs_.
2. (Optional) Disable email confirmations under Auth → Providers → Email for
   friction-free class sign-ups, or leave them on for verified university emails.
3. Add your first school from the operations console → **Schools**, then sign up
   (students pick school + year during onboarding; staff accounts activate after
   you approve them under **Users**).

There is **no admin account and no admin role** in the database — platform
administration happens exclusively through the operations console configured
by environment variables (see `SETUP.md`).
