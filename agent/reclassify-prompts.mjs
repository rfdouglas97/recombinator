import { BM_LABELS } from '../taxonomy/phenotype-to-bm.mjs';
import { ARCHETYPE_DISAMBIGUATION_PROMPT } from '../taxonomy/infer-archetype.mjs';

export function reclassifySystemPrompt(phenotypeCatalog) {
  const bmList = Object.entries(BM_LABELS)
    .map(([id, label]) => `${id}: ${label}`)
    .join('\n');

  return `You are correcting a startup taxonomy classification based on QA audit feedback.

Fix the classification so it accurately reflects what the company sells, who pays, and which workflow/industry niche they serve.

Phenotype catalog (use ONLY these ids — do not invent new phenotype ids):
${phenotypeCatalog}

Business models (for reference — assigned server-side from phenotype; do not return business_models):
${bmList}

Rules:
1. phenotype_primary_id = business archetype (horizontal copilot vs vertical workflow agent vs agent infra vs biotech etc.)
2. industry_sub_vertical = specific niche (e.g. "Healthcare revenue cycle", "Agent runtime optimization") — NOT "B2B" or generic sector name
3. vertical_id = MUST be exactly one id from vertical_candidates in the user message
4. horizontal-copilot-saas: cross-industry productivity, NOT industry-specific workflow automation
5. vertical-workflow-agent: end-to-end automation of one industry's job function
6. Address every audit issue listed in audit_feedback

${ARCHETYPE_DISAMBIGUATION_PROMPT}

Return ONLY valid JSON with EXACTLY these keys:
{
  "slug": "company-slug",
  "industry_sub_vertical": "specific niche",
  "vertical_id": "id-from-vertical_candidates",
  "phenotype_primary_id": "existing-id",
  "phenotype_secondary_id": null,
  "phenotype_primary_label": "human label",
  "value_wedge": "string",
  "ai_application": "string",
  "ai_application_patterns": ["tag1", "tag2"],
  "what_they_sell": "...",
  "ai_play": "...",
  "who_pays": "...",
  "confidence": 0.0,
  "rationale": "...",
  "proposed_phenotype": null
}`;
}

export function reclassifyUserPrompt({ company, audit, verticalCandidates }) {
  return JSON.stringify(
    {
      task: 'Re-classify this company fixing audit issues',
      company: {
        slug: company.slug,
        name: company.name,
        one_liner: company.one_liner,
        description: (company.description_combined ?? company.one_liner ?? '').slice(0, 4000),
        yc_industries: company.yc_industries,
        yc_tags: company.yc_tags,
      },
      prior_classification: {
        phenotype_primary_id: company.phenotype_primary_id,
        industry_sub_vertical: company.industry_sub_vertical,
        vertical_id: company.vertical_id ?? company.canonical_vertical_id ?? null,
        business_models: company.business_models ?? [],
      },
      audit_feedback: {
        verdict: audit.verdict,
        issues: audit.issues ?? [],
        rationale: audit.rationale,
        suggested_phenotype_primary_id: audit.suggested_phenotype_primary_id,
        suggested_vertical_id: audit.suggested_vertical_id,
        suggested_industry_sub_vertical: audit.suggested_industry_sub_vertical,
      },
      vertical_candidates: verticalCandidates.map((v) => ({
        id: v.id,
        label: v.label,
        workflow: v.workflow ?? null,
        sector_label: v.sector_label ?? null,
      })),
    },
    null,
    2,
  );
}
