/**
 * Full LLM classification for launch-ingested companies (phenotype agent + vertical classifier).
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadDotEnv } from './env.mjs';
import { chatJson, resolveApiConfig } from './llm.mjs';
import { loadOntology, getOntologySummary, findPhenotype } from './ontology.mjs';
import { companySystemPrompt, companyUserPrompt } from './prompts.mjs';
import { normalizeLlmResult } from './normalize.mjs';
import { classifyLocal } from './local-classifier.mjs';
import { asSingleBusinessModels } from '../taxonomy/phenotype-to-bm.mjs';
import { buildPhenotypeAssignment } from '../taxonomy/assignment-record.mjs';
import {
  loadVerticalOntology,
  getVerticalById,
  resolveSlugVerticalOverride,
} from '../taxonomy/verticals.mjs';
import { verticalCandidatesForCompany } from './vertical-candidates.mjs';
import { classifyOne, resolveVerticalClassifyApiConfig } from './classify-verticals.mjs';

loadDotEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONTOLOGY_PATH = join(ROOT, 'output/phenotypes/ontology.json');
const SEEDS_PATH = join(ROOT, 'taxonomy/phenotype-seeds.json');

function enrichPhenotypeAssignment(company, raw, ontology) {
  const pheno = findPhenotype(ontology, raw.phenotype_primary_id);
  return buildPhenotypeAssignment(
    company,
    { ...raw, method: raw.method ?? 'launch_phenotype_agent' },
    pheno
  );
}

async function classifyPhenotypeWithLlm(company, ontology, apiConfig) {
  const system = companySystemPrompt(getOntologySummary(ontology));
  const user = companyUserPrompt(company);
  const result = normalizeLlmResult(await chatJson({ system, user, apiConfig }), ontology);
  result.method = 'launch_phenotype_agent';
  return result;
}

/**
 * Phenotype + vertical LLM pass for a launch-derived company record.
 * @param {object} company - from launchToCompanyRecord()
 * @param {{ hints?: string, phenotypeOntology?: object, verticalOntology?: object, maxCandidates?: number }} [opts]
 */
export async function classifyLaunchCompany(company, opts = {}) {
  const phenotypeOntology = opts.phenotypeOntology ?? loadOntology(ONTOLOGY_PATH, SEEDS_PATH);
  const verticalOntology = opts.verticalOntology ?? loadVerticalOntology();
  const hints = opts.hints ?? '';
  const maxCandidates = opts.maxCandidates ?? 40;

  const apiConfig = resolveVerticalClassifyApiConfig(resolveApiConfig());
  if (!apiConfig) {
    throw new Error(
      'ANTHROPIC_API_KEY or OPENAI_API_KEY required for launch ingest (set in .env or GitHub Actions secrets)'
    );
  }

  let rawPhenotype;
  try {
    rawPhenotype = await classifyPhenotypeWithLlm(company, phenotypeOntology, apiConfig);
  } catch (err) {
    rawPhenotype = classifyLocal(company, phenotypeOntology);
    rawPhenotype.rationale =
      `${rawPhenotype.rationale ?? ''} (phenotype LLM failed: ${err.message})`.trim();
    rawPhenotype.method = 'launch_phenotype_fallback';
  }

  let record = enrichPhenotypeAssignment(company, rawPhenotype, phenotypeOntology);

  const slugOverride = resolveSlugVerticalOverride(company.slug);
  if (slugOverride?.vertical_id) {
    const vert = getVerticalById(slugOverride.vertical_id, verticalOntology);
    if (vert) {
      record = {
        ...record,
        canonical_vertical_id: vert.id,
        vertical_id: vert.id,
        vertical_label: vert.label,
        vertical_sector_id: vert.sector_id,
        vertical_method: slugOverride.method,
        vertical_classify_confidence: slugOverride.confidence,
        vertical_classify_rationale: 'slug override',
        vertical_classified_at: new Date().toISOString(),
      };
      return record;
    }
  }

  record = await classifyOne(record, verticalOntology, apiConfig, maxCandidates, hints);
  record.method = 'launch_agent';
  record.business_models = asSingleBusinessModels(
    record.business_models,
    record.phenotype_primary_id
  );
  record.primary_bm = record.business_models[0];

  return record;
}
