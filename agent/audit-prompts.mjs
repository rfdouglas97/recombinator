import { BM_LABELS } from '../taxonomy/phenotype-to-bm.mjs';
import { ARCHETYPE_DISAMBIGUATION_PROMPT } from '../taxonomy/infer-archetype.mjs';

export function auditSystemPrompt(phenotypeCatalog) {
  const bmList = Object.entries(BM_LABELS)
    .map(([id, label]) => `${id}: ${label}`)
    .join('\n');

  return `You are a QA auditor for startup taxonomy classifications.

Each company has:
- phenotype_primary_id: WHAT kind of business (archetype) — separate from industry
- industry_sub_vertical: free-text niche (where + workflow)
- vertical_id: canonical industry×workflow leaf (may be wrong if mapped via YC category fallback)
- business_models: BM codes derived from phenotype

Business models:
${bmList}

Phenotype catalog (use ONLY these ids unless clearly none fit):
${phenotypeCatalog}

Audit rules:
1. Read the company description — classifications must match what they actually sell and who pays.
2. horizontal-copilot-saas (BM-02): cross-industry seat/productivity tools NOT tied to one industry's workflow.
3. vertical-workflow-agent (BM-01/BM-04): end-to-end automation of a specific industry job function.
4. agent-* / training-data phenotypes (BM-03/BM-06): sell to builders, infra, or data — not vertical ops unless clearly secondary.
5. industry_sub_vertical must be a specific niche, not "B2B" or generic "Healthcare software".
6. vertical_id must match the workflow in industry_sub_vertical; flag if current vertical is a generic YC-category fallback.
7. business_models must be compatible with phenotype (see mapping hints in user payload).
8. YC tag "Fintech" or "Financial Services" is NOT sufficient — read the product description.
9. Common mis-tags to flag as wrong or minor_fix:
   - Perps / exchange / self-custodial trading (e.g. Mochatrade) → marketplace-network-ai (BM-07), NOT fintech-insurance-ai-product.
   - Private-market liquidity / investor matching infra (e.g. Alt-X) → vertical-workflow-agent or marketplace-network-ai, NOT insurance/fintech SKU.
   - B2B diligence/valuation software sold to funds → vertical-workflow-agent (BM-01), NOT fintech-insurance-ai-product.
   - fintech-insurance-ai-product requires AI as core wedge; trading apps with no AI in copy → marketplace-network-ai or vertical-workflow-agent.

${ARCHETYPE_DISAMBIGUATION_PROMPT}

Verdicts:
- ok: current classification is accurate (>=85% match)
- minor_fix: mostly right; one field could be improved (suggest exact id from catalogs)
- wrong: primary phenotype or vertical is materially incorrect

Return ONLY valid JSON:
{
  "slug": "company-slug",
  "verdict": "ok|minor_fix|wrong",
  "severity": 1,
  "issues": [{"field": "phenotype_primary_id|vertical_id|industry_sub_vertical|business_models", "problem": "short", "suggested": "value or null"}],
  "suggested_phenotype_primary_id": "id-or-null",
  "suggested_vertical_id": "id-from-candidates-or-null",
  "suggested_industry_sub_vertical": "string-or-null",
  "suggested_business_models": ["BM-01"],
  "rationale": "1-3 sentences"
}
severity: 1=ok, 2=minor_fix, 3=wrong`;
}

export function auditUserPrompt({ company, verticalCandidates, heuristicBm, allowedBms }) {
  return JSON.stringify(
    {
      company: {
        slug: company.slug,
        name: company.name,
        one_liner: company.one_liner,
        description: (company.description_combined ?? company.one_liner ?? '').slice(0, 3500),
        yc_industries: company.yc_industries,
        yc_tags: company.yc_tags,
      },
      current_classification: {
        phenotype_primary_id: company.phenotype_primary_id,
        phenotype_primary_label: company.phenotype_primary_label,
        phenotype_family: company.phenotype_family,
        phenotype_secondary_id: company.phenotype_secondary_id ?? null,
        phenotype_confidence: company.confidence ?? null,
        industry_sub_vertical: company.industry_sub_vertical,
        vertical_id: company.vertical_id ?? null,
        vertical_label: company.vertical_label ?? null,
        vertical_normalize_method: company.vertical_normalize_method ?? null,
        vertical_normalize_confidence: company.vertical_normalize_confidence ?? null,
        business_models: company.business_models ?? [],
      },
      reference: {
        heuristic_business_model: heuristicBm ?? null,
        phenotype_allowed_business_models: allowedBms ?? [],
      },
      vertical_candidates: verticalCandidates.map((v) => ({
        id: v.id,
        label: v.label,
        workflow: v.workflow ?? null,
      })),
    },
    null,
    2,
  );
}

export function compactPhenotypeCatalog(phenotypes) {
  return phenotypes.map((p) => `- ${p.id}: ${p.label} [${p.family}]`).join('\n');
}
