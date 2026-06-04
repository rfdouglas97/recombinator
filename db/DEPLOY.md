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

| Use case | Connection type | Port |
|----------|-----------------|------|
| `npm run db:migrate` | **Session pooler** | 5432 |
| Railway API | **Session pooler** | 5432 |

Example (replace password and project ref):

```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Add `?sslmode=require` if not already in the URI.

### Load schema + data

From your Mac (uses latest JSON from `output/`):

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"

# One-time: load into Supabase (keep local .env on Docker for dev)
DATABASE_URL="postgresql://postgres.[ref]:[password]@...supabase.com:5432/postgres?sslmode=require" npm run db:migrate
```

Verify in Supabase **SQL Editor**:

```sql
SELECT COUNT(*) FROM companies;        -- ~401
SELECT COUNT(*) FROM launch_reviews;   -- hundreds
```

After pipeline runs (reclassify, etc.), re-run the same migrate command to refresh production data.

---

## 2. Railway — deploy API

1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub**
2. Select repo `rfdouglas97/yc-scrape`, branch `main`
3. **Settings → Deploy**
   - Start command: `node server/generator-api.mjs`
   - Health check path: `/api/health`
4. **Variables** (Railway dashboard) — **required before healthcheck passes for data routes**:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Supabase **session pooler** URI with `?sslmode=require` |
| `ANTHROPIC_API_KEY` | Your key (optional — generator/chat only) |

Do **not** commit `.env` — paste the Supabase session pooler URL here (same one used for `db:migrate`).

5. **Settings → Networking → Generate domain** → copy URL, e.g. `https://yc-scrape-production.up.railway.app`

Test:

```bash
curl https://YOUR-RAILWAY-URL/api/health
curl https://YOUR-RAILWAY-URL/api/bundle | head -c 200
```

---

## 3. Vercel — deploy explorer

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `yc-scrape`
2. **Root Directory**: leave as repo root (uses `vercel.json`)
3. **Environment variables**:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Railway URL, no trailing slash, e.g. `https://yc-scrape-production.up.railway.app` |

4. Deploy

Open the Vercel URL → DevTools → Network → confirm requests go to Railway `/api/bundle`, not static JSON.

---

## 4. GitHub Actions — launch check (later)

Add repo secret `DATABASE_URL` (Supabase URI). Update `.github/workflows/daily-launch-check.yml` to write launch results to Postgres instead of committing JSON.

---

## Environment cheat sheet

| Where | `DATABASE_URL` | `VITE_API_URL` |
|-------|----------------|----------------|
| Local `.env` | `postgresql://ycscrape:ycscrape@localhost:5432/ycscrape` | (empty — Vite proxy) |
| Railway | Supabase URI | — |
| Vercel | — | Railway URL |
| GitHub Actions secret | Supabase URI | — |

**Never** put `DATABASE_URL` in Vercel or the frontend.

---

## Troubleshooting

**`SSL connection required`** — ensure connection string has `?sslmode=require` (client also auto-enables SSL for non-local hosts).

**Migrate fails on Supabase** — use **Direct** connection (port 5432), not transaction pooler, for `db:migrate`.

**Explorer shows stale data** — re-run `DATABASE_URL=... npm run db:migrate` after pipeline refresh.

**CORS errors** — API already sends `Access-Control-Allow-Origin: *` for GET routes.

**Cold start** — first request after idle may be slow on free tiers; normal for early prod.
