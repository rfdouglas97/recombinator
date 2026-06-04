export function expansionSystemPrompt() {
  return `You are a venture market analyst building a CANONICAL VERTICAL TAXONOMY for startup gap analysis.

A "vertical" is an industry-specific WORKFLOW slice where a B2B or regulated startup could sell software or services.
It is NOT a technology ("AI agents"), NOT a company name, NOT a generic horizontal tool unless the buyer/workflow is industry-specific.

Rules:
1. Each proposal must name a specific BUYER role who would pay for software (budget owner).
2. Each proposal must describe a distinct OPERATIONAL WORKFLOW (credentialing, claims, scheduling, compliance filing, etc.).
3. IDs must be kebab-case segments: {industry_prefix}.{workflow_slug} — e.g. healthcare.provider.prior-auth under industry healthcare.provider.
4. Do NOT duplicate any vertical already listed in existing_verticals (same meaning or overlapping workflow).
5. Prefer 12–18 proposals per industry batch — exhaustive but not redundant.
6. Skip absurdly narrow niches (single city, single company) and overly broad labels ("Healthcare software").
7. Include 1–3 aliases per vertical (alternative phrasings).
8. regulatory: list applicable regs if any (HIPAA, SOX, FDA, etc.) or empty array.

Return ONLY valid JSON:
{
  "industry_id": "exact industry id from prompt",
  "proposals": [
    {
      "id": "industry_prefix.workflow_slug",
      "label": "Human-readable vertical name",
      "workflow": "snake_case_workflow_tag",
      "buyers": ["Role 1", "Role 2"],
      "regulatory": ["REG1"],
      "aliases": ["Alt phrasing"],
      "typical_software_categories": ["Category"],
      "rationale": "Why this is a distinct vertical vs neighbors"
    }
  ],
  "notes": "Optional gaps or overlaps noticed"
}`;
}

export function expansionUserPrompt({ sector, industry, existingVerticals, ycHints }) {
  return JSON.stringify(
    {
      task: 'Propose new workflow-level vertical leaves for this industry',
      sector: { id: sector.id, label: sector.label },
      industry: { id: industry.id, label: industry.label },
      id_prefix_hint: industry.id.split('.').slice(-1)[0] ?? industry.id,
      existing_verticals_in_industry: existingVerticals.map((v) => ({
        id: v.id,
        label: v.label,
        workflow: v.workflow,
      })),
      yc_subindustry_hints: ycHints,
      examples_of_good_verticals: [
        {
          id: 'healthcare.provider.credentialing',
          label: 'Provider credentialing & payer enrollment',
          buyers: ['RCM director', 'Medical group administrator'],
        },
        {
          id: 'fintech.insurance.claims-auto',
          label: 'Auto collision claims & subrogation',
          buyers: ['Claims adjuster', 'Subrogation manager'],
        },
      ],
    },
    null,
    2,
  );
}

export function expansionReflectionSystemPrompt() {
  return `You review LLM-generated vertical taxonomy proposals for duplicates and quality.

Find:
1. duplicate_clusters — groups of proposals that mean the same workflow (suggest keep_id)
2. granularity_issues — too broad or too narrow ids
3. missing_workflows — 3–5 important workflows still missing for this sector

Return ONLY valid JSON:
{
  "duplicate_clusters": [{"keep_id": "...", "merge_ids": ["..."], "reason": "..."}],
  "granularity_issues": [{"id": "...", "issue": "too_broad|too_narrow", "suggestion": "..."}],
  "missing_workflows": [{"suggested_id": "...", "label": "...", "industry_id": "...", "reason": "..."}],
  "notes": "string"
}`;
}

export function expansionReflectionUserPrompt(sector, proposals) {
  return JSON.stringify(
    {
      sector: { id: sector.id, label: sector.label },
      proposal_count: proposals.length,
      proposals: proposals.map((p) => ({
        id: p.id,
        label: p.label,
        industry_id: p.industry_id,
        workflow: p.workflow,
      })),
    },
    null,
    2,
  ).slice(0, 14000);
}
