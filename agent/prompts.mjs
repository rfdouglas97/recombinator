import { ARCHETYPE_DISAMBIGUATION_PROMPT } from '../taxonomy/infer-archetype.mjs';

export function companySystemPrompt(ontologySummary) {
  return `You are a venture analyst building a PHENOTYPE ontology for YC startups.

Phenotypes describe WHAT KIND OF BUSINESS they are pursuing — separate from industry.
Industry answers "where"; phenotype answers "what archetype" (e.g. agent evals, training data, vertical workflow agent, domain ontology).

Existing phenotype library:
${ontologySummary}

Rules:
1. Prefer an existing phenotype id when it clearly fits (>=70% match).
2. Only propose a NEW phenotype if none fit; use kebab-case id, clear label, family, value_wedge, ai_application, description.
3. industry_sub_vertical: specific niche (e.g. "Healthcare revenue cycle", "Auto body insurance", "Property management") — NOT just "B2B".
4. ai_application_patterns: 2-4 short snake_case tags (e.g. agent_tooling, rag, underwriting_automation).
5. Be specific in what_they_sell and ai_play — how AI changes the offering.

${ARCHETYPE_DISAMBIGUATION_PROMPT}

Return ONLY valid JSON with EXACTLY these keys (all required):
{
  "slug": "company-slug",
  "industry_sub_vertical": "specific niche",
  "phenotype_primary_id": "existing-id-from-library",
  "phenotype_secondary_id": null,
  "phenotype_primary_label": "human label",
  "value_wedge": "from library or proposed",
  "ai_application": "from library or proposed",
  "ai_application_patterns": ["tag1", "tag2"],
  "what_they_sell": "...",
  "ai_play": "...",
  "who_pays": "...",
  "confidence": 0.0,
  "rationale": "...",
  "proposed_phenotype": null
}
phenotype_primary_id MUST be an id from the library unless you include proposed_phenotype.`;
}

export const COMPANY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    industry_sub_vertical: { type: 'string' },
    phenotype_primary_id: { type: 'string' },
    phenotype_secondary_id: { type: ['string', 'null'] },
    phenotype_primary_label: { type: 'string' },
    value_wedge: { type: 'string' },
    ai_application: { type: 'string' },
    ai_application_patterns: { type: 'array', items: { type: 'string' } },
    what_they_sell: { type: 'string' },
    ai_play: { type: 'string' },
    who_pays: { type: 'string' },
    confidence: { type: 'number' },
    rationale: { type: 'string' },
    proposed_phenotype: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        family: { type: 'string' },
        value_wedge: { type: 'string' },
        ai_application: { type: 'string' },
        description: { type: 'string' },
      },
    },
  },
  required: [
    'slug',
    'industry_sub_vertical',
    'phenotype_primary_id',
    'phenotype_primary_label',
    'value_wedge',
    'ai_application',
    'ai_application_patterns',
    'what_they_sell',
    'ai_play',
    'who_pays',
    'confidence',
    'rationale',
  ],
};

export function companyUserPrompt(company) {
  const desc = company.description?.combined ?? company.description?.one_liner ?? '';
  return JSON.stringify(
    {
      name: company.name,
      slug: company.slug,
      website: company.website,
      batch: company.batch,
      location: company.location,
      yc_industries: company.yc_industries,
      yc_tags: company.yc_tags,
      prior_taxonomy: company.taxonomy,
      description: desc.slice(0, 4000),
      founders_summary: (company.founders ?? [])
        .map((f) => `${f.full_name} (${f.title})`)
        .join('; '),
    },
    null,
    2
  );
}

export function reflectionSystemPrompt() {
  return `You consolidate startup phenotype assignments into a cleaner ontology.

Given recent company assignments and any proposed phenotypes:
1. Merge duplicate or overlapping proposed phenotypes (suggest merges, do not delete existing ids).
2. List 3-5 emerging PATTERNS (cross-industry business model themes) you see.
3. Suggest at most 2 new phenotype definitions only if a clear cluster is missing.

Return ONLY valid JSON:
{
  "patterns_observed": [{"name": "...", "description": "...", "example_slugs": ["..."]}],
  "merge_suggestions": [{"from_ids": ["..."], "into_id": "...", "reason": "..."}],
  "new_phenotypes": [{"id","label","family","value_wedge","ai_application","description"}],
  "notes": "string"
}`;
}

export function reflectionUserPrompt(recentAssignments, pendingProposals) {
  return JSON.stringify({ recentAssignments, pendingProposals }, null, 2).slice(0, 12000);
}
