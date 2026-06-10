import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeGoodnessIndex, GOODNESS_WEIGHTS } from '../scripts/goodness-rubric.mjs';

test('GOODNESS_WEIGHTS form a normalized distribution', () => {
  const sum = Object.values(GOODNESS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights should sum to 1, got ${sum}`);
});

test('computeGoodnessIndex returns a well-formed, bounded result', () => {
  const result = computeGoodnessIndex({
    one_liner: 'Automates prior authorization for outpatient clinics',
    what_they_sell: 'Workflow software for clinical billing teams',
    who_pays: 'revenue cycle manager',
    why_good_idea: {
      pain: 'Staff manually fax prior-auth requests for hours each day.',
      urgency: 'Payer rules changed in 2025, raising denial rates.',
      ai_wedge: 'Agent reads payer policies and drafts submissions automatically.',
      buyer_budget: 'Revenue cycle teams already budget for denial-management tools.',
      proof_from_batch: 'Similar batch analog automates claims for dental practices.',
    },
  });

  assert.equal(typeof result.overall, 'number');
  assert.ok(result.overall >= 0 && result.overall <= 100);
  assert.ok(['strong', 'acceptable', 'weak'].includes(result.band));
  assert.deepEqual(Object.keys(result.dimensions).sort(), [
    'ai_wedge',
    'buyer_budget',
    'sharpness',
    'transfer_proof',
    'urgency',
    'workflow_pain',
  ]);
  assert.equal(typeof result.pass, 'boolean');
});

test('computeGoodnessIndex penalizes buzzword one-liners on the blocklist', () => {
  const result = computeGoodnessIndex({
    one_liner: 'We revolutionize industries with a cutting-edge platform',
  });
  assert.ok(result.blocklist_hit, 'expected a blocklist hit');
  assert.ok(result.overall <= 45, `blocked ideas are capped at 45, got ${result.overall}`);
  assert.equal(result.band, 'weak');
  assert.equal(result.pass, false);
});
