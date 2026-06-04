#!/usr/bin/env node
/**
 * Write output/whitespace/top-prospects.md (v2 — sharp wedges only).
 */

import { readFileSync, writeFileSync } from 'fs';
import { OUTPUT_PATHS } from './lib/paths.mjs';
import { verticalDepth } from './lib/sharpness.mjs';

const TOP = Number(process.env.TOP ?? 40);
const PER_SECTOR = Number(process.env.PER_SECTOR ?? 5);
const MIN_DEPTH = Number(process.env.MIN_DEPTH ?? 3);
const MIN_OPPORTUNITY = Number(process.env.MIN_OPPORTUNITY ?? 45);
const REQUIRE_WORKFLOW_ANALOG = process.env.REQUIRE_WORKFLOW_ANALOG !== '0';

const ranked = JSON.parse(readFileSync(OUTPUT_PATHS.ranked, 'utf8'));
const summary = JSON.parse(readFileSync(OUTPUT_PATHS.sectorSummary, 'utf8'));
const rejected = JSON.parse(
  readFileSync(OUTPUT_PATHS.rejected, 'utf8'),
);

function prospectFilter(g) {
  if (verticalDepth(g.vertical_id) < MIN_DEPTH) return false;
  if (g.opportunity_score < MIN_OPPORTUNITY) return false;
  if (REQUIRE_WORKFLOW_ANALOG && !(g.workflow_matched_analog_slugs?.length > 0)) {
    return false;
  }
  if (g.flags?.includes('catalog_bucket') || g.flags?.includes('generic_label')) {
    return false;
  }
  return true;
}

const prospects = ranked.gaps.filter(prospectFilter).slice(0, TOP);
const catalogRejected = rejected.gaps.filter(
  (g) => g.kill_reason?.includes('catalog') || g.flags?.includes('catalog_bucket'),
).length;

function fmtGap(g) {
  const flags = (g.flags ?? []).join(', ') || '—';
  const analogs =
    (g.workflow_matched_analog_slugs ?? []).slice(0, 3).join(', ') || '— (none — weak prospect)';
  const neighbors = (g.adjacent_cluster_slugs ?? []).slice(0, 5).join(', ') || '—';
  const cell = `${g.business_model_label} × \`${g.vertical_id}\``;
  const cmd = `node scripts/generate-synthetic.mjs --cell ${g.business_model}:${g.vertical_id}:${g.phenotype_primary_id}`;

  return [
    `### ${g.rank}. ${g.vertical_label}`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Rank** | ${g.rank} (global) |`,
    `| **Cell** | ${cell} |`,
    `| **Depth** | ${g.vertical_depth ?? verticalDepth(g.vertical_id)} |`,
    `| **Sector** | ${g.sector_label} |`,
    `| **Workflow** | ${g.workflow ?? '—'} |`,
    `| **Phenotype** | \`${g.phenotype_primary_id}\` |`,
    `| **Opportunity** | ${g.opportunity_score} (v2) |`,
    `| **Transfer** | ${g.transfer_score} (${g.transfer_band}) |`,
    `| **Scores** | analog ${g.scores.analog_strength}, specificity ${g.scores.specificity}, adjacency ${g.scores.adjacency}${g.scores.saturation_penalty ? `, sat. penalty −${g.scores.saturation_penalty}` : ''} |`,
    `| **Flags** | ${flags} |`,
    `| **Workflow-matched analogs** | ${analogs} |`,
    `| **Nearby YC slugs** | ${neighbors}${g.adjacency_mode ? ` (${g.adjacency_mode})` : ''} |`,
    '',
    '```bash',
    cmd,
    '```',
    '',
  ].join('\n');
}

const lines = [
  '# Top whitespace prospects (v2)',
  '',
  `Generated ${ranked.generated_at?.slice(0, 10) ?? 'today'} · ranking **v2** (catalog buckets excluded).`,
  '',
  '**Criteria for this list:**',
  `- Vertical depth ≥ **${MIN_DEPTH}** (leafier taxonomy nodes)`,
  `- \`opportunity_score\` ≥ **${MIN_OPPORTUNITY}**`,
  REQUIRE_WORKFLOW_ANALOG
    ? '- At least one **workflow-matched** YC analog (same `workflow` tag, not generic sector copycat)'
    : '',
  '- Excludes devtools/Kubernetes-style **catalog labels** and saturated parent clusters',
  '',
  `**Stats:** ${ranked.gap_count} gaps → ${ranked.ranked_count} ranked · ${ranked.rejected_count} rejected (${catalogRejected} catalog/kill) · **${prospects.length}** shown below`,
  '',
  '---',
  '',
  `## Top ${prospects.length} prospects`,
  '',
];

if (!prospects.length) {
  lines.push('_No gaps passed v2 filters. Try lowering MIN_OPPORTUNITY or REQUIRE_WORKFLOW_ANALOG=0._', '');
} else {
  prospects.forEach((g) => lines.push(fmtGap(g)));
}

lines.push('---', '', `## Top ${PER_SECTOR} per sector (v2 filters)`, '');

for (const s of summary.sectors) {
  const top = ranked.gaps.filter((g) => g.sector_id === s.sector_id).filter(prospectFilter).slice(0, PER_SECTOR);
  if (!top.length) continue;
  lines.push(`### ${s.sector_label}`, '');
  for (const g of top) {
    const analogs = (g.workflow_matched_analog_slugs ?? []).join(', ') || '—';
    lines.push(
      `- **#${g.rank}** ${g.business_model_label} × **${g.vertical_label}** — opp ${g.opportunity_score}, depth ${g.vertical_depth ?? verticalDepth(g.vertical_id)}, analogs: ${analogs}`,
    );
  }
  lines.push('');
}

lines.push('---', '', '## Refresh', '', '```bash', 'npm run whitespace:rank', '```', '');

const outPath = OUTPUT_PATHS.ranked.replace(
  'gap-opportunity-ranked.json',
  'top-prospects.md',
);
writeFileSync(outPath, lines.join('\n'));
console.log(`Wrote ${outPath} (${prospects.length} prospects)`);
