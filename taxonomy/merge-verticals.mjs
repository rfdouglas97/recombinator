import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { VERTICALS, SECTORS, INDUSTRIES } from './verticals-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  proposals: join(ROOT, 'output/verticals/expansion-proposals.json'),
  approved: join(ROOT, 'output/verticals/expansion-approved.json'),
  mergeReport: join(ROOT, 'output/verticals/merge-report.json'),
};

function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\w\s/>&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s) {
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

function loadProposals() {
  if (!existsSync(PATHS.proposals)) return [];
  const raw = JSON.parse(readFileSync(PATHS.proposals, 'utf8'));
  return raw.proposals ?? raw;
}

function validateProposal(p, industryById) {
  const issues = [];
  if (!p.id || !p.label || !p.industry_id) {
    issues.push('missing_required_fields');
  }
  if (p.industry_id && !industryById[p.industry_id]) {
    issues.push('unknown_industry_id');
  }
  if (p.id && !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(p.id)) {
    issues.push('invalid_id_format');
  }
  if (!Array.isArray(p.buyers) || p.buyers.length === 0) {
    issues.push('missing_buyers');
  }
  return issues;
}

/**
 * Dedupe LLM proposals against seed verticals + each other.
 * @returns {{ approved: object[], rejected: object[], stats: object }}
 */
export function mergeProposals(proposals = loadProposals(), seedVerticals = VERTICALS) {
  const industryById = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));
  const sectorById = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

  const existingIds = new Set(seedVerticals.map((v) => v.id));
  const existingLabels = seedVerticals.flatMap((v) => [v.label, ...(v.aliases ?? [])]);

  const approved = [];
  const rejected = [];
  const approvedIds = new Set();
  const approvedLabels = [];

  for (const raw of proposals) {
    const p = {
      ...raw,
      source: raw.source ?? 'llm_expansion',
      expanded_at: raw.expanded_at ?? null,
    };

    const issues = validateProposal(p, industryById);
    if (issues.length) {
      rejected.push({ ...p, status: 'rejected', reject_reason: issues.join(', ') });
      continue;
    }

    if (existingIds.has(p.id) || approvedIds.has(p.id)) {
      rejected.push({ ...p, status: 'duplicate_id', reject_reason: 'id_collision' });
      continue;
    }

    let labelDup = null;
    for (const label of [p.label, ...(p.aliases ?? [])]) {
      for (const existing of [...existingLabels, ...approvedLabels]) {
        if (jaccard(label, existing) >= 0.72) {
          labelDup = existing;
          break;
        }
      }
      if (labelDup) break;
    }
    if (labelDup) {
      rejected.push({ ...p, status: 'duplicate_label', reject_reason: `similar_to:${labelDup}` });
      continue;
    }

    const industry = industryById[p.industry_id];
    const sector = industry ? sectorById[industry.sector_id] : null;

    const entry = {
      id: p.id,
      label: p.label,
      industry_id: p.industry_id,
      workflow: p.workflow ?? null,
      buyers: p.buyers ?? [],
      regulatory: p.regulatory ?? [],
      aliases: p.aliases ?? [],
      yc_subindustry: p.yc_subindustry ?? [],
      naics_hint: p.naics_hint ?? [],
      typical_software_categories: p.typical_software_categories ?? [],
      rationale: p.rationale ?? null,
      source: p.source,
      expanded_at: p.expanded_at,
      sector_id: sector?.id ?? null,
      sector_label: sector?.label ?? null,
      industry_label: industry?.label ?? null,
      status: 'approved',
    };

    approved.push(entry);
    approvedIds.add(p.id);
    approvedLabels.push(p.label, ...(p.aliases ?? []));
  }

  const stats = {
    input: proposals.length,
    approved: approved.length,
    rejected: rejected.length,
    seed_count: seedVerticals.length,
    total_after_merge: seedVerticals.length + approved.length,
    by_reject_reason: rejected.reduce((acc, r) => {
      const key = r.status ?? r.reject_reason ?? 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };

  return { approved, rejected, stats };
}

export function writeMergeOutputs(result) {
  mkdirSync(dirname(PATHS.approved), { recursive: true });
  writeFileSync(
    PATHS.approved,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        stats: result.stats,
        verticals: result.approved,
      },
      null,
      2
    )
  );
  writeFileSync(
    PATHS.mergeReport,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        stats: result.stats,
        rejected: result.rejected,
      },
      null,
      2
    )
  );
  return PATHS;
}

export function loadApprovedExpansion() {
  if (!existsSync(PATHS.approved)) return [];
  const data = JSON.parse(readFileSync(PATHS.approved, 'utf8'));
  return data.verticals ?? [];
}

if (process.argv[1]?.endsWith('merge-verticals.mjs')) {
  const proposals = loadProposals();
  if (!proposals.length) {
    console.error('No proposals at', PATHS.proposals);
    process.exit(1);
  }
  const result = mergeProposals(proposals);
  const paths = writeMergeOutputs(result);
  console.log('Merge complete:', result.stats);
  console.log('  Approved:', paths.approved);
  console.log('  Report:  ', paths.mergeReport);
}
