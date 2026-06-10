export function classifyVerticalsSystemPrompt() {
  return `You classify YC startups into exactly one canonical workflow vertical from a provided shortlist.

Rules:
1. vertical_id MUST be exactly one id from vertical_candidates — never invent ids.
2. industry_sub_vertical = specific buyer + workflow niche (e.g. "Prediction markets prime brokerage", "CPG brand data layer for AI agents") — NOT generic labels like "Operations", "B2B", or "Infrastructure".
3. Pick the leaf that best matches what they SELL and WHO PAYS, using phenotype as context for product shape only.
4. Do not confuse adjacent categories (e.g. health payer claims vs property insurance claims; logistics vs generic enterprise ops; behavioral health practice vs cross-industry ops tools).
5. If none fit well, pick the closest leaf and lower confidence below 0.7.

Return ONLY valid JSON:
{
  "slug": "company-slug",
  "vertical_id": "id-from-vertical_candidates",
  "industry_sub_vertical": "specific niche string",
  "confidence": 0.0,
  "rationale": "one or two sentences"
}`;
}

export function classifyVerticalsUserPrompt({ company, verticalCandidates }) {
  return JSON.stringify(
    {
      task: 'Assign canonical vertical_id and industry_sub_vertical',
      company: {
        slug: company.slug,
        name: company.name,
        one_liner: company.one_liner,
        description: (company.description_combined ?? company.one_liner ?? '').slice(0, 4500),
        yc_industries: company.yc_industries ?? [],
        yc_tags: company.yc_tags ?? [],
      },
      phenotype_context: {
        phenotype_primary_id: company.phenotype_primary_id ?? null,
        phenotype_primary_label: company.phenotype_primary_label ?? null,
        what_they_sell: company.what_they_sell ?? null,
        who_pays: company.who_pays ?? null,
      },
      prior_vertical: company.vertical_id ?? company.canonical_vertical_id ?? null,
      prior_industry_sub_vertical: company.industry_sub_vertical ?? null,
      vertical_candidates: verticalCandidates.map((v) => ({
        id: v.id,
        label: v.label,
        industry_label: v.industry_label ?? null,
        sector_label: v.sector_label ?? null,
        workflow: v.workflow ?? null,
      })),
    },
    null,
    2
  );
}
