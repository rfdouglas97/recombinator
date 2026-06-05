/**
 * Build phenotype assignment records without regex archetype overrides.
 */

import { asSingleBusinessModels } from './phenotype-to-bm.mjs';

export function buildPhenotypeAssignment(company, raw, pheno) {
  const phenotypeId = raw.phenotype_primary_id;
  const business_models = asSingleBusinessModels(raw.business_models, phenotypeId);

  return {
    slug: company.slug,
    name: company.name,
    website: company.website,
    yc_profile_url:
      company.yc_url ?? company.yc_profile_url ?? `https://www.ycombinator.com/companies/${company.slug}`,
    batch: company.batch,
    one_liner: company.description?.one_liner ?? company.one_liner,
    description_combined: company.description?.combined ?? company.description_combined ?? company.long_description,
    industry_sub_vertical: raw.industry_sub_vertical,
    phenotype_primary_id: phenotypeId,
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
    classified_at: raw.classified_at ?? new Date().toISOString(),
    method: raw.method ?? 'openai',
    yc_industries: company.yc_industries ?? [],
    yc_tags: company.yc_tags ?? [],
    business_models,
    primary_bm: business_models[0],
  };
}
