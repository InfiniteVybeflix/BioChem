# BioChem

**The complete biochemistry study platform — exam zones, AI tutor, encrypted messaging, planner, community and jobs in one installable PWA.**

Built by **Aevibron**. Free forever, class-owned.

---

## What's inside

| Module                                | What it does                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Exam Zones** — CAT 1 · CAT 2 · Main | Topic tree → LaTeX-rendered notes → outcomes checklist with per-user progress → question bank with tap-to-reveal answers → timed mock exams with auto-grading and score-history charts → past-paper archive  |
| **AI Tutor**                          | Streaming chat grounded in your course notes, exam/ELI5/step-by-step explain modes — and when a picture says more, it pulls **real, attributed images from Wikimedia Commons** plus verified reference links |
| **AI Practice**                       | Fresh MCQ sets on any topic, generated on demand; your answers are sent back with the questions and the AI **marks them**, returning per-question remarks, what to note, and coaching                        |
| **Flashcards**                        | SM-2 spaced repetition (the real algorithm), daily review queue, one-tap generation from any note                                                                                                            |
| **Messages**                          | Direct chats, study groups and the open Community Lounge — **end-to-end encrypted** (AES-256-GCM in the browser), realtime, with photos, videos, voice notes and files, typing indicators and presence       |
| **Planner**                           | Drag-and-drop timetable, month calendar, exam countdowns, reminder alarms with web push, streaks, an AI week-planner and a Pomodoro focus timer                                                              |
| **Community**                         | Per-topic discussions with upvotes and **lecturer-verified answer** badges, @mentions                                                                                                                        |
| **Jobs**                              | Internship / entry / full-time board with review, sponsored slots (opt-in) and prefilled student enquiries answered from the operations console                                                              |
| **Support**                           | Contact the platform team from the app — bugs, complaints, questions — with replies delivered in-app and by push                                                                                             |
| **Schools & years**                   | Students pick their school and year during onboarding; dashboards personalise to their year (every other year stays open), and the whole platform rolls forward automatically when the academic year turns   |
| **PWA**                               | Installable, offline study (cached notes/questions/attempts), background sync, share target                                                                                                                  |

Roles: **Student** (everything study, contributions go to review) → **Lecturer** (publishes directly, verifies answers, class analytics, AI writing assistant) — activated after review. Administration happens through a separate **operations console** that lives at a secret path configured in the environment; it is not part of the app, no account exists for it, and nothing in the UI mentions it.

Every table is protected by Row Level Security; the browser only ever holds the public anon key.

---

## Quick start (local)

> **Prerequisites:** Node 20+ (or Bun), a free [Supabase](https://supabase.com) project. Full setup guide: [`SETUP.md`](SETUP.md).

```bash
git clone <your-fork-url> biochem && cd biochem
bun install               # or: npm install
cp .env.example .env      # fill in the values (see SETUP.md step by step)
```

Create the database (either run `supabase/migrations/*.sql` in order in the Supabase SQL editor, or push them with the Supabase CLI), then:

```bash
bun run dev               # or: npm run dev
```

Open http://localhost:3000 → sign up (Student tab) → pick your school and year.

> The platform starts **empty on purpose** — no demo data. Real schools are added from the operations console, and lecturers publish real notes and questions (the AI writing assistant can draft them).

---

## Deployment (Vercel + Supabase)

1. Push to GitHub (protect `main`, PRs required).
2. Import the repo on [Vercel](https://vercel.com) — Next.js is auto-detected.
3. Add every variable from `.env.example` in **Settings → Environment Variables** (the full annotated list is in [`SETUP.md`](SETUP.md)).
4. Deploy. Then connect the repo to the database with the **Database sync** workflow (see below).

### Scheduled jobs (Cron-Job.org)

Vercel Hobby allows one cron per day, so BioChem exposes authenticated endpoints for external schedulers. Create these jobs on [cron-job.org](https://cron-job.org), each with an `Authorization: Bearer <CRON_SECRET>` header:

| Endpoint                    | Schedule     | What it does                                                                        |
| --------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `/api/cron/daily-questions` | every 10 min | Generates Question-of-the-Day sets for every user at their configured delivery time |
| `/api/cron/reminders`       | every 1 min  | Sends planner reminder pushes                                                       |
| `/api/cron/queue-process`   | every 5 min  | Drains the AI retry queue when the gateway recovers                                 |
| `/api/cron/digest`          | hourly       | Weekly email/in-app digest at `DIGEST_SEND_HOUR_UTC`                                |

---

## The Database sync workflow (seed + types from the live DB)

`.github/workflows/database-sync.yml` connects this repo to your **live** database:

- **On every merge that touches `supabase/migrations/`** it applies the new migrations, regenerates `src/types/database.ts` from the live schema, typechecks the app against the fresh types and commits them back.
- **Manual run** (Actions → _Database sync_ → _Run workflow_) with an option to also run `supabase/seed.sql`.

It needs exactly **three repository secrets** (Settings → Secrets and variables → Actions) — and nothing else; app credentials belong in Vercel only:

| Secret                  | Where to find it                                                      |
| ----------------------- | --------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens → _Generate new token_   |
| `SUPABASE_PROJECT_REF`  | Dashboard → Project Settings → General → **Reference ID**             |
| `SUPABASE_DB_URL`       | Dashboard → Project Settings → Database → Connection string → **URI** |

---

## Contributing (coursemates — start here)

**The 3-minute path, no git needed:**

1. Sign in → **Contribute** → paste your note (markdown, `$LaTeX$` for equations) → submit.
2. A lecturer reviews it under **Lecturer → Verify / moderation**.
3. Your note is published with your name on it and you earn **25 XP**.

**The git path (maintainers):** fork → branch → PR → `main`. Conventional Commits are enforced; CI runs lint + strict typecheck + build.

---

## Architecture

```
Next.js 16 (App Router, TypeScript strict, Tailwind 4, shadcn/ui)
├── src/app                 public pages · (auth) sign-in/sign-up with Student/Staff
│                             tabs · (app) the authenticated shell — dashboard,
│                             zones, mocks, flashcards, ai/ (tutor, practice,
│                             daily), messages/, community, planner, jobs,
│                             settings, support · console/ + console-api/ are
│                             the operations console (served only through the
│                             secret path rewrite — direct hits 404)
├── src/proxy.ts            edge proxy: session refresh, route guards, the
│                             obscure-path console rewrite, /admin never exists
├── src/app/api             student/staff route handlers — every privileged
│                             action runs requireUser(capability) first
├── src/lib                 supabase clients · rbac · ai (gateway, media,
│                             assistant, queue) · chat crypto · schools ·
│                             sm2 · grading · push · validation
├── src/types/database.ts   generated from the live DB by the workflow
├── supabase/migrations     schema · RLS · functions · storage · realtime
└── supabase/seed.sql       optional, opt-in seed (empty by default)
```

**Security model**

- RLS on every table; the browser only ever holds the anon key.
- The service-role key lives in server routes only, always behind a capability check (or the console session).
- AI keys never reach the client; gateway calls are proxied via `/api/ai/*` with per-user, per-task rate limits and a durable retry queue.
- Chat messages and attachments are AES-256-GCM encrypted in the browser; the key row is readable only by conversation members.
- The operations console has no account, no route and no mention in the app: it answers to environment variables only (`ADMIN_ROUTE_PATH`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`), constant-time credential checks, lockout after 5 failed attempts, and an HMAC-signed HttpOnly session cookie.
- Markdown is rendered without raw HTML — XSS is impossible by construction.

**Quality**

```bash
bun run lint          # ESLint — zero errors enforced in CI
bun run typecheck     # tsc --noEmit, strict, zero `any` allowed
bun run build         # production build (no secrets needed)
```

---

## License

MIT — see [LICENSE](LICENSE).
