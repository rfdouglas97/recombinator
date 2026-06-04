-- Schema v2 F1: is_stub on companies + idea_cards foreign keys
-- Idempotent — safe on existing Supabase/Docker DBs after initial schema.sql load.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_stub BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_stub ON companies (is_stub);

-- Reconcile stub flags (same logic as migrate-from-json.mjs)
UPDATE companies SET is_stub = false
WHERE slug IN (SELECT company_slug FROM company_classifications);

UPDATE companies SET is_stub = true
WHERE slug NOT IN (SELECT company_slug FROM company_classifications);

-- idea_cards FKs (skip if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idea_cards_vertical_fk'
  ) THEN
    ALTER TABLE idea_cards
      ADD CONSTRAINT idea_cards_vertical_fk
        FOREIGN KEY (vertical_id) REFERENCES verticals (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idea_cards_phenotype_fk'
  ) THEN
    ALTER TABLE idea_cards
      ADD CONSTRAINT idea_cards_phenotype_fk
        FOREIGN KEY (phenotype_primary_id) REFERENCES phenotypes (id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'idea_cards_business_model_fk'
  ) THEN
    ALTER TABLE idea_cards
      ADD CONSTRAINT idea_cards_business_model_fk
        FOREIGN KEY (business_model) REFERENCES business_models (code);
  END IF;
END $$;
