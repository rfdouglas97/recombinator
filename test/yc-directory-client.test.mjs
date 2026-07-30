import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAlgoliaOpts,
  parseDataPage,
  normalizeAlgoliaHit,
  fetchCompanyDetailHttp,
} from '../scripts/yc-directory-client.mjs';

test('parseAlgoliaOpts extracts app and key from directory HTML', () => {
  const html = `<script>window.AlgoliaOpts = {"app":"45BWZJ1SGC","key":"Nzll=abc123"};</script>`;
  assert.deepEqual(parseAlgoliaOpts(html), { app: '45BWZJ1SGC', key: 'Nzll=abc123' });
});

test('parseAlgoliaOpts returns null when opts are absent or malformed', () => {
  assert.equal(parseAlgoliaOpts('<html><body>no opts here</body></html>'), null);
  assert.equal(parseAlgoliaOpts('window.AlgoliaOpts = {"app":"X"};'), null);
  assert.equal(parseAlgoliaOpts('window.AlgoliaOpts = {broken;'), null);
});

test('parseDataPage decodes HTML entities and parses the Inertia payload', () => {
  const payload = {
    props: { company: { name: 'A & B <Corp>', slug: 'a-b', founders: [{ full_name: 'Jo' }] } },
  };
  const encoded = JSON.stringify(payload)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<div id="app" data-page="${encoded}"></div>`;
  const parsed = parseDataPage(html);
  assert.equal(parsed.props.company.name, 'A & B <Corp>');
  assert.equal(parsed.props.company.slug, 'a-b');
});

test('parseDataPage returns null when attribute is missing or invalid', () => {
  assert.equal(parseDataPage('<div id="app"></div>'), null);
  assert.equal(parseDataPage('<div data-page="not json"></div>'), null);
});

test('normalizeAlgoliaHit maps directory hit fields', () => {
  const hit = {
    id: 1,
    objectID: '99',
    name: 'Acme',
    slug: 'acme',
    batch: 'Summer 2026',
    one_liner: 'Does things',
    industries: ['B2B', 'Engineering'],
    tags: ['AI'],
    all_locations: 'SF',
    isHiring: true,
  };
  const c = normalizeAlgoliaHit(hit);
  assert.equal(c.slug, 'acme');
  assert.equal(c.batch, 'Summer 2026');
  assert.equal(c.yc_url, 'https://www.ycombinator.com/companies/acme');
  assert.equal(c.location, 'SF');
  assert.equal(c.is_hiring, true);
  assert.deepEqual(c.industries, ['B2B', 'Engineering']);
});

test('fetchCompanyDetailHttp returns null on non-200 responses', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404 });
  assert.equal(await fetchCompanyDetailHttp('gone', { fetchImpl }), null);
});
