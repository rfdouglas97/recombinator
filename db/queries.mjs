/**
 * Postgres read queries for the explorer API.
 */

import { query } from './client.mjs';
import { explorerBatchFacets, loadCohortBatches } from '../scripts/corpus-allowlist.mjs';

/** Sectors hidden from explorer until ontology is ready (see plan.md Step H). */
export const EXCLUDED_SECTOR_IDS = new Set(['education']);

function sectorVisible(sectorId) {
  return sectorId && !EXCLUDED_SECTOR_IDS.has(sectorId);
}

function truncate(s, max = 2000) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export function rowToCompany(row) {
  return {
    slug: row.slug,
    name: row.name,
    website: row.website,
    yc_profile_url: row.yc_profile_url,
    batch: row.batch,
    one_liner: row.one_liner,
    description: truncate(row.description_combined ?? row.one_liner),
    industry_sub_vertical: row.industry_sub_vertical,
    vertical_id: row.vertical_id,
    vertical_label: row.vertical_label,
    vertical_sector_id: row.vertical_sector_id,
    phenotype_primary_id: row.phenotype_primary_id,
    phenotype_primary_label: row.phenotype_primary_label,
    phenotype_family: row.phenotype_family,
    phenotype_secondary_id: row.phenotype_secondary_id ?? null,
    business_models: row.business_models ?? [],
    confidence: row.confidence != null ? Number(row.confidence) : null,
    what_they_sell: row.what_they_sell,
    ai_play: row.ai_play,
    yc_tags: row.yc_tags ?? [],
  };
}

const COMPANY_SELECT = `
  SELECT
    c.slug, c.name, c.website, c.yc_profile_url, c.batch, c.one_liner,
    c.description_combined, c.yc_tags,
    cc.industry_sub_vertical, cc.vertical_id, cc.vertical_label, cc.vertical_sector_id,
    cc.phenotype_primary_id, cc.phenotype_primary_label, cc.phenotype_family,
    cc.phenotype_secondary_id, cc.confidence, cc.what_they_sell, cc.ai_play,
    COALESCE(
      (SELECT json_agg(cbm.business_model_code ORDER BY cbm.is_primary DESC)
       FROM company_business_models cbm WHERE cbm.company_slug = c.slug),
      '[]'::json
    ) AS business_models
  FROM companies c
  INNER JOIN company_classifications cc ON cc.company_slug = c.slug
  WHERE c.is_stub = false
`;

const COMPANY_DETAIL_SELECT = `
  SELECT
    c.slug, c.name, c.website, c.yc_profile_url, c.batch, c.one_liner,
    c.description_combined, c.yc_tags, c.yc_industries, c.launch_url, c.launch_title,
    cc.industry_sub_vertical, cc.vertical_id, cc.vertical_label, cc.vertical_sector_id,
    cc.phenotype_primary_id, cc.phenotype_primary_label, cc.phenotype_family,
    cc.phenotype_secondary_id, cc.confidence, cc.what_they_sell, cc.ai_play,
    cc.who_pays, cc.value_wedge, cc.ai_application, cc.ai_application_patterns,
    cc.rationale, cc.method, cc.classified_at,
    COALESCE(
      (SELECT json_agg(cbm.business_model_code ORDER BY cbm.is_primary DESC)
       FROM company_business_models cbm WHERE cbm.company_slug = c.slug),
      '[]'::json
    ) AS business_models
  FROM companies c
  INNER JOIN company_classifications cc ON cc.company_slug = c.slug
  WHERE c.is_stub = false
`;

export async function listCompanies(filters = {}) {
  const { batch, sector, phenotype, vertical, search, limit = 500, offset = 0 } = filters;
  const params = [];
  const where = [];

  if (batch) {
    params.push(batch);
    where.push(`c.batch = $${params.length}`);
  }
  if (sector) {
    params.push(sector);
    where.push(`cc.vertical_sector_id = $${params.length}`);
  }
  if (phenotype) {
    params.push(phenotype);
    where.push(`cc.phenotype_primary_id = $${params.length}`);
  }
  if (vertical) {
    params.push(vertical);
    where.push(`cc.vertical_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(LOWER(c.name) LIKE $${i} OR LOWER(c.slug) LIKE $${i} OR LOWER(c.one_liner) LIKE $${i})`,
    );
  }

  params.push(Math.min(Number(limit) || 500, 1000));
  const limitIdx = params.length;
  params.push(Number(offset) || 0);
  const offsetIdx = params.length;

  const sql = `
    ${COMPANY_SELECT}
    ${where.length ? `AND ${where.join(' AND ')}` : ''}
    ORDER BY c.name
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await query(sql, params);
  return rows.map(rowToCompany);
}

export async function getCompanyDetail(slug) {
  const { rows } = await query(`${COMPANY_DETAIL_SELECT} AND c.slug = $1`, [slug]);
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    ...rowToCompany(row),
    who_pays: row.who_pays ?? null,
    value_wedge: row.value_wedge ?? null,
    ai_application: row.ai_application ?? null,
    ai_application_patterns: row.ai_application_patterns ?? [],
    rationale: row.rationale ?? null,
    method: row.method ?? null,
    classified_at: row.classified_at ?? null,
    yc_industries: row.yc_industries ?? [],
    launch_url: row.launch_url ?? null,
    launch_title: row.launch_title ?? null,
  };
}

export async function countCompanies(filters = {}) {
  const companies = await listCompanies({ ...filters, limit: 10000 });
  return companies.length;
}

export async function listGaps({ limit = 100, sector = null } = {}) {
  const params = [];
  let where = '';
  if (sector) {
    params.push(sector);
    where = `WHERE sector_id = $1`;
  }
  params.push(Math.min(Number(limit) || 100, 500));

  const { rows } = await query(
    `SELECT business_model, vertical_id, phenotype_primary_id, vertical_label, sector_id,
            workflow, opportunity_score, transfer_score, transfer_band, rank, flags, analog_slugs
     FROM gap_cells ${where}
     ORDER BY rank NULLS LAST, opportunity_score DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((g) => ({
    business_model: g.business_model,
    business_model_label: g.business_model,
    vertical_id: g.vertical_id,
    vertical_label: g.vertical_label,
    sector_id: g.sector_id,
    sector_label: g.sector_id,
    industry_label: null,
    workflow: g.workflow,
    opportunity_score: g.opportunity_score,
    transfer_score: g.transfer_score,
    transfer_band: g.transfer_band,
    rank: g.rank,
    flags: g.flags ?? [],
    analog_slugs: g.analog_slugs ?? [],
    target_cell: {
      business_model: g.business_model,
      vertical_id: g.vertical_id,
      phenotype_primary_id: g.phenotype_primary_id,
    },
    cell_key: `${g.business_model}|${g.vertical_id}`,
  }));
}

export async function listLaunches({ limit = 50, verdict = null, band = null } = {}) {
  const params = [];
  const where = [];
  if (verdict) {
    params.push(verdict);
    where.push(`lr.verdict = $${params.length}`);
  }
  if (band) {
    params.push(band);
    where.push(`lr.predictability_band = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const { rows } = await query(
    `SELECT l.launch_id, l.launch_url, l.title, l.tagline, l.company_slug, l.created_at,
            lr.conformance_index, lr.verdict, lr.predictability_band,
            lr.would_have_been_predicted, lr.evaluated_at,
            cc.vertical_id, cc.phenotype_primary_id, c.name AS company_name
     FROM launches l
     LEFT JOIN launch_reviews lr ON lr.launch_id = l.launch_id
     LEFT JOIN companies c ON c.slug = l.company_slug
     LEFT JOIN company_classifications cc ON cc.company_slug = l.company_slug
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY l.created_at DESC NULLS LAST
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function getFacets(classifiedCompanies = null) {
  const [phenotypes, verticals, businessModels] = await Promise.all([
    query(`SELECT id, label, family FROM phenotypes ORDER BY label`),
    query(
      `SELECT id, label, sector_id, industry_id, industry_label, sector_label FROM verticals ORDER BY label`,
    ),
    query(`SELECT code AS id, label FROM business_models ORDER BY code`),
  ]);

  const sectorRows = await query(
    `SELECT DISTINCT sector_id AS id, sector_label AS label FROM verticals WHERE sector_id IS NOT NULL ORDER BY sector_id`,
  );
  const industryRows = await query(
    `SELECT DISTINCT industry_id AS id, industry_label AS label, sector_id FROM verticals WHERE industry_id IS NOT NULL ORDER BY industry_label`,
  );
  const visibleSectors = sectorRows.rows.filter((s) => sectorVisible(s.id));
  const visibleIndustries = industryRows.rows.filter((i) => sectorVisible(i.sector_id));
  const visibleVerticals = verticals.rows.filter((v) => sectorVisible(v.sector_id));

  const cohortBatches = loadCohortBatches();
  const batchList = explorerBatchFacets(
    classifiedCompanies ?? [],
    cohortBatches,
  );
  const phenotypeFamilies = [...new Set(phenotypes.rows.map((p) => p.family).filter(Boolean))].sort();

  return {
    cohort_batches: cohortBatches,
    batches: batchList,
    sectors: visibleSectors.map((s) => ({ id: s.id, label: s.label ?? s.id })),
    industries: visibleIndustries.map((i) => ({
      id: i.id,
      label: i.label ?? i.id,
      sector_id: i.sector_id,
    })),
    businessModels: businessModels.rows.map((b) => ({
      id: b.id,
      label: b.label,
      definition: b.label,
    })),
    phenotypeFamilies,
    phenotypes: phenotypes.rows.map((p) => ({ id: p.id, label: p.label, family: p.family })),
    verticals: visibleVerticals.map((v) => ({
      id: v.id,
      label: v.label,
      sector_id: v.sector_id,
      industry_id: v.industry_id,
      industry_label: v.industry_label,
      sector_label: v.sector_label,
    })),
  };
}

export async function fetchAssignmentsForBundle() {
  const { rows } = await query(
    `${COMPANY_SELECT} ORDER BY c.slug`,
  );
  return rows.map(rowToCompany);
}

export async function fetchBmVerticalMatrix() {
  const { rows } = await query(`
    SELECT cbm.business_model_code AS business_model, bm.label AS business_model_label,
           cc.vertical_id, cc.vertical_label, cc.vertical_sector_id AS sector_id,
           array_agg(c.slug ORDER BY c.slug) AS slugs
    FROM companies c
    INNER JOIN company_classifications cc ON cc.company_slug = c.slug
    INNER JOIN company_business_models cbm ON cbm.company_slug = c.slug
    LEFT JOIN business_models bm ON bm.code = cbm.business_model_code
    WHERE cc.vertical_id IS NOT NULL AND c.is_stub = false
    GROUP BY cbm.business_model_code, bm.label, cc.vertical_id, cc.vertical_label, cc.vertical_sector_id
  `);

  const bm_vertical = {};
  for (const cell of rows) {
    const key = `${cell.business_model}|${cell.vertical_id}`;
    bm_vertical[key] = {
      count: cell.slugs?.length ?? 0,
      slugs: cell.slugs ?? [],
      business_model_label: cell.business_model_label,
      vertical_label: cell.vertical_label,
      sector_id: cell.sector_id,
    };
  }
  return bm_vertical;
}

export async function fetchPhenotypeIndustryMatrix() {
  const { rows } = await query(`
    SELECT cc.phenotype_primary_id AS phenotype_id, cc.phenotype_primary_label AS phenotype_label,
           cc.industry_sub_vertical, array_agg(c.slug ORDER BY c.slug) AS slugs
    FROM companies c
    INNER JOIN company_classifications cc ON cc.company_slug = c.slug
    WHERE cc.phenotype_primary_id IS NOT NULL AND cc.industry_sub_vertical IS NOT NULL
      AND c.is_stub = false
    GROUP BY cc.phenotype_primary_id, cc.phenotype_primary_label, cc.industry_sub_vertical
  `);

  const phenotype_industry = {};
  for (const cell of rows) {
    const key = `${cell.phenotype_id}|${cell.industry_sub_vertical}`;
    phenotype_industry[key] = {
      count: cell.slugs?.length ?? 0,
      slugs: cell.slugs ?? [],
      phenotype_label: cell.phenotype_label,
      industry_sub_vertical: cell.industry_sub_vertical,
    };
  }
  return phenotype_industry;
}

export async function fetchGapCellKeys() {
  const excluded = [...EXCLUDED_SECTOR_IDS];
  const { rows } = await query(
    `SELECT DISTINCT gc.business_model, gc.vertical_id
     FROM gap_cells gc
     INNER JOIN verticals v ON v.id = gc.vertical_id
     WHERE gc.business_model IS NOT NULL AND gc.vertical_id IS NOT NULL
       AND (v.sector_id IS NULL OR NOT (v.sector_id = ANY($1::text[])))`,
    [excluded],
  );
  return rows.map((g) => `${g.business_model}|${g.vertical_id}`);
}

export async function fetchOntologies() {
  const [phenotypes, verticals] = await Promise.all([
    query(`SELECT id, label, family, value_wedge, ai_application, description FROM phenotypes ORDER BY id`),
    query(
      `SELECT id, label, sector_id, sector_label, industry_id, industry_label, workflow FROM verticals ORDER BY id`,
    ),
  ]);
  const visible = verticals.rows.filter((v) => sectorVisible(v.sector_id));
  return {
    phenotypes: phenotypes.rows,
    verticals: visible,
    sectors: [
      ...new Map(
        visible.filter((v) => v.sector_id).map((v) => [v.sector_id, { id: v.sector_id, label: v.sector_label ?? v.sector_id }]),
      ).values(),
    ],
    industries: [
      ...new Map(
        visible
          .filter((v) => v.industry_id)
          .map((v) => [v.industry_id, { id: v.industry_id, label: v.industry_label ?? v.industry_id, sector_id: v.sector_id }]),
      ).values(),
    ],
  };
}
