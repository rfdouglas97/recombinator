-- YC Scrape Postgres schema (Phase 1)
-- Run via: npm run db:migrate

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Ontology reference tables ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS phenotypes (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  family          TEXT,
  value_wedge     TEXT,
  ai_application  TEXT,
  description     TEXT,
  source          TEXT DEFAULT 'seed',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verticals (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  sector_id       TEXT,
  sector_label    TEXT,
  industry_id     TEXT,
  industry_label  TEXT,
  workflow        TEXT,
  buyers          JSONB DEFAULT '[]'::jsonb,
  aliases         JSONB DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_models (
  code            TEXT PRIMARY KEY,
  label           TEXT NOT NULL
);

-- ─── Companies ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  slug                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  website             TEXT,
  yc_profile_url      TEXT,
  batch               TEXT,
  one_liner           TEXT,
  description_combined TEXT,
  yc_industries       JSONB DEFAULT '[]'::jsonb,
  yc_tags             JSONB DEFAULT '[]'::jsonb,
  launch_id           BIGINT,
  launch_url          TEXT,
  launch_title        TEXT,
  launch_tagline      TEXT,
  launch_created_at   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_batch ON companies (batch);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies (name);

CREATE TABLE IF NOT EXISTS company_classifications (
  company_slug            TEXT PRIMARY KEY REFERENCES companies (slug) ON DELETE CASCADE,
  phenotype_primary_id    TEXT REFERENCES phenotypes (id),
  phenotype_secondary_id  TEXT REFERENCES phenotypes (id),
  phenotype_primary_label TEXT,
  phenotype_family        TEXT,
  vertical_id             TEXT REFERENCES verticals (id),
  vertical_label          TEXT,
  vertical_sector_id      TEXT,
  canonical_vertical_id   TEXT,
  industry_sub_vertical   TEXT,
  value_wedge             TEXT,
  ai_application          TEXT,
  ai_application_patterns JSONB DEFAULT '[]'::jsonb,
  what_they_sell          TEXT,
  ai_play                 TEXT,
  who_pays                TEXT,
  confidence              REAL,
  rationale               TEXT,
  method                  TEXT,
  classified_at           TIMESTAMPTZ,
  metadata                JSONB DEFAULT '{}'::jsonb,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classifications_phenotype ON company_classifications (phenotype_primary_id);
CREATE INDEX IF NOT EXISTS idx_classifications_vertical ON company_classifications (vertical_id);
CREATE INDEX IF NOT EXISTS idx_classifications_sector ON company_classifications (vertical_sector_id);
CREATE INDEX IF NOT EXISTS idx_classifications_confidence ON company_classifications (confidence DESC);

CREATE TABLE IF NOT EXISTS company_business_models (
  company_slug        TEXT NOT NULL REFERENCES companies (slug) ON DELETE CASCADE,
  business_model_code TEXT NOT NULL REFERENCES business_models (code),
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (company_slug, business_model_code)
);

-- ─── Launches ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS launches (
  launch_id         BIGINT PRIMARY KEY,
  launch_slug       TEXT,
  launch_url        TEXT NOT NULL,
  title             TEXT,
  tagline           TEXT,
  body              TEXT,
  company_slug      TEXT REFERENCES companies (slug) ON DELETE SET NULL,
  company_name      TEXT,
  created_at        TIMESTAMPTZ,
  total_vote_count  INT DEFAULT 0,
  scraped_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launches_company ON launches (company_slug);
CREATE INDEX IF NOT EXISTS idx_launches_created ON launches (created_at DESC);

CREATE TABLE IF NOT EXISTS launch_reviews (
  launch_id               BIGINT PRIMARY KEY REFERENCES launches (launch_id) ON DELETE CASCADE,
  rubric_version          TEXT,
  conformance_index       INT,
  verdict                 TEXT,
  predictability_band     TEXT,
  would_have_been_predicted BOOLEAN,
  taxonomy                JSONB DEFAULT '{}'::jsonb,
  predictor               JSONB DEFAULT '{}'::jsonb,
  notes                   JSONB DEFAULT '[]'::jsonb,
  evaluated_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_launch_reviews_verdict ON launch_reviews (verdict);
CREATE INDEX IF NOT EXISTS idx_launch_reviews_band ON launch_reviews (predictability_band);

-- ─── Whitespace & ideas ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gap_cells (
  id                    BIGSERIAL PRIMARY KEY,
  business_model        TEXT NOT NULL REFERENCES business_models (code),
  vertical_id           TEXT NOT NULL REFERENCES verticals (id),
  phenotype_primary_id  TEXT REFERENCES phenotypes (id),
  vertical_label        TEXT,
  sector_id             TEXT,
  workflow              TEXT,
  opportunity_score     INT,
  transfer_score        INT,
  transfer_band         TEXT,
  rank                  INT,
  flags                 JSONB DEFAULT '[]'::jsonb,
  analog_slugs          JSONB DEFAULT '[]'::jsonb,
  metadata              JSONB DEFAULT '{}'::jsonb,
  UNIQUE (business_model, vertical_id, phenotype_primary_id)
);

CREATE INDEX IF NOT EXISTS idx_gap_cells_rank ON gap_cells (rank);
CREATE INDEX IF NOT EXISTS idx_gap_cells_score ON gap_cells (opportunity_score DESC);

CREATE TABLE IF NOT EXISTS idea_cards (
  id              TEXT PRIMARY KEY,
  variant         INT,
  generated_at    TIMESTAMPTZ,
  business_model  TEXT,
  vertical_id     TEXT,
  phenotype_primary_id TEXT,
  cell_key        TEXT,
  opportunity_score INT,
  opportunity_rank  INT,
  startup         JSONB NOT NULL DEFAULT '{}'::jsonb,
  whitespace      JSONB NOT NULL DEFAULT '{}'::jsonb,
  scores          JSONB DEFAULT '{}'::jsonb,
  judgment        TEXT,
  human_score     REAL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_idea_cards_vertical ON idea_cards (vertical_id);
CREATE INDEX IF NOT EXISTS idx_idea_cards_judgment ON idea_cards (judgment);

-- ─── Migration bookkeeping ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
