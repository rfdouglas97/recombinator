import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_PATH = join(ROOT, 'explorer/public/data.bundle.json');

// The committed explorer bundle is what Vercel serves and what the daily
// workflow refreshes. These checks guard its shape so a malformed rebuild
// is caught before it ships.
test('explorer data bundle has the expected top-level shape', () => {
  assert.ok(existsSync(BUNDLE_PATH), 'data.bundle.json should be committed');
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

  for (const key of ['generated_at', 'meta', 'facets', 'trees', 'companies', 'matrices']) {
    assert.ok(key in bundle, `bundle missing top-level key: ${key}`);
  }
});

test('bundle meta reports non-trivial counts', () => {
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));
  assert.ok(bundle.meta.assignment_count > 0, 'assignment_count should be positive');
  assert.ok(bundle.meta.vertical_count > 0, 'vertical_count should be positive');
  assert.ok(Array.isArray(bundle.meta.cohort_batches) && bundle.meta.cohort_batches.length > 0);
});

test('facets and matrices are populated and internally consistent', () => {
  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

  assert.ok(Array.isArray(bundle.facets.verticals) && bundle.facets.verticals.length > 0);
  const vertical = bundle.facets.verticals[0];
  assert.ok(vertical.id && vertical.label, 'each vertical needs an id and label');
  assert.equal(bundle.facets.verticals.length, bundle.meta.vertical_count);

  for (const key of ['bm_vertical', 'bm_vertical_gaps', 'phenotype_industry']) {
    assert.ok(key in bundle.matrices, `matrices missing key: ${key}`);
  }

  const companyCount = Object.keys(bundle.companies).length;
  assert.ok(companyCount > 0, 'bundle should include companies');
});
