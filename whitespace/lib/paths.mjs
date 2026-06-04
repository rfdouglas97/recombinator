import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const WHITESPACE_ROOT = join(ROOT, 'whitespace');
export const OUTPUT_DIR = join(ROOT, 'output/whitespace');

export const INPUT_PATHS = {
  gaps: join(ROOT, 'output/verticals/gap-candidates.json'),
  matrix: join(ROOT, 'output/verticals/bm-vertical-matrix.json'),
  assignments: join(ROOT, 'output/verticals/normalized-assignments.json'),
  ideaPrimitives: join(ROOT, 'output/generator/idea-primitives.json'),
  phenotypeOntology: join(ROOT, 'output/phenotypes/ontology.json'),
};

export const OUTPUT_PATHS = {
  ranked: join(OUTPUT_DIR, 'gap-opportunity-ranked.json'),
  sectorSummary: join(OUTPUT_DIR, 'sector-summary.json'),
  rejected: join(OUTPUT_DIR, 'rejected-kill-list.json'),
};
