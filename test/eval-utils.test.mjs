import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeText,
  tokenSet,
  jaccard,
  assignmentCell,
  redactForTrainPrompt,
} from '../scripts/eval-utils.mjs';

test('normalizeText lowercases, strips punctuation, and collapses whitespace', () => {
  assert.equal(normalizeText('Hello,   World!'), 'hello world');
  assert.equal(normalizeText('  AI-powered   B2B/SaaS  '), 'ai-powered b2b/saas');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

test('tokenSet keeps only tokens longer than two characters', () => {
  const tokens = tokenSet('AI is a powerful tool');
  assert.ok(tokens.has('powerful'));
  assert.ok(tokens.has('tool'));
  assert.ok(!tokens.has('ai'));
  assert.ok(!tokens.has('is'));
  assert.ok(!tokens.has('a'));
});

test('jaccard returns 1 for identical text and 0 for disjoint text', () => {
  assert.equal(jaccard('payments infrastructure', 'payments infrastructure'), 1);
  assert.equal(jaccard('healthcare scheduling', 'rocket propulsion systems'), 0);
});

test('jaccard is between 0 and 1 for partial overlap', () => {
  const score = jaccard('clinical workflow automation', 'clinical billing automation');
  assert.ok(score > 0 && score < 1, `expected partial overlap, got ${score}`);
});

test('jaccard returns 0 when either side has no qualifying tokens', () => {
  assert.equal(jaccard('', 'anything here'), 0);
  assert.equal(jaccard('a b c', 'meaningful tokens present'), 0);
});

test('assignmentCell extracts the primary cell when all parts are present', () => {
  const cell = assignmentCell({
    business_models: ['BM-03', 'BM-07'],
    vertical_id: 'healthcare.clinical-ops',
    phenotype_primary_id: 'vertical-workflow-agent',
  });
  assert.deepEqual(cell, {
    business_model: 'BM-03',
    vertical_id: 'healthcare.clinical-ops',
    phenotype_primary_id: 'vertical-workflow-agent',
  });
});

test('assignmentCell returns null when any component is missing', () => {
  assert.equal(assignmentCell({ vertical_id: 'v', phenotype_primary_id: 'p' }), null);
  assert.equal(assignmentCell({ business_models: ['BM-01'], phenotype_primary_id: 'p' }), null);
  assert.equal(assignmentCell({ business_models: [], vertical_id: 'v' }), null);
});

test('redactForTrainPrompt keeps only the allowlisted fields and truncates ai_play', () => {
  const redacted = redactForTrainPrompt({
    slug: 'acme',
    name: 'Acme',
    one_liner: 'short',
    industry_sub_vertical: 'fintech',
    what_they_sell: 'software',
    who_pays: 'CFO',
    ai_play: 'x'.repeat(400),
    secret_internal_field: 'should not leak',
  });
  assert.deepEqual(Object.keys(redacted).sort(), [
    'ai_play',
    'industry_sub_vertical',
    'name',
    'one_liner',
    'slug',
    'what_they_sell',
    'who_pays',
  ]);
  assert.ok(!('secret_internal_field' in redacted));
  assert.equal(redacted.ai_play.length, 200);
});
