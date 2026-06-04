#!/usr/bin/env node
/**
 * Rank whitespace gaps and write output/whitespace/*.json
 *
 * Usage:
 *   node whitespace/build.mjs
 *   node whitespace/build.mjs --sector healthcare-life-sciences
 *   node whitespace/build.mjs --min-opportunity 55 --top 30
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import { OUTPUT_DIR, OUTPUT_PATHS } from './lib/paths.mjs';
import { rankAllGaps, buildSectorSummary } from './lib/rank-gaps.mjs';

function parseArgs(argv) {
  const opts = {
    write: true,
    top: 50,
    minOpportunity: null,
    sectorId: '',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--top' && argv[i + 1]) opts.top = Number(argv[++i]);
    else if (a === '--sector' && argv[i + 1]) opts.sectorId = argv[++i];
    else if (a === '--min-opportunity' && argv[i + 1]) opts.minOpportunity = Number(argv[++i]);
    else if (a === '--no-write') opts.write = false;
  }
  return opts;
}

function main() {
  const cli = parseArgs(process.argv);

  const full = rankAllGaps({});
  const filtered =
    cli.minOpportunity != null || cli.sectorId
      ? rankAllGaps({
          minOpportunity: cli.minOpportunity ?? undefined,
          sectorId: cli.sectorId || undefined,
        })
      : full;

  const rankedDoc = {
    generated_at: new Date().toISOString(),
    gap_count: full.gap_count,
    ranked_count: full.ranked_count,
    rejected_count: full.rejected_count,
    filters_applied: {
      min_opportunity: cli.minOpportunity,
      sector_id: cli.sectorId || null,
    },
    gaps: filtered.gaps,
  };

  const summaryDoc = {
    generated_at: rankedDoc.generated_at,
    ...buildSectorSummary(full.gaps, cli.top),
  };

  const rejectedDoc = {
    generated_at: rankedDoc.generated_at,
    rejected_count: full.rejected.length,
    gaps: full.rejected,
  };

  if (!cli.write) {
    console.log(JSON.stringify(rankedDoc, null, 2));
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATHS.ranked, JSON.stringify(rankedDoc, null, 2));
  writeFileSync(OUTPUT_PATHS.sectorSummary, JSON.stringify(summaryDoc, null, 2));
  writeFileSync(OUTPUT_PATHS.rejected, JSON.stringify(rejectedDoc, null, 2));

  console.log('Whitespace opportunity ranking complete');
  console.log(`  Gaps total:     ${full.gap_count}`);
  console.log(`  Ranked:         ${full.ranked_count}`);
  console.log(`  Kill-rejected:  ${full.rejected_count}`);
  console.log(`  Checksum:       ${full.ranked_count + full.rejected_count} (expect ${full.gap_count})`);
  console.log(`  Top opportunity: ${full.gaps[0]?.opportunity_score ?? '—'} — ${full.gaps[0]?.vertical_label ?? ''}`);
  console.log(`  Wrote: ${OUTPUT_PATHS.ranked}`);
}

main();
