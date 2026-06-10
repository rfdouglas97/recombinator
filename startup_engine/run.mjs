#!/usr/bin/env node
/**
 * Startup Engine — pick interesting whitespace → generate YC company ideas.
 *
 * Usage:
 *   npm run startup-engine
 *   npm run startup-engine -- --top 3
 *   npm run startup-engine -- pick --top 10
 *   npm run startup-engine -- generate --shortlist startup_engine/output/shortlist-....json
 *   node startup_engine/run.mjs --dry-run
 */

import { existsSync } from 'fs';

import {
  pickInterestingWhitespace,
  writeShortlist,
  loadShortlistFile,
} from './pick-whitespace.mjs';
import { generateIdeasForShortlist, writeIdeas } from './generate-ideas.mjs';

function parseArgs(argv) {
  const args = {
    command: 'run',
    top: 5,
    k: 1,
    minOpportunity: 38,
    minDepth: 3,
    sector: '',
    concurrency: 3,
    shortlistPath: '',
    dryRun: false,
    pickOnly: false,
    generateOnly: false,
  };

  let i = 2;
  if (argv[i] === 'pick') {
    args.command = 'pick';
    i++;
  } else if (argv[i] === 'generate') {
    args.command = 'generate';
    i++;
  } else if (argv[i] === 'run') {
    i++;
  }

  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--pick-only') args.pickOnly = true;
    else if (a === '--generate-only') args.generateOnly = true;
    else if (a === '--top' && argv[i + 1]) args.top = parseInt(argv[++i], 10);
    else if (a === '--k' && argv[i + 1]) args.k = parseInt(argv[++i], 10);
    else if (a === '--min-opportunity' && argv[i + 1])
      args.minOpportunity = parseInt(argv[++i], 10);
    else if (a === '--min-depth' && argv[i + 1]) args.minDepth = parseInt(argv[++i], 10);
    else if (a === '--sector' && argv[i + 1]) args.sector = argv[++i];
    else if (a === '--concurrency' && argv[i + 1]) args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--shortlist' && argv[i + 1]) args.shortlistPath = argv[++i];
    else if (a === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (args.command === 'generate' || args.generateOnly) {
    args.pickOnly = false;
  }
  if (args.command === 'pick' || args.pickOnly) {
    args.generateOnly = args.command === 'pick';
  }

  return args;
}

function printHelp() {
  console.log(`Startup Engine — whitespace → company ideas

Commands:
  run       Pick whitespace + generate ideas (default)
  pick      Pick whitespace only → startup_engine/output/shortlist-*.json
  generate  Generate from existing shortlist JSON

Options:
  --top <n>              Gaps to pick (default: 5)
  --k <n>                Ideas per gap (default: 1)
  --min-opportunity <n>  Min opportunity_score (default: 38)
  --min-depth <n>        Min vertical depth (default: 3)
  --sector <id>          Filter sector, e.g. healthcare-life-sciences
  --concurrency <n>      Parallel LLM calls (default: 3)
  --shortlist <path>     Use this shortlist (generate / generate-only)
  --dry-run              Pick only, print shortlist, no LLM
  --pick-only            Same as: pick
  --generate-only        Skip pick; requires --shortlist

Examples:
  npm run startup-engine
  npm run startup-engine -- --top 3 --k 2
  npm run startup-engine -- pick --top 10
  npm run startup-engine -- generate --shortlist startup_engine/output/shortlist-....json

Prerequisites:
  npm run startup-engine:refresh   # refresh ranked gaps + idea primitives
`);
}

function printShortlist(pickResult) {
  console.log(`\n=== Step 1: Picked ${pickResult.shortlist.length} whitespace gaps ===\n`);
  for (const g of pickResult.shortlist) {
    console.log(
      `  #${g.rank} [${g.analog_match_tier ?? '?'} analog] ${g.business_model_label} × ${g.vertical_label}`
    );
    console.log(
      `       opp ${g.opportunity_score} · transfer ${g.transfer_score} · ${g.sector_label}${g.workflow ? ` · ${g.workflow}` : ''}`
    );
    console.log(`       cell: ${g.business_model}:${g.vertical_id}:${g.phenotype_primary_id}`);
    if (g.analog_slugs?.length) console.log(`       analogs: ${g.analog_slugs.join(', ')}`);
    console.log('');
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const pickOpts = {
    top: args.top,
    minOpportunity: args.minOpportunity,
    minDepth: args.minDepth,
    sector: args.sector,
  };

  let pickResult;
  let shortlistPath = args.shortlistPath;

  if (args.command === 'generate' || args.generateOnly) {
    if (!shortlistPath) {
      console.error('--shortlist required for generate');
      process.exit(1);
    }
    if (!existsSync(shortlistPath)) {
      console.error(`Shortlist not found: ${shortlistPath}`);
      process.exit(1);
    }
    pickResult = { shortlist: loadShortlistFile(shortlistPath), filters: pickOpts };
    printShortlist({ shortlist: pickResult.shortlist });
  } else {
    console.log('Startup Engine');
    console.log('  1. Pick interesting whitespace');
    pickResult = pickInterestingWhitespace(pickOpts);
    printShortlist(pickResult);

    shortlistPath = writeShortlist(pickResult);
    console.log(`  → shortlist: ${shortlistPath}`);

    if (args.dryRun || args.pickOnly || args.command === 'pick') {
      console.log('\nPick complete (no LLM).');
      return;
    }
  }

  console.log(
    `\n=== Step 2: Generating ${pickResult.shortlist.length * args.k} company idea(s) ===\n`
  );

  const ideasResult = await generateIdeasForShortlist(pickResult.shortlist, {
    k: args.k,
    concurrency: args.concurrency,
    onProgress: ({ done, total, status, gap, name, goodness, band, error }) => {
      if (status === 'ok') {
        console.log(`  [${done}/${total}] ✓ ${name} (${band} ${goodness}) — ${gap.vertical_label}`);
      } else {
        console.log(`  [${done}/${total}] ✗ ${gap.vertical_id}: ${error}`);
      }
    },
  });

  const { libraryPath, ideasPath } = writeIdeas(ideasResult, pickResult);
  console.log(`\n=== Done ===`);
  console.log(`  Ideas: ${ideasResult.stats.succeeded}/${ideasResult.stats.requested} succeeded`);
  console.log(`  → ${ideasPath}`);
  console.log(`  → ${libraryPath} (${ideasResult.stats.succeeded} cards, sorted by goodness)`);

  for (const idea of ideasResult.ideas) {
    console.log(`\n  • ${idea.name} — ${idea.one_liner}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
