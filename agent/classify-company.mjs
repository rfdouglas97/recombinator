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
import { refineArchetype } from '../taxonomy/infer-archetype.mjs';
import { PHENOTYPE_TO_BM } from '../taxonomy/phenotype-to-bm.mjs';
import { loadVerticalOntology, getVerticalById, resolveSlugVerticalOverride } from '../taxonomy/verticals.mjs';
import { verticalCandidatesForCompany } from './vertical-candidates.mjs';
import { classifyOne, resolveVerticalClassifyApiConfig } from './classify-verticals.mjs';

loadDotEnv();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONTOLOGY_PATH = join(ROOT, 'output/phenotypes/ontology.json');
const SEEDS_PATH = join(ROOT, 'taxonomy/phenotype-seeds.json');

function enrichPhenotypeAssignment(company, raw, ontology) {
  const pheno = findPhenotype(ontology, raw.phenotype_primary_id);
  return refineArchetype({
    slug: company.slug,
    name: company.name,
    website: company.website,
    yc_profile_url: company.yc_url
      ? `https://www.ycombinator.com/companies/${company.slug}`
      : company.yc_profile_url,
    batch: company.batch,
    one_liner: company.description?.one_liner ?? company.one_liner,
    description_combined: company.description?.combined ?? company.long_description,
    industry_sub_vertical: raw.industry_sub_vertical,
    phenotype_primary_id: raw.phenotype_primary_id,
    phenotype_secondary_id: raw.phenotype_secondary_id ?? null,
    phenotype_primary_label: raw.phenotype_primary_label ?? pheno?.label,
    phenotype_family: pheno?.family ?? null,
    value_wedge: raw.value_wedge ?? pheno?.value_wedge,
    ai_application: raw.ai_application ?? pheno?.ai_application,
    ai_application_patterns: raw.ai_application_patterns ?? [],
    what_they_sell: raw.what_they_sell,
    ai_play: raw.ai_play,
    who_pays: raw.who_pays,
    confidence: raw.confidence,
    rationale: raw.rationale,
    proposed_phenotype: raw.proposed_phenotype ?? null,
    classified_at: new Date().toISOString(),
    method: raw.method ?? 'launch_phenotype_agent',
    yc_industries: company.yc_industries ?? [],
    yc_tags: company.yc_tags ?? [],
    business_models:
      raw.business_models?.length > 0
        ? raw.business_models
        : (PHENOTYPE_TO_BM[raw.phenotype_primary_id] ?? ['BM-02']).slice(0, 1),
  });
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
      'ANTHROPIC_API_KEY or OPENAI_API_KEY required for launch ingest (set in .env or GitHub Actions secrets)',
    );
  }

  let rawPhenotype;
  try {
    rawPhenotype = await classifyPhenotypeWithLlm(company, phenotypeOntology, apiConfig);
  } catch (err) {
    rawPhenotype = classifyLocal(company, phenotypeOntology);
    rawPhenotype.rationale = `${rawPhenotype.rationale ?? ''} (phenotype LLM failed: ${err.message})`.trim();
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
  record.business_models =
    record.business_models?.length > 0
      ? record.business_models
      : (PHENOTYPE_TO_BM[record.phenotype_primary_id] ?? ['BM-02']).slice(0, 1);

  return record;
}
