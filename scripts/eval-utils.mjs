import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadVerticalOntology } from '../taxonomy/verticals.mjs';
import {
  BM_LABELS,
  PHENOTYPE_TO_BM,
  phenotypeAllowedForBm,
  cellKey,
} from '../taxonomy/phenotype-to-bm.mjs';
import { refineArchetypeBatch } from '../taxonomy/infer-archetype.mjs';

import { cachedByFiles } from './data-cache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const EVAL_PATHS = {
  normalized: join(ROOT, 'output/verticals/normalized-assignments.json'),
  companies: join(ROOT, 'output/yc_companies.json'),
  ontology: join(ROOT, 'output/phenotypes/ontology.json'),
  taxonomy: join(ROOT, 'taxonomy/v0.1.json'),
  gaps: join(ROOT, 'output/verticals/gap-candidates.json'),
  trainSlugs: join(ROOT, 'output/eval/train-slugs.json'),
  holdoutSlugs: join(ROOT, 'output/eval/holdout-slugs.json'),
  holdoutManifest: join(ROOT, 'output/eval/holdout-manifest.json'),
  splitMeta: join(ROOT, 'output/eval/split-meta.json'),
  syntheticDir: join(ROOT, 'output/synthetic'),
  holdoutResults: join(ROOT, 'output/eval/holdout-results.json'),
};

export { BM_LABELS, PHENOTYPE_TO_BM, phenotypeAllowedForBm, cellKey };

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadNormalizedAssignments() {
  return cachedByFiles('normalized-assignments', [EVAL_PATHS.normalized], () => {
    if (!existsSync(EVAL_PATHS.normalized)) return [];
    const raw = loadJson(EVAL_PATHS.normalized);
    const rows = Array.isArray(raw) ? raw : Object.values(raw);
    return refineArchetypeBatch(rows);
  });
}

export function loadPhenotypeOntology() {
  return cachedByFiles('phenotype-ontology', [EVAL_PATHS.ontology], () =>
    loadJson(EVAL_PATHS.ontology)
  );
}

export function loadTaxonomyV01() {
  return cachedByFiles('taxonomy-v01', [EVAL_PATHS.taxonomy], () => loadJson(EVAL_PATHS.taxonomy));
}

export function getPhenotypeById(id, ontology = loadPhenotypeOntology()) {
  return ontology.phenotypes.find((p) => p.id === id) ?? null;
}

export function getVerticalById(id, ontology = loadVerticalOntology()) {
  return ontology.verticals.find((v) => v.id === id) ?? null;
}

export function getBmDefinition(code, taxonomy = loadTaxonomyV01()) {
  return taxonomy.business_models[code] ?? null;
}

/** Primary cell for a normalized assignment record */
export function assignmentCell(record) {
  const bm = record.business_models?.[0];
  const verticalId = record.vertical_id;
  const phenotypeId = record.phenotype_primary_id;
  if (!bm || !verticalId || !phenotypeId) return null;
  return { business_model: bm, vertical_id: verticalId, phenotype_primary_id: phenotypeId };
}

export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\w\s/>&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenSet(s) {
  return new Set(
    normalizeText(s)
      .split(' ')
      .filter((t) => t.length > 2)
  );
}

export function jaccard(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function redactForTrainPrompt(record) {
  return {
    slug: record.slug,
    name: record.name,
    one_liner: record.one_liner,
    industry_sub_vertical: record.industry_sub_vertical,
    what_they_sell: record.what_they_sell,
    who_pays: record.who_pays,
    ai_play: record.ai_play?.slice(0, 200),
  };
}

export const SYNTHETIC_REQUIRED_FIELDS = [
  'synthetic_id',
  'target_cell',
  'name',
  'one_liner',
  'long_description',
  'industry_sub_vertical',
  'phenotype_primary_id',
  'what_they_sell',
  'ai_play',
  'who_pays',
  'ai_application_patterns',
  'delivery',
  'buyer',
  'yc_industries_hypothesis',
  'generation_rationale',
];

export function validateSyntheticRecord(record, { verticalOntology, trainOneLiners = [] } = {}) {
  const errors = [];

  for (const field of SYNTHETIC_REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  const cell = record.target_cell;
  if (!cell?.business_model || !cell?.vertical_id || !cell?.phenotype_primary_id) {
    errors.push('target_cell must include business_model, vertical_id, phenotype_primary_id');
  } else {
    if (record.phenotype_primary_id !== cell.phenotype_primary_id) {
      errors.push('phenotype_primary_id must match target_cell.phenotype_primary_id');
    }
    if (!phenotypeAllowedForBm(cell.phenotype_primary_id, cell.business_model)) {
      errors.push(
        `phenotype ${cell.phenotype_primary_id} not allowed for ${cell.business_model} (see PHENOTYPE_TO_BM)`
      );
    }
    const vertical = getVerticalById(cell.vertical_id, verticalOntology);
    if (!vertical) errors.push(`unknown vertical_id: ${cell.vertical_id}`);
  }

  if (record.one_liner && record.one_liner.split(/\s+/).length > 14) {
    errors.push('one_liner should be ≤12 words (soft limit 14)');
  }

  for (const trainLine of trainOneLiners) {
    if (jaccard(record.one_liner, trainLine) > 0.85) {
      errors.push('one_liner too similar to train exemplar (Jaccard > 0.85)');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Schema + taxonomy + business-thesis validation (used by generator). */
export async function validateSyntheticFull(record, opts = {}) {
  const schema = validateSyntheticRecord(record, opts);
  const { validateBusinessThesis, getIdeaContextForCell } =
    await import('./idea-primitives-lib.mjs');
  const cell = record.target_cell;
  const ideaContext =
    opts.ideaContext ??
    (cell ? getIdeaContextForCell(cell, { assignments: opts.assignments }) : null);
  const thesis = validateBusinessThesis(record, {
    verticalOntology: opts.verticalOntology,
    ideaContext,
    cell,
  });
  const errors = [...schema.errors, ...thesis.errors];
  return { valid: errors.length === 0, errors, idea_context: thesis.idea_context };
}
