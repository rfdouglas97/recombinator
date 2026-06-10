# Deploy — Supabase + Railway + Vercel

Production stack for ~50 users:

```
Explorer (Vercel)  →  API (Railway)  →  Postgres (Supabase)
GitHub Actions     ────────────────────────┘
```

Local dev stays on Docker Postgres (`npm run db:up`). Production uses Supabase only.

---

## 1. Supabase — create database

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Pick a region (e.g. `East US`), set a strong **database password** (save it)
3. Wait ~2 min for the project to provision

### Get connection string

**Project Settings → Database → Connection string → URI**

Use the **Session pooler** connection (port **5432**) — works on IPv4 home networks. Direct `db.*.supabase.co` often fails with `ENOTFOUND` (IPv6-only).

| Use case             | Connection type    | Port |
| -------------------- | ------------------ | ---- |
| `npm run db:migrate` | **Session pooler** | 5432 |
| Railway API          | **Session pooler** | 5432 |

Example (replace password and project ref):

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Add `?sslmode=require` if not already in the URI.

### Load schema + data

From the repo root (uses latest JSON from `output/`):

```bash
# One-time: load into Supabase (keep local .env on Docker for dev)
DATABASE_URL="postgresql://postgres.[ref]:[password]@...supabase.com:5432/postgres?sslmode=require" npm run db:migrate
```

Verify in Supabase **SQL Editor**:

```sql
SELECT COUNT(*) FROM company_classifications;  -- ~1,029 classified
SELECT is_stub, COUNT(*) FROM companies GROUP BY is_stub;  -- false ~1,029, plus launch-only stubs
SELECT COUNT(*) FROM launch_reviews;   -- hundreds
```

After schema v2 F1 code is deployed, re-run full migrate so Supabase gets `is_stub` and `idea_cards` FKs:

```bash
DATABASE_URL="...session pooler..." npm run db:migrate
```

After pipeline runs (reclassify, etc.), re-run the same migrate command to refresh production data.

---

## 2. Railway — deploy API

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Select repo `rfdouglas97/recombinator`, branch `main`
3. **Settings → Deploy**
   - Start command: `node server/generator-api.mjs`
   - Health check path: `/api/health`
4. **Variables** (Railway dashboard) — **required before healthcheck passes for data routes**:

| Variable            | Value                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | Supabase **session pooler** URI with `?sslmode=require`                                                                            |
| `ANTHROPIC_API_KEY` | Your key (optional — generator/chat only)                                                                                          |
| `CHAT_MODEL`        | Optional; explorer chat only (default `claude-haiku-4-5-20251001`). `ANTHROPIC_MODEL` does not apply to chat.                      |
| `RATE_LIMIT_*`      | Optional per-IP limits (see `.env.example`). Defaults: bundle 30/min, read 120/min, LLM 12/min. `RATE_LIMIT_DISABLED=1` turns off. |

Do **not** commit `.env` — paste the Supabase session pooler URL here (same one used for `db:migrate`).

5. **Settings → Networking → Generate domain** → copy URL, e.g. `https://recombinator-production.up.railway.app`

Test:

```bash
curl https://YOUR-RAILWAY-URL/api/health
curl https://YOUR-RAILWAY-URL/api/bundle | head -c 200
```

---

## 3. Vercel — deploy explorer

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `recombinator`
2. **Root Directory**: leave as repo root (uses `vercel.json`)
3. **Environment variables**:

| Variable       | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| `VITE_API_URL` | Railway URL, no trailing slash, e.g. `https://recombinator-production.up.railway.app` |

4. Deploy

Open the Vercel URL → DevTools → Network → confirm requests go to Railway `/api/bundle`, not static JSON.

---

## 4. GitHub Actions — daily launch check

Workflow: `.github/workflows/daily-launch-check.yml` (14:00 UTC daily + manual `workflow_dispatch`).

1. GitHub repo → **Settings → Secrets and variables → Actions → New repository secrets**
2. `DATABASE_URL` — same Supabase **session pooler** URI as Railway (`?sslmode=require`)
3. `ANTHROPIC_API_KEY` — required for LLM phenotype + vertical classification when new launches join the corpus
4. Push `main` (scheduled workflows only run on the default branch)
5. Optional smoke test: **Actions → Daily launch check → Run workflow**

The job runs `npm run launches:check:ingest` then `npm run db:migrate`.

- **Corpus** (~1,029): scraped YC directory cohort in `output/yc_companies.json` → matrix, gaps, explorer.
- **Launches**: all posts scraped/evaluated; `launch_reviews` stored for every launch.
- **Add to corpus**: only when a **new** launch is processed and its `company_slug` is **not** already in the corpus (`--ingest-new` on pending launches only — no historical catalog backfill).

Launch reports are kept as workflow artifacts (90 days), not committed to git.

---

## Environment cheat sheet

| Where                 | `DATABASE_URL`                                           | `VITE_API_URL`       |
| --------------------- | -------------------------------------------------------- | -------------------- |
| Local `.env`          | `postgresql://ycscrape:ycscrape@localhost:5432/ycscrape` | (empty — Vite proxy) |
| Railway               | Supabase URI                                             | —                    |
| Vercel                | —                                                        | Railway URL          |
| GitHub Actions secret | Supabase URI                                             | —                    |

**Never** put `DATABASE_URL` in Vercel or the frontend.

---

## Troubleshooting

**`SSL connection required`** — ensure connection string has `?sslmode=require` (client also auto-enables SSL for non-local hosts).

**Migrate fails on Supabase** — use **Direct** connection (port 5432), not transaction pooler, for `db:migrate`.

**Explorer shows stale data** — re-run `DATABASE_URL=... npm run db:migrate` after pipeline refresh.

**CORS errors** — API already sends `Access-Control-Allow-Origin: *` for GET routes.

**Cold start** — first request after idle may be slow on free tiers; normal for early prod.
