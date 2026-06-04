# Postgres layer — learning guide

## Why Postgres?

Today your “database” is JSON files in `output/`. That works for 401 companies and one developer.

Postgres gives you:

- **Queries** — `SELECT * FROM companies WHERE vertical_id = 'healthcare.pharma.drug-discovery'`
- **Concurrent access** — API + GitHub Actions + you, at the same time
- **Relationships** — company → classification → phenotype → vertical
- **JSON when needed** — `JSONB` columns for arrays and nested rubric scores

Snowflake is for analytics at huge scale. Postgres is for **applications** that read/write constantly. Same SQL ideas, different job.

---

## Architecture

```
JSON files (source of truth during migration)
        │
        ▼
  migrate-from-json.mjs  ──▶  Postgres
        │                        │
        │                        ├── phenotypes, verticals (ontology)
        │                        ├── companies + classifications
        │                        ├── launches + launch_reviews
        │                        ├── gap_cells
        │                        └── idea_cards
        │
        ▼
   (future) API server reads Postgres
        │
        ▼
   Explorer UI
```

During Phase 1 we **dual-write nothing yet** — JSON pipeline still runs; migrate script copies into Postgres. Later, scripts write to Postgres first.

---

## Tables (what each one is)

| Table | Analogy | Source file |
|-------|---------|-------------|
| `phenotypes` | Business archetype dictionary | `output/phenotypes/ontology.json` |
| `verticals` | Industry workflow dictionary | `taxonomy/verticals.json` |
| `business_models` | BM-01 … BM-12 labels | `taxonomy/v0.1.json` |
| `companies` | YC startup row (classified or launch-only stub) | `normalized-assignments.json` + launch ingest |
| `company_classifications` | Taxonomy assignment per company | same |
| `company_business_models` | Many-to-many (company can have BM-01 + BM-04) | same |
| `launches` | YC Launch Y posts | `output/launches/reviews.json` |
| `launch_reviews` | Rubric scores per launch | same |
| `gap_cells` | Empty BM × vertical opportunities | `output/whitespace/gap-opportunity-ranked.json` |
| `idea_cards` | Synthetic startup ideas | `output/startup-library/library.json` |

**Primary key** = unique ID for each row (like `slug` for companies).  
**Foreign key** = “this column must match a row in another table” (e.g. `company_slug` → `companies.slug`).

### Schema v2 F1 — `is_stub` and `idea_cards` FKs

- **`companies.is_stub`** — `false` for the ~401 classified startups (have a `company_classifications` row); `true` for ~490 launch-only placeholder rows created so `launches` can FK safely.
- Explorer/API queries filter `is_stub = false` so bundle counts stay at 401.
- **`idea_cards`** — `vertical_id`, `phenotype_primary_id`, and `business_model` enforce FKs to ontology tables.
- Applied via `npm run db:migrate` (runs [`migrations/002_schema_f1.sql`](migrations/002_schema_f1.sql) after data load).

Verify:

```sql
SELECT is_stub, COUNT(*) FROM companies GROUP BY is_stub;
SELECT conname FROM pg_constraint WHERE conrelid = 'idea_cards'::regclass AND contype = 'f';
```

---

## Quick start

### 1. Install Docker Desktop

Postgres runs inside a container — a lightweight virtual box with just the database.

### 2. Start Postgres

```bash
npm run db:up
```

This runs `docker compose up -d` using `docker-compose.yml` in the project root.

### 3. Set connection string

Copy `.env.example` → `.env` (if you haven't) and ensure:

```
DATABASE_URL=postgresql://ycscrape:ycscrape@localhost:5432/ycscrape
```

### 4. Create tables + load data

```bash
npm run db:migrate
```

### 5. Explore in SQL

```bash
npm run db:psql
```

Example queries:

```sql
-- How many companies?
SELECT COUNT(*) FROM companies;

-- Healthcare companies
SELECT c.slug, c.name, cc.vertical_id, cc.confidence
FROM companies c
JOIN company_classifications cc ON cc.company_slug = c.slug
WHERE cc.vertical_sector_id = 'healthcare-life-sciences'
ORDER BY cc.confidence DESC
LIMIT 10;

-- Recent launch reviews that were "surprise"
SELECT l.company_slug, lr.predictability_band, lr.conformance_index
FROM launch_reviews lr
JOIN launches l ON l.launch_id = lr.launch_id
WHERE lr.predictability_band = 'surprise'
ORDER BY lr.evaluated_at DESC
LIMIT 10;
```

---

## Files in this folder

| File | Purpose |
|------|---------|
| `schema.sql` | `CREATE TABLE` statements — the schema |
| `migrations/002_schema_f1.sql` | F1: `is_stub` + `idea_cards` FKs (idempotent) |
| `client.mjs` | Shared Postgres connection (pool) |
| `migrate-from-json.mjs` | One-time / repeat load from JSON exports |

---

## API endpoints (read from Postgres)

Run `npm run api:dev` then try in browser or curl:

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | DB connection check |
| `GET /api/bundle` | Full explorer payload (same shape as `data.bundle.json`) |
| `GET /api/companies?batch=Spring%202026&limit=50` | Filtered company list |
| `GET /api/companies/hexa` | Single company detail |
| `GET /api/gaps?limit=20` | Ranked whitespace cells |
| `GET /api/launches?verdict=surprise&limit=10` | Launch rubric results |
| `GET /api/meta/facets` | Filter dropdown data |

Implementation: `db/queries.mjs` (SQL) → `server/read-api.mjs` (HTTP) → mounted in `server/generator-api.mjs`.

---

## Next steps after migrate works

1. ~~Add read API~~ (done — `npm run api:dev`)
2. Point explorer at `/api/bundle` (done — with static fallback)
3. **Deploy to Supabase** — see **`DEPLOY.md`**
4. Pipeline writes to Postgres directly (replace `db:migrate` copy step)
