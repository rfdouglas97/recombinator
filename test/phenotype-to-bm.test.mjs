import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PHENOTYPE_TO_BM, BM_LABELS } from '../taxonomy/phenotype-to-bm.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ONTOLOGY_PATH = join(ROOT, 'output/phenotypes/ontology.json');

// Every phenotype in the ontology must have an explicit BM mapping.
// Without one, primaryBmForPhenotype silently defaults to BM-02, which
// mislabeled 181 companies (42% of Summer 2026) before this guard existed.
test('every ontology phenotype has a PHENOTYPE_TO_BM entry', () => {
  assert.ok(existsSync(ONTOLOGY_PATH), 'ontology.json should be committed');
  const ontology = JSON.parse(readFileSync(ONTOLOGY_PATH, 'utf8'));
  const unmapped = ontology.phenotypes.map((p) => p.id).filter((id) => !PHENOTYPE_TO_BM[id]);
  assert.deepEqual(
    unmapped,
    [],
    `Unmapped phenotypes (add to taxonomy/phenotype-to-bm.mjs): ${unmapped.join(', ')}`
  );
});

test('every mapped BM code exists in BM_LABELS', () => {
  const badCodes = Object.entries(PHENOTYPE_TO_BM).flatMap(([id, codes]) =>
    codes.filter((c) => !BM_LABELS[c]).map((c) => `${id} → ${c}`)
  );
  assert.deepEqual(badCodes, []);
});

test('every mapping is a non-empty array', () => {
  for (const [id, codes] of Object.entries(PHENOTYPE_TO_BM)) {
    assert.ok(Array.isArray(codes) && codes.length > 0, `${id} mapping must be non-empty`);
  }
});
