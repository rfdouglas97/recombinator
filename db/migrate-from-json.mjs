#!/usr/bin/env node
/**
 * Load JSON pipeline exports into Postgres.
 *
 * This is ETL: Extract (read JSON) → Transform (map fields) → Load (INSERT).
 *
 * Usage:
 *   npm run db:migrate          # apply schema + load all data
 *   npm run db:migrate -- --dry-run
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { query, closePool, pingDatabase } from './client.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DB_DIR = dirname(fileURLToPath(import.meta.url));

const PATHS = {
  schema: join(DB_DIR, 'schema.sql'),
  schemaF1: join(DB_DIR, 'migrations/002_schema_f1.sql'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  verticals: join(ROOT, 'taxonomy/verticals.json'),
  taxonomy: join(ROOT, 'taxonomy/v0.1.json'),
  companies: join(ROOT, 'output/verticals/normalized-assignments.json'),
  launchReviews: join(ROOT, 'output/launches/reviews.json'),
  rankedGaps: join(ROOT, 'output/whitespace/gap-opportunity-ranked.json'),
  library: join(ROOT, 'output/startup-library/library.json'),
};

function loadJson(path) {
  if (!existsSync(path)) {
    console.warn(`  skip (missing): ${path}`);
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs() {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function applySchema() {
  const sql = readFileSync(PATHS.schema, 'utf8');
  await query(sql);
  console.log('✓ schema applied');
}

async function applySchemaF1() {
  if (!existsSync(PATHS.schemaF1)) return;
  const sql = readFileSync(PATHS.schemaF1, 'utf8');
  await query(sql);
  console.log('✓ schema F1 applied (is_stub + idea_cards FKs)');
}

async function reconcileCompanyStubs() {
  await query(`
    UPDATE companies SET is_stub = false
    WHERE slug IN (SELECT company_slug FROM company_classifications)
  `);
  await query(`
    UPDATE companies SET is_stub = true
    WHERE slug NOT IN (SELECT company_slug FROM company_classifications)
  `);
  const { rows } = await query(`SELECT is_stub, COUNT(*)::int AS n FROM companies GROUP BY is_stub ORDER BY is_stub`);
  console.log('✓ company stubs reconciled:', rows.map((r) => `${r.is_stub}=${r.n}`).join(', '));
}

async function upsertMigration(name) {
  await query(
    `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [name],
  );
}

async function loadBusinessModels(taxonomy) {
  if (!taxonomy?.business_models) return 0;
  let n = 0;
  for (const [code, def] of Object.entries(taxonomy.business_models)) {
    await query(
      `INSERT INTO business_models (code, label) VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label`,
      [code, def.label ?? def.name ?? code],
    );
    n++;
  }
  console.log(`✓ business_models: ${n}`);
  return n;
}

async function loadPhenotypes(ontology) {
  if (!ontology?.phenotypes) return 0;
  for (const p of ontology.phenotypes) {
    await query(
      `INSERT INTO phenotypes (id, label, family, value_wedge, ai_application, description, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label, family = EXCLUDED.family,
         value_wedge = EXCLUDED.value_wedge, ai_application = EXCLUDED.ai_application,
         description = EXCLUDED.description, updated_at = NOW()`,
      [
        p.id,
        p.label,
        p.family ?? null,
        p.value_wedge ?? null,
        p.ai_application ?? null,
        p.description ?? null,
        p.source ?? 'ontology',
      ],
    );
  }
  console.log(`✓ phenotypes: ${ontology.phenotypes.length}`);
  return ontology.phenotypes.length;
}

async function loadVerticals(doc) {
  if (!doc?.verticals) return 0;
  for (const v of doc.verticals) {
    await query(
      `INSERT INTO verticals (id, label, sector_id, sector_label, industry_id, industry_label, workflow, buyers, aliases)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label, sector_id = EXCLUDED.sector_id,
         sector_label = EXCLUDED.sector_label, industry_id = EXCLUDED.industry_id,
         industry_label = EXCLUDED.industry_label, workflow = EXCLUDED.workflow,
         buyers = EXCLUDED.buyers, aliases = EXCLUDED.aliases, updated_at = NOW()`,
      [
        v.id,
        v.label,
        v.sector_id ?? null,
        v.sector_label ?? null,
        v.industry_id ?? null,
        v.industry_label ?? null,
        v.workflow ?? null,
        JSON.stringify(v.buyers ?? []),
        JSON.stringify(v.aliases ?? []),
      ],
    );
  }
  console.log(`✓ verticals: ${doc.verticals.length}`);
  return doc.verticals.length;
}

async function ensurePhenotype(id, label = id) {
  if (!id) return;
  await query(
    `INSERT INTO phenotypes (id, label, family) VALUES ($1, $2, 'inferred')
     ON CONFLICT (id) DO NOTHING`,
    [id, label],
  );
}

async function ensureVertical(id, label = id) {
  if (!id) return;
  await query(
    `INSERT INTO verticals (id, label) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [id, label],
  );
}

async function loadCompanies(rows) {
  if (!rows?.length) return 0;

  for (const r of rows) {
    await ensurePhenotype(r.phenotype_primary_id, r.phenotype_primary_label);
    if (r.phenotype_secondary_id) await ensurePhenotype(r.phenotype_secondary_id);
    if (r.vertical_id) await ensureVertical(r.vertical_id, r.vertical_label);

    await query(
      `INSERT INTO companies (
         slug, name, website, yc_profile_url, batch, one_liner, description_combined,
         yc_industries, yc_tags, launch_id, launch_url, launch_title, launch_tagline, launch_created_at,
         is_stub, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,NOW())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, website = EXCLUDED.website, batch = EXCLUDED.batch,
         one_liner = EXCLUDED.one_liner, description_combined = EXCLUDED.description_combined,
         yc_industries = EXCLUDED.yc_industries, yc_tags = EXCLUDED.yc_tags,
         launch_id = EXCLUDED.launch_id, launch_url = EXCLUDED.launch_url,
         launch_title = EXCLUDED.launch_title, launch_tagline = EXCLUDED.launch_tagline,
         launch_created_at = EXCLUDED.launch_created_at, is_stub = false, updated_at = NOW()`,
      [
        r.slug,
        r.name,
        r.website ?? null,
        r.yc_profile_url ?? null,
        r.batch ?? null,
        r.one_liner ?? null,
        r.description_combined ?? null,
        JSON.stringify(r.yc_industries ?? []),
        JSON.stringify(r.yc_tags ?? []),
        r.launch_id ?? null,
        r.launch_url ?? null,
        r.launch_title ?? null,
        r.launch_tagline ?? null,
        r.launch_created_at ?? null,
      ],
    );

    const meta = {};
    if (r.reclassified_from) meta.reclassified_from = r.reclassified_from;
    if (r.vertical_classify_rationale) meta.vertical_classify_rationale = r.vertical_classify_rationale;

    await query(
      `INSERT INTO company_classifications (
         company_slug, phenotype_primary_id, phenotype_secondary_id, phenotype_primary_label,
         phenotype_family, vertical_id, vertical_label, vertical_sector_id, canonical_vertical_id,
         industry_sub_vertical, value_wedge, ai_application, ai_application_patterns,
         what_they_sell, ai_play, who_pays, confidence, rationale, method, classified_at, metadata, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
       ON CONFLICT (company_slug) DO UPDATE SET
         phenotype_primary_id = EXCLUDED.phenotype_primary_id,
         phenotype_secondary_id = EXCLUDED.phenotype_secondary_id,
         vertical_id = EXCLUDED.vertical_id, confidence = EXCLUDED.confidence,
         rationale = EXCLUDED.rationale, method = EXCLUDED.method,
         classified_at = EXCLUDED.classified_at, metadata = EXCLUDED.metadata, updated_at = NOW()`,
      [
        r.slug,
        r.phenotype_primary_id ?? null,
        r.phenotype_secondary_id ?? null,
        r.phenotype_primary_label ?? null,
        r.phenotype_family ?? null,
        r.vertical_id ?? null,
        r.vertical_label ?? null,
        r.vertical_sector_id ?? null,
        r.canonical_vertical_id ?? null,
        r.industry_sub_vertical ?? null,
        r.value_wedge ?? null,
        r.ai_application ?? null,
        JSON.stringify(r.ai_application_patterns ?? []),
        r.what_they_sell ?? null,
        r.ai_play ?? null,
        r.who_pays ?? null,
        r.confidence ?? null,
        r.rationale ?? null,
        r.method ?? null,
        r.classified_at ?? null,
        JSON.stringify(meta),
      ],
    );

    await query(`DELETE FROM company_business_models WHERE company_slug = $1`, [r.slug]);
    const bms = r.business_models ?? [];
    for (let i = 0; i < bms.length; i++) {
      const code = bms[i];
      await query(
        `INSERT INTO business_models (code, label) VALUES ($1, $1) ON CONFLICT DO NOTHING`,
        [code],
      );
      await query(
        `INSERT INTO company_business_models (company_slug, business_model_code, is_primary)
         VALUES ($1, $2, $3)`,
        [r.slug, code, i === 0],
      );
    }
  }

  console.log(`✓ companies + classifications: ${rows.length}`);
  return rows.length;
}

async function ensureCompany(slug, name = slug) {
  if (!slug) return;
  await query(
    `INSERT INTO companies (slug, name, is_stub) VALUES ($1, $2, true)
     ON CONFLICT (slug) DO UPDATE SET
       is_stub = CASE
         WHEN EXISTS (SELECT 1 FROM company_classifications cc WHERE cc.company_slug = companies.slug)
         THEN false
         ELSE true
       END`,
    [slug, name ?? slug],
  );
}

async function loadLaunchReviews(doc) {
  const reviews = doc?.reviews ?? [];
  if (!reviews.length) return 0;

  for (const item of reviews) {
    const launchId = item.launch_id;
    if (!launchId) continue;

    if (item.company_slug) await ensureCompany(item.company_slug, item.company_slug);

    await query(
      `INSERT INTO launches (launch_id, launch_url, company_slug, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (launch_id) DO UPDATE SET
         launch_url = EXCLUDED.launch_url, company_slug = EXCLUDED.company_slug,
         created_at = EXCLUDED.created_at, updated_at = NOW()`,
      [launchId, item.launch_url ?? '', item.company_slug ?? null, item.created_at ?? null],
    );

    const review = item.review ?? {};
    const tax = review.taxonomy ?? {};
    const pred = review.predictor ?? {};

    await query(
      `INSERT INTO launch_reviews (
         launch_id, rubric_version, conformance_index, verdict, predictability_band,
         would_have_been_predicted, taxonomy, predictor, notes, evaluated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (launch_id) DO UPDATE SET
         rubric_version = EXCLUDED.rubric_version,
         conformance_index = EXCLUDED.conformance_index,
         verdict = EXCLUDED.verdict,
         predictability_band = EXCLUDED.predictability_band,
         would_have_been_predicted = EXCLUDED.would_have_been_predicted,
         taxonomy = EXCLUDED.taxonomy, predictor = EXCLUDED.predictor,
         notes = EXCLUDED.notes, evaluated_at = EXCLUDED.evaluated_at`,
      [
        launchId,
        review.rubric_version ?? null,
        tax.conformance_index ?? null,
        tax.verdict ?? null,
        pred.predictability_band ?? null,
        pred.would_have_been_predicted ?? null,
        JSON.stringify(tax),
        JSON.stringify(pred),
        JSON.stringify(review.notes ?? []),
        review.evaluated_at ?? null,
      ],
    );
  }

  console.log(`✓ launch reviews: ${reviews.length}`);
  return reviews.length;
}

async function loadGapCells(doc) {
  const gaps = doc?.gaps ?? [];
  if (!gaps.length) return 0;

  await query(`TRUNCATE gap_cells RESTART IDENTITY`);

  for (const g of gaps) {
    if (g.phenotype_primary_id) await ensurePhenotype(g.phenotype_primary_id);
    if (g.vertical_id) await ensureVertical(g.vertical_id, g.vertical_label);
    if (g.business_model) {
      await query(
        `INSERT INTO business_models (code, label) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [g.business_model, g.business_model_label ?? g.business_model],
      );
    }

    await query(
      `INSERT INTO gap_cells (
         business_model, vertical_id, phenotype_primary_id, vertical_label, sector_id, workflow,
         opportunity_score, transfer_score, transfer_band, rank, flags, analog_slugs, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        g.business_model,
        g.vertical_id,
        g.phenotype_primary_id ?? null,
        g.vertical_label ?? null,
        g.sector_id ?? null,
        g.workflow ?? null,
        g.opportunity_score ?? null,
        g.transfer_score ?? null,
        g.transfer_band ?? null,
        g.rank ?? null,
        JSON.stringify(g.flags ?? []),
        JSON.stringify(g.analog_slugs ?? []),
        JSON.stringify({ scores: g.scores ?? {}, adjacent_cluster_slugs: g.adjacent_cluster_slugs ?? [] }),
      ],
    );
  }

  console.log(`✓ gap_cells: ${gaps.length}`);
  return gaps.length;
}

async function validateIdeaCardRefs() {
  const checks = [
    ['vertical_id', 'verticals', 'id'],
    ['phenotype_primary_id', 'phenotypes', 'id'],
    ['business_model', 'business_models', 'code'],
  ];
  for (const [col, table, pk] of checks) {
    const { rows } = await query(
      `SELECT id, ${col} AS ref FROM idea_cards
       WHERE ${col} IS NOT NULL AND ${col} NOT IN (SELECT ${pk} FROM ${table})`,
    );
    if (rows.length) {
      console.warn(`  warn: ${rows.length} idea_cards with orphan ${col}`);
      for (const row of rows.slice(0, 5)) {
        console.warn(`    ${row.id} → ${row.ref}`);
      }
    }
  }
}

async function loadIdeaCards(doc) {
  const cards = doc?.cards ?? doc ?? [];
  const list = Array.isArray(cards) ? cards : [];
  if (!list.length) return 0;

  for (const c of list) {
    const ws = c.whitespace ?? {};
    const target = ws.target_cell ?? c.startup?.target_cell ?? {};
    const bm = ws.business_model ?? target.business_model ?? null;
    const verticalId = ws.vertical_id ?? target.vertical_id ?? null;
    const phenotypeId = ws.target_cell?.phenotype_primary_id ?? target.phenotype_primary_id ?? null;

    if (phenotypeId) await ensurePhenotype(phenotypeId);
    if (verticalId) await ensureVertical(verticalId, verticalId);
    if (bm) {
      await query(
        `INSERT INTO business_models (code, label) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [bm, bm],
      );
    }

    await query(
      `INSERT INTO idea_cards (
         id, variant, generated_at, business_model, vertical_id, phenotype_primary_id,
         cell_key, opportunity_score, opportunity_rank, startup, whitespace, scores, judgment, human_score, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (id) DO UPDATE SET
         startup = EXCLUDED.startup, whitespace = EXCLUDED.whitespace,
         scores = EXCLUDED.scores, judgment = EXCLUDED.judgment, updated_at = NOW()`,
      [
        c.id,
        c.variant ?? null,
        c.generated_at ?? null,
        bm,
        verticalId,
        phenotypeId,
        ws.cell_key ?? null,
        ws.opportunity_score ?? null,
        ws.opportunity_rank ?? null,
        JSON.stringify(c.startup ?? {}),
        JSON.stringify(ws),
        JSON.stringify(c.scores ?? {}),
        c.judgment ?? null,
        c.human_score ?? null,
      ],
    );
  }

  console.log(`✓ idea_cards: ${list.length}`);
  return list.length;
}

async function printSummary() {
  const tables = [
    'phenotypes',
    'verticals',
    'business_models',
    'companies',
    'company_classifications',
    'launches',
    'launch_reviews',
    'gap_cells',
    'idea_cards',
  ];
  console.log('\n── Row counts ──');
  for (const t of tables) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    console.log(`  ${t}: ${rows[0].n}`);
  }
}

async function main() {
  const { dryRun } = parseArgs();
  if (dryRun) {
    console.log('Dry run — would load from:');
    for (const [k, p] of Object.entries(PATHS)) {
      if (k === 'schema') continue;
      console.log(`  ${k}: ${existsSync(p) ? 'found' : 'MISSING'}`);
    }
    return;
  }

  console.log('Connecting to Postgres…');
  const info = await pingDatabase();
  console.log(`  database: ${info.db} @ ${info.now}\n`);

  await applySchema();

  await loadBusinessModels(loadJson(PATHS.taxonomy));
  await loadPhenotypes(loadJson(PATHS.ontology));
  await loadVerticals(loadJson(PATHS.verticals));

  const companies = loadJson(PATHS.companies);
  if (companies) await loadCompanies(Array.isArray(companies) ? companies : Object.values(companies));

  await loadLaunchReviews(loadJson(PATHS.launchReviews));
  await loadGapCells(loadJson(PATHS.rankedGaps));
  await loadIdeaCards(loadJson(PATHS.library));

  await reconcileCompanyStubs();
  await validateIdeaCardRefs();
  await applySchemaF1();

  await upsertMigration('migrate-from-json-v1');
  await upsertMigration('schema-f1');
  await printSummary();
  await closePool();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
