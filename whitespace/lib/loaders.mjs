import { readFileSync, existsSync } from 'fs';

import { loadVerticalOntology } from '../../taxonomy/verticals.mjs';
import { refineArchetypeBatch } from '../../taxonomy/infer-archetype.mjs';
import { INPUT_PATHS, WHITESPACE_ROOT } from './paths.mjs';
import { join } from 'path';

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadGaps() {
  const doc = readJson(INPUT_PATHS.gaps, { gaps: [] });
  return doc.gaps ?? [];
}

export function loadObservedCells() {
  const doc = readJson(INPUT_PATHS.matrix, { observed_cells: [] });
  return doc.observed_cells ?? [];
}

export function loadAssignments() {
  const raw = readJson(INPUT_PATHS.assignments, []);
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  return refineArchetypeBatch(rows);
}

export function loadPhenotypeOntology() {
  return readJson(INPUT_PATHS.phenotypeOntology, { phenotypes: [] });
}

export function loadFitPriority() {
  return readJson(join(WHITESPACE_ROOT, 'fit-priority.json'), {
    default: ['BM-01', 'BM-02'],
    by_sector: {},
  });
}

export function loadKillList() {
  return readJson(join(WHITESPACE_ROOT, 'kill-list.json'), {
    sector_block: [],
    vertical_prefix_block: [],
    business_model_block: [],
    rules: [],
  });
}

export { loadVerticalOntology };
