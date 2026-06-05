# YC Scrape — Production roadmap

## Production data — run a fresh migrate after ontology / bundle changes

**[recombinator.app](https://www.recombinator.app/) loads live data from Supabase via Railway `GET /api/bundle`, not the static `data.bundle.json` in git.** Pushing taxonomy or `npm run data:bundle` alone does **not** update what users see until Postgres is refreshed.

After any change to sectors, verticals, gaps, or company classifications:

```bash
DATABASE_URL="postgresql://...supabase session pooler...?sslmode=require" npm run db:migrate
```

Expect several minutes (full corpus reload). Example: removing the **Education & Workforce** sector from `taxonomy/verticals-data.mjs` updated git/Vercel fallback but the live site still showed 15 columns until migrate (or the interim `EXCLUDED_SECTOR_IDS` filter in `db/queries.mjs`).

**Checklist:** `git push` → Railway redeploy (API code) → **`db:migrate`** (data) → hard-refresh explorer → `curl …/api/bundle` and confirm `facets.sectors` matches repo.

## Corpus scope (2025 + 2026–2027)

**~1,029 classified companies** across **9 YC batches** (Winter 2025 → Winter 2027). Ingested via scrape-merge + Haiku phenotype/vertical classify (`corpus-2025` branch, merged to `main`).

- **Scrape:** [`scrape.mjs`](scrape.mjs) + [`scripts/merge-scrape.mjs`](scripts/merge-scrape.mjs) — never scrape 2025 into main path without merge (overwrites 2026).
- **LLM:** Haiku only for bulk ingest; confidence on every row. Sonnet via [`npm run audit:tiered`](package.json) on low-confidence escalations only (~15–25%).
- **Cohort batches on Railway:** [`scripts/corpus-allowlist.mjs`](scripts/corpus-allowlist.mjs) `CANONICAL_COHORT_BATCHES` fallback when gitignored `output/yc_companies.json` is absent on the API host.
- **10 unmapped** consumer/hardware slugs (searchable, no vertical column) — acceptable; &lt;5% gap threshold.

---

**Vision:** Turn the research pipeline into a **production-grade web app** for ~50 users — enough to validate the product, share with collaborators, and prove you can ship something real. Not millions of users; focus on reliability, live data, and a polished explorer.

**Pipeline (still):** batch scripts → JSON files in `output/`.

**App (live):** Postgres (Supabase) → read API (Railway) → React explorer (Vercel) at runtime.

**Status (Phase 1):** **Deployed.** Supabase + Railway + Vercel live. Explorer loads `/api/bundle` from production Postgres. Next: **schema v2 (data-engineer quality)**, pipeline → Postgres directly, GitHub Actions → Supabase.

---

## Taxonomy — one primary business model per company (next data fix)

**Problem:** ~59% of companies carry **two BM codes** (224/402 are **BM-01 + BM-04**) because `taxonomy/phenotype-to-bm.mjs` maps each phenotype to *compatible* GTM shapes and classify/reclassify copies the **full list** onto every company. The matrix then places the same slug in **multiple rows** (e.g. Archal under “Vertical AI SaaS” and “AI labor / managed service” — same vertical, two rows). That double-counts in the explorer and reads as if half the batch runs two business models.

**Intent vs reality:** Multi-BM on a phenotype is for **whitespace** (“this archetype could be SaaS or managed service”). It is **not** a claim that each YC company operates both models today.

**Target model:**

1. **One `primary_bm` per company** — chosen at classify/reclassify time (LLM or rules), stored in assignments + Postgres.
2. **Compatible BMs stay on the phenotype** — used only for gap synthesis / idea generation, not for placing real companies in the matrix.
3. **Matrix + bundle counts** — use `primary_bm` only (one cell per company per vertical).
4. **Follow-up:** fix stale phenotypes (e.g. Archal: rationale says BM-03 devtools, tags still `vertical-workflow-agent` → BM-01+BM-04).

**Files:** `taxonomy/phenotype-to-bm.mjs`, `agent/reclassify-classifications.mjs`, `normalize-verticals.mjs`, `db/schema.sql` (`company_business_models` or `primary_bm` on classifications), `db/queries.mjs` / `fetchBmVerticalMatrix`.

**Launch ingest (fixed):** New corpus adds use `agent/classify-company.mjs` — same stack as main batch (`phenotype` LLM + `classify-verticals` LLM), not `launch_check_local`. Requires `ANTHROPIC_API_KEY` in `.env` and GitHub Actions.

---

## Production URLs

| Service | URL / config |
|---------|----------------|
| **Explorer** | Vercel (your project URL) |
| **API** | `https://yc-scrape-production.up.railway.app` |
| **Postgres** | Supabase (session pooler — credentials in Railway only) |

Verify API: `curl https://yc-scrape-production.up.railway.app/api/health`

Refresh production data after a pipeline run:

```bash
DATABASE_URL="postgresql://...supabase session pooler..." npm run db:migrate
```

Keep local `.env` on Docker Postgres for dev. Never commit `.env`.

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

### Step D — Deploy (~50 users) — Supabase + Railway + Vercel ✅ done

See **`db/DEPLOY.md`** for reference.

1. ✅ **Supabase** — schema + data migrated (use **session pooler** URI, not direct `db.*` host on IPv4)
2. ✅ **Railway** — API at `yc-scrape-production.up.railway.app`, `DATABASE_URL` in Variables
3. ✅ **Vercel** — explorer with `VITE_API_URL` → Railway
4. ⬜ **GitHub Actions** — launch check writes to Supabase instead of git commits

### Step E — Pipeline writes to Postgres directly
Replace manual `db:migrate` copy step; scripts upsert after classify / launch-check / normalize.

### Step F — Schema v2: data-engineer quality (priority)

**Goal:** Replace the Phase 1 “mirror the JSON files” schema with a **clean, normalized, production-grade data model** — the kind a data engineer would sign off on. Supabase visualizer should show clear hierarchy, enforced FKs, and no orphan noise.

**Why:** Current schema works for the app but is messy: ~490 stub companies, denormalized labels, missing FKs, launch fields duplicated across tables. Fine for shipping; not fine for long-term analytics, multi-user workflows, or trusting the ERD.

**Target principles:**
- **Normalize ontology** — `sectors` → `industries` → `verticals`; phenotypes and business models as reference tables only
- **Single source of truth** — labels come from JOINs, not copied columns (except explicit snapshot/version tables if needed)
- **FK integrity** — every `*_id` column enforced; no dangling TEXT references
- **Separate concerns** — classified companies vs launch-only stubs (`is_stub` flag or `launch_stub_companies` table)
- **No duplication** — launch metadata lives in `launches` only, not also on `companies`
- **Lineage** — optional `pipeline_runs` / `classification_versions` for audit trail
- **Queryable analytics** — bm × vertical matrix as a view or materialized table, not JSON re-derivation

**Phased rollout:**

| Phase | Change | Files |
|-------|--------|-------|
| F1 ✅ | `is_stub` on companies; FKs on `idea_cards` (`db/migrations/002_schema_f1.sql`) | Done — re-run `db:migrate` on Supabase to apply |
| F2 | Drop denormalized label columns; JOIN in `queries.mjs` | schema, queries, build-bundle |
| F3 | `sectors` + `industries` tables; migrate vertical hierarchy | schema, migrate, taxonomy import |
| F4 | Remove `companies.launch_*`; unify on `launches` | schema, migrate, queries |
| F5 | Pipeline writes directly; deprecate JSON-as-source-of-truth | scripts, migrate |

Use **`.cursor/agents/schema-reviewer.md`** when designing changes. Re-migrate Supabase after each schema bump.

### Step G — Polish
- Loading/error UI when API down
- Sentry, launch alerts
- Remove `.worktrees/dev` if still present
- Auth when inviting users (Phase 2)

### Step H — Education & Workforce taxonomy gap

**Status:** `education` sector removed from ontology/UI for now (empty column hurt credibility). Re-add when classifications or overrides are ready.

**Problem:** The gap matrix showed **zero** companies in **Education & Workforce** (`vertical_sector_id = education`, `education.*` / `institutions.*` verticals). That is **not** because the YC scrape has no Ed/workforce startups — it is because classifiers place them elsewhere.

**Verified on current batch (401 companies, W26–S26 cohorts):**

| Placement | Count | Examples |
|-----------|-------|----------|
| `education` sector / vertical | **0** | — |
| Ed/learning in copy, other sectors | ~10 | Doomersion → `consumer.productivity.personal`; Lamina Labs → `ai-infrastructure.training-data` |
| YC `Education` / `Edtech` tag | 2 | HeyClicky (Mac buddy → consumer); Lamina Labs (EdTech infra → AI infra) |
| `enterprise.hr.recruiting` | 6 | Skillsync, Perfectly, Saffron, Asendia, Standout, … |
| `enterprise.hr.workforce` | 1 | TextSidekick — deskless worker SMS onboarding/training |

**Todo:**

- [ ] Add ontology verticals for common misfits (e.g. `consumer.education.language-learning`, clarify EdTech **infra** vs **institutional learning**)
- [ ] Extend `taxonomy/infer-archetype.mjs` or vertical-classify prompts so consumer language-learning and frontline workforce training map to `education` when appropriate (not `consumer.productivity.personal` / generic HR)
- [ ] Re-run `verticals:normalize --write` + `npm run db:migrate` (Supabase) after rule changes
- [ ] Re-check BM × Sector matrix: Education column should reflect reassigned companies, not stay empty by default

**Do not confuse with:** empty whitespace **gap cells** in that sector (those are unoccupied BM × vertical slots — expected). This step is about **misclassified companies** that should appear as observed density.

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
│  Postgres (Docker local dev → Supabase in production)       │
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

**Production vs local:**

| | Production (Vercel) | Local dev |
|--|---------------------|-----------|
| Data at load | `fetch(Railway/api/bundle)` from Supabase | Same via Vite proxy, or static fallback |
| Data refresh | Pipeline → `DATABASE_URL=...supabase... npm run db:migrate` | Pipeline → `npm run db:migrate` (Docker) |
| Env vars | `VITE_API_URL` on Vercel; `DATABASE_URL` on Railway | `.env` → localhost Postgres |

**API routes (all live on Railway):**

- `GET /api/bundle` — full explorer payload (what Vercel uses)
- `GET /api/companies`, `/api/gaps`, `/api/launches`, `/api/meta/facets` — granular reads

---

## Phase 1 — Production-ready for ~50 users

**Target:** Hosted app, live data, stable daily jobs, no laptop required.

### Data layer
- [x] Postgres schema v1 (`db/schema.sql`) — JSON mirror, shipped to Supabase
- [x] Docker local Postgres (`npm run db:up`)
- [x] JSON → Postgres migration (`npm run db:migrate`)
- [ ] **Schema v2 — data-engineer quality** (see Step F above) — **F1 done**
  - [x] Stub companies flagged (`companies.is_stub`; ~401 classified, ~490 launch-only stubs)
  - [x] FKs on `idea_cards` → phenotypes, verticals, business_models
  - [ ] Missing FK on `gap_cells.sector_id` (needs `sectors` table — F3)
  - [ ] FK on `company_classifications.vertical_sector_id` (F3)
  - [ ] Denormalized labels removed; JOIN-based queries
  - [ ] `sectors` / `industries` hierarchy tables
  - [ ] Launch fields deduplicated (single home in `launches`)
  - [ ] Supabase ERD clean enough to onboard a new engineer without explanation
- [ ] Pipeline writes to Postgres directly (replace migrate-as-copy)
- [ ] Migrate remaining data: raw scrape, bm-vertical matrix, audit queue
- [ ] **Education & Workforce classifications** (see Step H) — fix Ed/workforce-adjacent companies mapped to Consumer / AI infra / Enterprise HR only

### Taxonomy & classifications
- [ ] **Primary BM per company** — stop dual-tagging BM-01+BM-04 from phenotype map (see top of plan)
- [ ] Education & Workforce gap — ontology + rules + re-normalize (Step H)

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
- [x] Postgres: **Supabase** (session pooler, ~401 companies migrated)
- [x] API: **Railway** (`yc-scrape-production.up.railway.app`)
- [x] Explorer: **Vercel** (`VITE_API_URL` → Railway, verified in DevTools Network)
- [x] Environment variables: `DATABASE_URL` on Railway only; `VITE_API_URL` on Vercel
- [ ] GitHub Actions: launch check writes to Supabase (not git commits)

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
# Local
npm run db:migrate

# Production (one-off — paste your Supabase session pooler URI)
DATABASE_URL="postgresql://..." npm run db:migrate
```

---

## Cost ballpark (~50 users)

| Service | Monthly |
|---------|---------|
| Supabase Postgres | $0–25 |
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
| API | `server/read-api.mjs`, `db/queries.mjs` |
| Deploy | `db/DEPLOY.md`, Vercel + Railway + Supabase |
| Git / worktrees | `.worktrees/dev` for UI experiments |
| Schema design | `db/schema.sql`, `.cursor/agents/schema-reviewer.md` |

See **`db/README.md`** for database learning guide.
