# BioChem — complete setup guide

Everything you need to go from a fresh clone to a live, configured platform. Do the steps in order; each one names exactly where the value comes from.

---

## 1 · Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the project → **SQL Editor** → **New query**.
3. Paste the contents of each file in [`supabase/migrations/`](supabase/migrations/) **in order** (00001 → 00015) and run it. This creates every table, the RLS policies, triggers, storage buckets, realtime publication and the default CMS values.

> Alternative: run `supabase db push` from the Supabase CLI, or let the **Database sync** GitHub workflow do it (step 4 below) — the migrations are identical.

---

## 2 · Deploy to Vercel

1. Push this repo to GitHub. Protect `main` (Settings → Branches → require pull requests).
2. Import the repo on [vercel.com](https://vercel.com) — the Next.js preset is detected automatically.
3. **Before the first deploy**, add the environment variables below (Settings → Environment Variables → add each for _Production_, _Preview_ and _Development_).

### Vercel environment variables — the complete list

**Database / auth** (Supabase dashboard → Project Settings → API):

| Variable                        | Value                                       |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key                         |
| `SUPABASE_SERVICE_ROLE_KEY`     | `service_role` key — **server-only secret** |

**AI gateway** (your Aevibron gateway):

| Variable                 | Value                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `AEVIBRON_GATEWAY_URL`   | Gateway base URL, no trailing slash                                                                   |
| `AEVIBRON_API_KEY`       | Gateway key (sent as `X-Aevibron-Key`, server-side only)                                              |
| `AEVIBRON_MODEL_TUTOR` … | Optional model overrides (defaults: core-v3 tutor, swift-v1 daily, flash-v2 explain, quantum-v4 plan) |

**The operations console** (choose these yourself — this is the ONLY administrator):

| Variable               | Value                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_ROUTE_PATH`     | The secret path the console lives at, e.g. `panel-x7k29m` (letters/digits/dashes). Treat it like a password — it is the only URL that reaches the console. `/admin` does not exist and direct `/console` hits return 404. |
| `ADMIN_EMAIL`          | The single operator email                                                                                                                                                                                                 |
| `ADMIN_PASSWORD`       | A long password — the only one that unlocks the console (5 wrong attempts locks an IP for 15 minutes)                                                                                                                     |
| `ADMIN_SESSION_SECRET` | Random string: `openssl rand -hex 32`                                                                                                                                                                                     |

**Web push (optional but recommended):**

```bash
npm run generate:vapid   # run once anywhere with the deps installed
```

| Variable                       | Value                             |
| ------------------------------ | --------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key from the command above |
| `VAPID_PRIVATE_KEY`            | Private key                       |
| `VAPID_SUBJECT`                | `mailto:you@example.com`          |

**Everything else:**

| Variable               | Value                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`  | `https://your-app.vercel.app` (no trailing slash)                                                                                                                                             |
| `CRON_SECRET`          | Random string for cron endpoints: `openssl rand -hex 32`                                                                                                                                      |
| `SUPPORT_WEBHOOK_URL`  | **Optional** Discord/Slack/custom webhook pinged the second a new support ticket arrives (bug reports land in your channel like a terminal feed). Leave empty to use the console inbox alone. |
| `DIGEST_SEND_HOUR_UTC` | Hour (0–23) for the weekly digest. Default `18`.                                                                                                                                              |

4. Deploy.

---

## 3 · Turn on the scheduled jobs

On [cron-job.org](https://cron-job.org) create four jobs against `https://your-app.vercel.app`, each with a header `Authorization: Bearer <your CRON_SECRET>`:

| Endpoint                    | Schedule         |
| --------------------------- | ---------------- |
| `/api/cron/daily-questions` | every 10 minutes |
| `/api/cron/reminders`       | every minute     |
| `/api/cron/queue-process`   | every 5 minutes  |
| `/api/cron/digest`          | hourly           |

---

## 4 · Connect the repo to the live database

Add **three** repository secrets (GitHub → your repo → Settings → Secrets and variables → Actions):

| Secret                  | Where                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens → _Generate new token_ |
| `SUPABASE_PROJECT_REF`  | Project Settings → General → **Reference ID**                 |
| `SUPABASE_DB_URL`       | Project Settings → Database → Connection string → **URI**     |

That's all GitHub needs — **do not** put app credentials (gateway keys, console email/password, VAPID…) in GitHub; they belong in Vercel only.

Now the **Database sync** workflow (`.github/workflows/database-sync.yml`):

- Runs automatically whenever a PR touching `supabase/migrations/` merges: it applies new migrations, regenerates `src/types/database.ts` from the live schema, typechecks the app against the fresh types, and commits the file back.
- Can be run manually from the **Actions** tab with an option to also execute `supabase/seed.sql` (empty by default — the platform ships without demo content on purpose).

---

## 5 · First run as the operator

1. Open `https://your-app.vercel.app/<ADMIN_ROUTE_PATH>` — your secret path.
2. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Schools** → add your school (name, short name, programme length, current academic year, and the date the year rolls over — when that date passes, every student moves up a year automatically and dashboards re-personalise; you can also press _Advance year now_).
4. **CMS** → edit the site name, tagline, hero copy and support note — live for every visitor on next load, no deploy.
5. **Ads & flags** → every module has a live on/off switch.

Staff accounts: a lecturer signs up on the **Staff** tab (their account sits unactivated), you approve them under **Users**, and they get the lecturer workspace with the AI writing assistant. Students sign up on the **Student** tab, pick school + year, and start studying.

---

## Local development

```bash
bun install
cp .env.example .env    # fill it in (same values as Vercel)
bun run dev             # http://localhost:3000

bun run lint            # ESLint (zero errors)
bun run typecheck       # strict TypeScript (zero errors)
bun run build           # production build — no secrets required
```

The markdown-content pipeline, CSV question import and zip bulk upload all run inside the app (Lecturer panel) — there is no separate ingestion step.
