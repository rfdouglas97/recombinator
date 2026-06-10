# Roadmap

Recombinator started as a research pipeline (batch scripts writing JSON to `output/`) and is being hardened into a production web app: Postgres (Supabase) → read API (Railway) → React explorer (Vercel), with a daily GitHub Action keeping the corpus fresh.

This file tracks where the project is headed. For how the pieces deploy, see [`db/DEPLOY.md`](../db/DEPLOY.md); for the data model, see [`db/README.md`](../db/README.md).

## Near-term

### Taxonomy: one primary business model per company

Many companies currently carry two BM codes because `taxonomy/phenotype-to-bm.mjs` maps each phenotype to all _compatible_ GTM shapes, and classify/reclassify copies the full list onto every company. That double-counts a single company across multiple matrix rows.

- Choose one `primary_bm` per company at classify/reclassify time (LLM or rules); store it on assignments and in Postgres.
- Keep compatible BMs on the phenotype for gap synthesis / idea generation only — not for placing real companies in the matrix.
- Compute matrix + bundle counts from `primary_bm` only.

Files: `taxonomy/phenotype-to-bm.mjs`, `agent/reclassify-classifications.mjs`, `normalize-verticals.mjs`, `db/schema.sql`, `db/queries.mjs`.

### Schema v2 — production-grade data model

Replace the Phase 1 "mirror the JSON files" schema with a normalized model a data engineer would sign off on.

- Normalize ontology: `sectors` → `industries` → `verticals`; phenotypes and business models as reference tables.
- Labels come from JOINs, not copied columns.
- Enforce FK integrity on every `*_id` column.
- Separate classified companies from launch-only stubs.
- Keep launch metadata in `launches` only.
- Expose the BM × vertical matrix as a view / materialized table rather than re-deriving from JSON.

Rollout: F1 (done — `is_stub` + `idea_cards` FKs) → F2 (drop denormalized labels) → F3 (`sectors`/`industries` tables) → F4 (dedupe launch fields) → F5 (pipeline writes directly).

### Education & Workforce taxonomy gap

Ed/workforce-adjacent companies are classified into Consumer / AI infra / Enterprise HR, leaving the Education sector artificially empty. Add ontology verticals for common misfits, extend `taxonomy/infer-archetype.mjs` (and the vertical-classify prompts), then re-normalize and re-migrate.

### Pipeline → Postgres directly

Replace the manual `db:migrate` copy step so scripts upsert to Postgres after classify / launch-check / normalize, and have the daily GitHub Action write to Supabase instead of relying on committed JSON.

## Phase 2 — Multi-user product

- Auth (gate the API, not just the UI)
- User-scoped idea-card judgments
- Human review queue for low-confidence classifications
- Versioned ontology changes
- LLM cost tracking per job
- Docker image for the API + Playwright worker
- Broader test coverage: API smoke, rubric fixtures, one explorer E2E

## Phase 3 — Intelligence platform

- Near-real-time launch processing
- Full-text search (Postgres `tsvector` or Typesense)
- Trend analytics by batch
- Export API (CSV, Notion)
- Optional embeddings for similarity search

## Explicitly out of scope (for now)

- Kubernetes / microservices
- Self-hosted LLMs (unless cost forces it)
- Vector DB / embeddings
- Rewriting the taxonomy agents — wrap them with better storage instead
