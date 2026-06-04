# YC Scrape — Production roadmap

**Vision:** Turn the research pipeline into a **production-grade web app** for ~50 users — enough to validate the product, share with collaborators, and prove you can ship something real. Not millions of users; focus on reliability, live data, and a polished explorer.

**Today:** batch scripts → JSON files → static `data.bundle.json` → React explorer.

**Target:** batch scripts → Postgres → read API → React explorer (live at runtime).

**Status (Phase 1):** Local stack complete — Docker Postgres, read API, explorer wired to `/api/bundle`, **Recombinator UI merged to `main`**. Next: **verify locally → remove worktree → deploy**.

---

## What to do next (recommended order)

### Step A — Save backend work on `main` (safety net) ✅ done
Commit and push Postgres + API changes **before** merging frontend so you can always reset to a known-good state.

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git add -A
git status   # confirm .env is NOT listed
git commit -m "Add Postgres, read API, and production plan"
git push origin main
```

**Done:** `53eb2d3` on `origin/main`.

### Step B — Merge frontend from `dev` worktree ✅ done
The redesign lived on branch `dev` (`.worktrees/dev`). It touched only explorer UI files — not `loadBundle.ts`. Merge was clean.

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git merge dev -m "Merge Recombinator frontend redesign from dev"
# If conflicts: fix files, then git add . && git commit
git push origin main
```

**Done:** `f79e71b` on `origin/main`.

Verify locally:
```bash
npm run db:up          # if Docker not running
npm run api:dev        # terminal 2
npm run explorer:dev:vite   # terminal 3 → http://localhost:5173
```

### Step C — Remove worktree (optional, after you verify UI)
Only do this once you are happy with the merge on `main`.

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git worktree remove .worktrees/dev
git branch -d dev          # optional: delete local dev branch
```

You do **not** need to manually delete the whole `.worktrees/` folder — `git worktree remove` cleans up the checkout. The empty `.worktrees/` directory may remain; that's fine (it's gitignored).

---

## Git worktree merge workflow (reference)

Use this pattern whenever you want to experiment on a branch in a separate folder, then fold changes back into `main`.

### 1. Create a worktree + branch (one-time setup)

From your main repo folder:

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git worktree add .worktrees/dev -b dev
```

This creates:
- a new branch `dev`
- a second checkout at `.worktrees/dev` (same repo, different folder)
- `.worktrees/` is in `.gitignore` so it never gets committed

Work on the redesign in `.worktrees/dev` — run Vite there, edit files, commit as usual:

```bash
cd "/Users/ryandouglas/Desktop/yc scrape/.worktrees/dev"
npm run explorer:dev:vite
git add explorer/src/...
git commit -m "Rebrand Explorer frontend to Recombinator light theme"
```

Your **main folder** stays on `main` with backend/API work untouched.

### 2. Safety backup on `main` (always do this first)

Before merging, commit and push whatever is on `main`:

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git checkout main
git add -A
git status   # confirm .env is NOT listed
git commit -m "Your backend commit message"
git push origin main
```

If the merge goes wrong, you can recover:

```bash
git reset --hard origin/main   # only if you haven't pushed bad commits yet
# or reset to the backup commit: git reset --hard 53eb2d3
```

### 3. Merge `dev` into `main`

Still in the **main repo folder** (not the worktree):

```bash
cd "/Users/ryandouglas/Desktop/yc scrape"
git merge dev -m "Merge Recombinator frontend redesign from dev"
git push origin main
```

If Git reports conflicts, open the listed files, fix them, then:

```bash
git add .
git commit   # completes the merge
git push origin main
```

### 4. Verify, then remove the worktree

```bash
npm run db:up && npm run api:dev   # terminal 1 & 2
npm run explorer:dev:vite          # terminal 3 — check UI at localhost:5173

cd "/Users/ryandouglas/Desktop/yc scrape"
git worktree remove .worktrees/dev
git branch -d dev                  # optional
```

### Why worktrees instead of switching branches?

| Approach | Pros | Cons |
|----------|------|------|
| `git checkout dev` | Simple | Only one folder; must stop servers / stash work |
| **Worktree** | Main + dev open side-by-side; compare live | Extra folder to manage |

Check active worktrees anytime:

```bash
git worktree list
```

### Step D — Deploy (~50 users)
1. Create **Neon** Postgres → copy `DATABASE_URL`
2. Run `npm run db:migrate` against Neon (once)
3. Deploy API to **Railway** with `DATABASE_URL` + start command `node server/generator-api.mjs`
4. Deploy explorer to **Vercel** — set env `VITE_API_URL` or rely on proxy config for production API URL
5. Point GitHub Actions launch check at Neon instead of git commits

### Step E — Pipeline writes to Postgres directly
Replace manual `db:migrate` copy step; scripts upsert after classify / launch-check / normalize.

### Step F — Polish
- Loading/error UI when API down
- Sentry, launch alerts
- Auth when inviting users (Phase 2)

---

## Architecture (how the pieces connect)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Explorer UI on Vercel)                            │
│  React loads → fetch GET /api/... → render charts, matrix   │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTP (JSON)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  API server (Node on Railway / Fly.io)                      │
│  GET /api/companies, /api/gaps, /api/launches, …            │
└───────────────────────────┬─────────────────────────────────┘
                            │  SQL queries
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Postgres (Docker local → Neon/Supabase in production)      │
│  companies, classifications, launches, gap_cells, …         │
└───────────────────────────▲─────────────────────────────────┘
                            │  npm run db:migrate (for now)
┌───────────────────────────┴─────────────────────────────────┐
│  Pipeline scripts (scrape, classify, launch check)          │
│  Still write JSON today → migrate copies into Postgres      │
└─────────────────────────────────────────────────────────────┘
```

### Your question: does the frontend GET data from Postgres at runtime?

**Yes — with one layer in between.**

The browser **never talks to Postgres directly** (that would expose credentials and be a security risk). The flow is:

1. User opens the explorer.
2. React code runs `fetch('/api/companies')` (or similar).
3. **API server** runs SQL against Postgres.
4. API returns JSON.
5. React renders the UI from that JSON.

So: **runtime data** (not baked into the build), **via GET requests**, **sourced from Postgres** — correct mental model.

**Today vs target:**

| | Today | After API |
|--|-------|-----------|
| Data at build time | `data.bundle.json` copied into build | No — fetched when app loads |
| Data refresh | Re-run `data:bundle` + rebuild | Re-run pipeline + `db:migrate` (later: pipeline writes DB directly) |
| User sees | Snapshot from last bundle | Live DB snapshot |

**Two API styles we can use:**

1. **Granular GETs** — `/api/companies`, `/api/gaps`, `/api/launches` (flexible, good for filters/pagination).
2. **Bundle GET** — `/api/bundle` returns same shape as `data.bundle.json` (fastest explorer migration).

Plan: build granular endpoints first, then optional `/api/bundle` for drop-in explorer swap.

---

## Phase 1 — Production-ready for ~50 users

**Target:** Hosted app, live data, stable daily jobs, no laptop required.

### Data layer
- [x] Postgres schema (`db/schema.sql`)
- [x] Docker local Postgres (`npm run db:up`)
- [x] JSON → Postgres migration (`npm run db:migrate`)
- [ ] Pipeline writes to Postgres directly (replace migrate-as-copy)
- [ ] Migrate remaining data: raw scrape, bm-vertical matrix, audit queue

### Read API
- [x] `server/read-api.mjs` + `db/queries.mjs` — GET handlers backed by Postgres
- [x] `GET /api/health` — DB ping
- [x] `GET /api/companies` — list (filters: batch, sector, phenotype, vertical, search)
- [x] `GET /api/companies/:slug` — detail
- [x] `GET /api/gaps` — ranked whitespace cells
- [x] `GET /api/launches` — launch reviews
- [x] `GET /api/meta/facets` — batches, sectors, phenotypes for filters
- [x] `GET /api/bundle` — full explorer payload from Postgres
- [x] `npm run api:dev` — run locally on port 3456

### Frontend
- [x] Explorer: `loadBundle()` prefers `GET /api/bundle`, falls back to static JSON
- [x] **Merge `dev` worktree** — Recombinator UI redesign → `main` (`f79e71b`)
- [ ] Remove `.worktrees/dev` after local verification
- [ ] Loading + error UI when API is down (shows fallback message today)

### Deploy (~50 users)
- [ ] Postgres: Neon or Supabase (always-on, not Docker on your Mac)
- [ ] API: Railway or Fly.io
- [ ] Explorer: Vercel
- [ ] GitHub Actions: launch check writes to hosted Postgres (not git commits)
- [ ] Environment variables: `DATABASE_URL` on API + Actions only (never in frontend)

### Ops
- [x] Daily launch monitor (GitHub Actions)
- [x] Git repo + worktree workflow
- [ ] Structured logging on API
- [ ] Error tracking (Sentry)
- [ ] Alert on failed scrape or `surprise` launch

---

## Phase 2 — Multi-user product

**Target:** 50 users with accounts, personal judgments, review workflows.

- [ ] Auth (Clerk or Auth0) — gate API, not just UI
- [ ] User-scoped idea card judgments (replace shared `judgments.json`)
- [ ] Human review queue for low-confidence classifications
- [ ] Versioned ontology changes
- [ ] LLM cost tracking per job
- [ ] Rate limits on generation endpoints
- [ ] Docker image for API + Playwright worker
- [ ] Tests: API smoke, rubric fixtures, one explorer E2E

---

## Phase 3 — Intelligence platform (if it works)

- [ ] Near-real-time launch processing
- [ ] Full-text search (Postgres `tsvector` or Typesense)
- [ ] Trend analytics by batch
- [ ] Export API (CSV, Notion)
- [ ] Optional embeddings for similarity search

---

## Local dev cheat sheet

```bash
# Terminal 1 — database
npm run db:up

# Terminal 2 — API (Postgres read + generator)
npm run api:dev

# Terminal 3 — explorer (proxies /api → :3456)
npm run explorer:dev:vite
```

After pipeline changes:

```bash
npm run db:migrate   # refresh Postgres from JSON (until pipeline writes DB directly)
```

---

## Cost ballpark (~50 users)

| Service | Monthly |
|---------|---------|
| Neon / Supabase Postgres | $0–25 |
| Vercel (frontend) | $0–20 |
| Railway / Fly (API) | $5–30 |
| Anthropic API (generation) | $50–200 |
| GitHub Actions | Free tier likely enough |

**Total:** ~$25–75/mo for a serious small product.

---

## What not to do yet

- Kubernetes, microservices
- Self-hosted LLMs (unless cost forces it)
- Vector DB / embeddings
- Rewriting taxonomy agents — wrap them with better storage

---

## Learning map (tie skills to this project)

| Concept | Where in this project |
|---------|------------------------|
| Docker | `docker-compose.yml`, local Postgres |
| Postgres / SQL | `db/schema.sql`, `npm run db:psql` |
| API | `server/read-api.mjs` (next) |
| Deploy | Vercel + Railway |
| Git / worktrees | `.worktrees/dev` for frontend experiments |

See **`db/README.md`** for database learning guide.
