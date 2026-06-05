#!/usr/bin/env node
/**
 * Normalize phenotype assignments to canonical vertical IDs and preview BM × vertical matrix.
 *
 * Usage:
 *   node normalize-verticals.mjs                    # report on current assignments
 *   node normalize-verticals.mjs --write            # write normalized assignments + matrix
 *   node normalize-verticals.mjs --gaps             # show empty BM × vertical cells (high-fit)
 *   node normalize-verticals.mjs --list-verticals     # dump canonical vertical catalog
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  loadVerticalOntology,
  normalizeVertical,
  inferPredictionMarketsVertical,
  inferPropertyCasualtyInsuranceVertical,
  resolveSlugVerticalOverride,
  emitVerticalsJson,
  summarizeOntology,
  getVerticalById,
} from './taxonomy/verticals.mjs';
import { STALE_EXPLICIT_VERTICALS } from './taxonomy/verticals-data.mjs';
import { BM_LABELS, asSingleBusinessModels, primaryBmForPhenotype } from './taxonomy/phenotype-to-bm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const PATHS = {
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  classified: join(ROOT, 'output/yc_companies_classified.json'),
  companies: join(ROOT, 'output/yc_companies.json'),
  outAssignments: join(ROOT, 'output/verticals/normalized-assignments.json'),
  outMatrix: join(ROOT, 'output/verticals/bm-vertical-matrix.json'),
  outGaps: join(ROOT, 'output/verticals/gap-candidates.json'),
  outReport: join(ROOT, 'output/verticals/normalization-report.json'),
  fitPriority: join(ROOT, 'whitespace/fit-priority.json'),
};

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    gaps: argv.includes('--gaps'),
    listVerticals: argv.includes('--list-verticals'),
    emitJson: argv.includes('--emit-json'),
    minConfidence: parseFloat(argv.find((a, i) => argv[i - 1] === '--min-confidence') ?? '0.45'),
  };
}

function loadAssignments() {
  if (!existsSync(PATHS.assignments)) return [];
  const raw = JSON.parse(readFileSync(PATHS.assignments, 'utf8'));
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function loadHeuristicBm() {
  if (!existsSync(PATHS.classified)) return new Map();
  const data = JSON.parse(readFileSync(PATHS.classified, 'utf8'));
  const companies = data.companies ?? data;
  const map = new Map();
  for (const c of companies) {
    const code =
      c.taxonomy?.business_model_primary ??
      c.taxonomy?.business_model?.code ??
      c.taxonomy?.business_model;
    if (code) map.set(c.slug, code);
  }
  return map;
}

function resolveBusinessModels(assignment, heuristicBm) {
  if (assignment.business_models?.length) {
    return asSingleBusinessModels(assignment.business_models, assignment.phenotype_primary_id);
  }

  const fromHeuristic = heuristicBm.get(assignment.slug);
  if (fromHeuristic) return [fromHeuristic];

  return [primaryBmForPhenotype(assignment.phenotype_primary_id)];
}

function isLlmCanonicalVertical(assignment) {
  return (
    assignment.vertical_method === 'llm_vertical' ||
    assignment.method === 'llm_vertical' ||
    Boolean(assignment.vertical_classified_at)
  );
}

function explicitVerticalMethod(assignment) {
  if (assignment.vertical_method === 'llm_vertical' || assignment.method === 'llm_vertical') {
    return 'llm_vertical';
  }
  if (assignment.method === 'reclassify_haiku') return 'reclassify_explicit';
  return 'assignment_explicit';
}

function resolveVerticalNorm(assignment, ontology, minConfidence) {
  const slugOverride = resolveSlugVerticalOverride(assignment.slug);
  if (slugOverride?.vertical_id) {
    const vert = getVerticalById(slugOverride.vertical_id, ontology);
    if (vert) return { ...slugOverride, vertical: vert };
  }

  const explicit = assignment.canonical_vertical_id ?? assignment.vertical_id;
  const llmCanonical = isLlmCanonicalVertical(assignment) && explicit;
  const staleExplicit = explicit && STALE_EXPLICIT_VERTICALS.has(explicit) && !llmCanonical;

  if (llmCanonical && !staleExplicit) {
    const vert = getVerticalById(explicit, ontology);
    if (vert) {
      const conf = assignment.vertical_classify_confidence ?? 1;
      return {
        vertical_id: vert.id,
        vertical: vert,
        confidence: conf,
        method: 'llm_vertical',
      };
    }
  }

  if (explicit && !staleExplicit) {
    const vert = getVerticalById(explicit, ontology);
    if (vert) {
      return {
        vertical_id: vert.id,
        vertical: vert,
        confidence: 1,
        method: explicitVerticalMethod(assignment),
      };
    }
  }

  const pc = inferPropertyCasualtyInsuranceVertical({
    industry_sub_vertical: assignment.industry_sub_vertical,
    one_liner: assignment.one_liner,
    description_combined: assignment.description_combined,
  });
  if (pc?.vertical_id) {
    const vert = getVerticalById(pc.vertical_id, ontology);
    if (vert) return { ...pc, vertical: vert };
  }

  const pm = inferPredictionMarketsVertical({
    slug: assignment.slug,
    industry_sub_vertical: assignment.industry_sub_vertical,
    one_liner: assignment.one_liner,
    description_combined: assignment.description_combined,
  });
  if (pm?.vertical_id) {
    const vert = getVerticalById(pm.vertical_id, ontology);
    if (vert) return { ...pm, vertical: vert };
  }

  return normalizeVertical(
    {
      industry_sub_vertical: assignment.industry_sub_vertical,
      yc_industries: assignment.yc_industries,
      slug: assignment.slug,
      one_liner: assignment.one_liner,
      description_combined: assignment.description_combined,
    },
    ontology,
  );
}

function normalizeAll(assignments, ontology, minConfidence) {
  const results = [];
  const stats = { exact: 0, substring: 0, token: 0, yc: 0, unmapped: 0, explicit: 0 };

  for (const a of assignments) {
    const norm = resolveVerticalNorm(a, ontology, minConfidence);

    if (
      norm.method === 'assignment_explicit' ||
      norm.method === 'reclassify_explicit' ||
      norm.method === 'llm_vertical'
    ) {
      stats.explicit++;
    } else if (norm.method?.startsWith('prediction_markets')) stats.explicit++;
    else if (norm.method === 'alias_exact') stats.exact++;
    else if (norm.method === 'alias_substring') stats.substring++;
    else if (norm.method === 'token_overlap') stats.token++;
    else if (norm.method.startsWith('yc_')) stats.yc++;
    else stats.unmapped++;

    results.push({
      slug: a.slug,
      name: a.name,
      raw_vertical: a.industry_sub_vertical,
      vertical_id: norm.confidence >= minConfidence ? norm.vertical_id : null,
      vertical_label: norm.vertical?.label ?? null,
      sector_id: norm.vertical?.sector_id ?? null,
      normalize_confidence: norm.confidence,
      normalize_method: norm.method,
      phenotype_primary_id: a.phenotype_primary_id,
      yc_industries: a.yc_industries,
    });
  }

  return { results, stats };
}

function buildObservedMatrix(normalized, assignments, heuristicBm) {
  const assignmentBySlug = Object.fromEntries(assignments.map((a) => [a.slug, a]));
  const cells = new Map();

  for (const row of normalized) {
    if (!row.vertical_id) continue;
    const a = assignmentBySlug[row.slug];
    const bms = resolveBusinessModels(a ?? row, heuristicBm);
    for (const bm of bms) {
      const key = `${bm}::${row.vertical_id}`;
      if (!cells.has(key)) {
        cells.set(key, {
          business_model: bm,
          business_model_label: BM_LABELS[bm] ?? bm,
          vertical_id: row.vertical_id,
          vertical_label: row.vertical_label,
          sector_id: row.sector_id,
          companies: [],
        });
      }
      cells.get(key).companies.push(row.slug);
    }
  }

  return [...cells.values()].sort(
    (a, b) => b.companies.length - a.companies.length || a.vertical_id.localeCompare(b.vertical_id),
  );
}

function loadFitPriorityBySector() {
  if (!existsSync(PATHS.fitPriority)) {
    return { default: ['BM-01', 'BM-02'], by_sector: {} };
  }
  const doc = JSON.parse(readFileSync(PATHS.fitPriority, 'utf8'));
  return { default: doc.default ?? ['BM-01', 'BM-02'], by_sector: doc.by_sector ?? {} };
}

function buildGapCandidates(ontology, observedCells) {
  const occupied = new Set(observedCells.map((c) => `${c.business_model}::${c.vertical_id}`));
  const fitPriority = loadFitPriorityBySector();

  const gaps = [];
  for (const v of ontology.verticals) {
    const bms = fitPriority.by_sector[v.sector_id] ?? fitPriority.default;
    for (const bm of bms) {
      const key = `${bm}::${v.id}`;
      if (!occupied.has(key)) {
        gaps.push({
          business_model: bm,
          business_model_label: BM_LABELS[bm],
          vertical_id: v.id,
          vertical_label: v.label,
          sector_id: v.sector_id,
          sector_label: v.sector_label,
          industry_label: v.industry_label,
          workflow: v.workflow ?? null,
        });
      }
    }
  }

  return gaps;
}

function printReport(normalized, stats, ontology, observedCells) {
  const mapped = normalized.filter((r) => r.vertical_id);
  const unmapped = normalized.filter((r) => !r.vertical_id);

  console.log('\n=== Vertical normalization report ===');
  console.log(`Ontology: ${summarizeOntology(ontology).verticals} canonical verticals`);
  console.log(`Assignments: ${normalized.length}`);
  console.log(`Mapped: ${mapped.length} | Unmapped: ${unmapped.length}`);
  console.log(
    `Methods: explicit=${stats.explicit} exact=${stats.exact} substring=${stats.substring} token=${stats.token} yc_fallback=${stats.yc} unmapped=${stats.unmapped}`,
  );

  console.log('\n--- Sample mappings ---');
  for (const r of mapped.slice(0, 8)) {
    console.log(`  ${r.slug}: "${r.raw_vertical}" → ${r.vertical_id} (${r.normalize_method})`);
  }

  if (unmapped.length) {
    console.log('\n--- Unmapped (need alias or review) ---');
    for (const r of unmapped) {
      console.log(`  ${r.slug}: "${r.raw_vertical}" [${(r.yc_industries ?? []).join(' > ')}]`);
    }
  }

  console.log(`\nObserved BM × vertical cells: ${observedCells.length}`);
  if (observedCells.length) {
    console.log('Top clusters:');
    for (const c of observedCells.slice(0, 6)) {
      console.log(`  ${c.business_model} × ${c.vertical_label}: ${c.companies.length} (${c.companies.join(', ')})`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);

  if (args.emitJson) {
    const doc = emitVerticalsJson();
    console.log(`Emitted taxonomy/verticals.json (${doc.counts.verticals} verticals)`);
    return;
  }

  const ontology = loadVerticalOntology();

  if (args.listVerticals) {
    for (const v of ontology.verticals) {
      console.log(`${v.id}\t${v.label}\t[${v.sector_label}]`);
    }
    console.log(`\nTotal: ${ontology.verticals.length}`);
    return;
  }

  const assignments = loadAssignments();
  if (!assignments.length) {
    console.error('No assignments found at', PATHS.assignments);
    process.exit(1);
  }

  const heuristicBm = loadHeuristicBm();
  const { results: normalized, stats } = normalizeAll(assignments, ontology, args.minConfidence);
  const observedCells = buildObservedMatrix(normalized, assignments, heuristicBm);
  const gaps = buildGapCandidates(ontology, observedCells);

  printReport(normalized, stats, ontology, observedCells);

  if (args.gaps) {
    console.log(`\n=== Gap candidates (empty BM × vertical, high structural fit) ===`);
    console.log(`Total empty high-fit cells: ${gaps.length}`);
    for (const g of gaps.slice(0, 20)) {
      console.log(`  ${g.business_model_label} × ${g.vertical_label} (${g.sector_label})`);
    }
    if (gaps.length > 20) console.log(`  ... and ${gaps.length - 20} more`);
  }

  if (args.write) {
    mkdirSync(join(ROOT, 'output/verticals'), { recursive: true });

    const enriched = assignments.map((a) => {
      const n = normalized.find((r) => r.slug === a.slug);
      const business_models = resolveBusinessModels(a, heuristicBm);
      return {
        ...a,
        vertical_id: n?.vertical_id ?? null,
        vertical_label: n?.vertical_label ?? null,
        vertical_sector_id: n?.sector_id ?? null,
        vertical_normalize_confidence: n?.normalize_confidence ?? 0,
        vertical_normalize_method: n?.normalize_method ?? 'unmapped',
        business_models,
        primary_bm: business_models[0],
      };
    });

    writeFileSync(PATHS.outAssignments, JSON.stringify(enriched, null, 2));
    writeFileSync(
      PATHS.outMatrix,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          dimensions: { row: 'business_model', column: 'vertical_id' },
          summary: {
            assignment_count: enriched.length,
            mapped_verticals: new Set(enriched.map((e) => e.vertical_id).filter(Boolean)).size,
            observed_cells: observedCells.length,
            total_verticals: ontology.verticals.length,
            gap_candidates: gaps.length,
          },
          observed_cells: observedCells,
        },
        null,
        2,
      ),
    );
    writeFileSync(
      PATHS.outGaps,
      JSON.stringify({ generated_at: new Date().toISOString(), gap_count: gaps.length, gaps }, null, 2),
    );
    writeFileSync(
      PATHS.outReport,
      JSON.stringify({ generated_at: new Date().toISOString(), stats, normalized, unmapped: normalized.filter((r) => !r.vertical_id) }, null, 2),
    );

    console.log(`\nWrote:\n  ${PATHS.outAssignments}\n  ${PATHS.outMatrix}\n  ${PATHS.outGaps}\n  ${PATHS.outReport}`);
  }
}

main();
