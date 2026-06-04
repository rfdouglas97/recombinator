#!/usr/bin/env node
/**
 * Build human correction queue from post-reclassify audit + reclassify failures.
 *
 * Outputs:
 *   output/audit/human-correction-queue.json
 *   output/audit/human-correction-queue.csv
 *   output/audit/human-correction.html
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/audit');

const PATHS = {
  audits: join(OUT, 'classification-audits.json'),
  reclassifyState: join(OUT, 'reclassify-state.json'),
  assignments: join(ROOT, 'output/phenotypes/assignments.json'),
  json: join(OUT, 'human-correction-queue.json'),
  csv: join(OUT, 'human-correction-queue.csv'),
  html: join(OUT, 'human-correction.html'),
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function loadAudits() {
  const raw = JSON.parse(readFileSync(PATHS.audits, 'utf8'));
  return raw.audits ?? raw;
}

function buildQueue() {
  const audits = loadAudits();
  const assignments = existsSync(PATHS.assignments)
    ? JSON.parse(readFileSync(PATHS.assignments, 'utf8'))
    : [];
  const bySlug = new Map(assignments.map((a) => [a.slug, a]));

  const reclassifyState = existsSync(PATHS.reclassifyState)
    ? JSON.parse(readFileSync(PATHS.reclassifyState, 'utf8'))
    : {};
  const failedSlugs = new Set(reclassifyState.failed_slugs ?? []);
  const pendingDuring = reclassifyState.pending_human ?? [];

  const seen = new Set();
  const queue = [];

  const add = (entry) => {
    const key = `${entry.slug}:${entry.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(entry);
  };

  for (const audit of audits) {
    const assignment = bySlug.get(audit.slug);
    const base = {
      slug: audit.slug,
      name: audit.name,
      yc_profile_url: assignment?.yc_profile_url ?? null,
      one_liner: assignment?.one_liner ?? null,
      audit_verdict: audit.verdict,
      audit_rationale: audit.rationale ?? '',
      issues: audit.issues ?? [],
      suggested: {
        phenotype_primary_id: audit.suggested_phenotype_primary_id ?? null,
        vertical_id: audit.suggested_vertical_id ?? null,
        industry_sub_vertical: audit.suggested_industry_sub_vertical ?? null,
        business_models: audit.suggested_business_models ?? [],
      },
      current: {
        phenotype_primary_id: assignment?.phenotype_primary_id ?? audit.current?.phenotype_primary_id,
        vertical_id: assignment?.vertical_id ?? assignment?.canonical_vertical_id ?? audit.current?.vertical_id,
        industry_sub_vertical: assignment?.industry_sub_vertical ?? audit.current?.industry_sub_vertical,
        business_models: assignment?.business_models ?? audit.current?.business_models ?? [],
      },
    };

    if (failedSlugs.has(audit.slug)) {
      add({ ...base, reason: 'reclassify_api_failed', priority: 1 });
    }

    if (audit.verdict === 'wrong') {
      add({ ...base, reason: 'still_wrong_after_auto_fix', priority: 1 });
    }

    const noSuggestedVert = !audit.suggested_vertical_id;
    const vertIssue = (audit.issues ?? []).some(
      (i) => i.field === 'vertical_id' || /vertical|fallback|ontology|no candidate/i.test(i.problem ?? ''),
    );
    if (noSuggestedVert && vertIssue && audit.verdict !== 'ok') {
      add({ ...base, reason: 'ontology_gap_no_matching_vertical', priority: 2 });
    }
  }

  for (const p of pendingDuring) {
    add({
      slug: p.slug,
      name: p.name,
      reason: p.reason,
      priority: p.reason === 'reclassify_api_failed' ? 1 : 2,
      audit_verdict: p.audit_verdict ?? null,
      issues: p.issues ?? [],
      suggested: p.suggested ?? {},
      current: p.current ?? {},
      error: p.error ?? null,
    });
  }

  queue.sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.slug.localeCompare(b.slug));

  const stats = {
    total: queue.length,
    unique_slugs: new Set(queue.map((q) => q.slug)).size,
    by_reason: {},
    audit_after_fix: {
      ok: audits.filter((a) => a.verdict === 'ok').length,
      minor_fix: audits.filter((a) => a.verdict === 'minor_fix').length,
      wrong: audits.filter((a) => a.verdict === 'wrong').length,
    },
  };
  for (const q of queue) stats.by_reason[q.reason] = (stats.by_reason[q.reason] || 0) + 1;

  return { generated_at: new Date().toISOString(), stats, queue };
}

function writeCsv(data) {
  const header = [
    'slug',
    'name',
    'reason',
    'priority',
    'audit_verdict',
    'phenotype_current',
    'phenotype_suggested',
    'vertical_current',
    'vertical_suggested',
    'industry_current',
    'industry_suggested',
    'audit_rationale',
  ].join(',');
  const rows = data.queue.map((q) =>
    [
      q.slug,
      q.name,
      q.reason,
      q.priority,
      q.audit_verdict,
      q.current?.phenotype_primary_id,
      q.suggested?.phenotype_primary_id,
      q.current?.vertical_id,
      q.suggested?.vertical_id,
      q.current?.industry_sub_vertical,
      q.suggested?.industry_sub_vertical,
      q.audit_rationale,
    ]
      .map(csvEscape)
      .join(','),
  );
  writeFileSync(PATHS.csv, [header, ...rows].join('\n'));
}

function writeHtml(data) {
  const rows = data.queue
    .map(
      (q) => `<tr>
        <td><a href="https://www.ycombinator.com/companies/${esc(q.slug)}" target="_blank">${esc(q.slug)}</a></td>
        <td>${esc(q.name)}</td>
        <td><code>${esc(q.reason)}</code></td>
        <td>${esc(q.current?.phenotype_primary_id)} → <strong>${esc(q.suggested?.phenotype_primary_id || '—')}</strong></td>
        <td>${esc(q.current?.vertical_id)} → <strong>${esc(q.suggested?.vertical_id || '—')}</strong></td>
        <td>${esc((q.audit_rationale || q.issues?.[0]?.problem || '').slice(0, 160))}</td>
      </tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Human correction queue</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0f1117; color: #e6e8ef; }
    h1 { font-size: 1.4rem; }
    .stats { color: #9aa3b2; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #2a3142; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { color: #9aa3b2; position: sticky; top: 0; background: #0f1117; }
    code { background: #1a2030; padding: 2px 6px; border-radius: 4px; }
    a { color: #7eb6ff; }
  </style>
</head>
<body>
  <h1>Human correction queue</h1>
  <p class="stats">${data.stats.unique_slugs} companies need manual review · Post-fix audit: ${data.stats.audit_after_fix.ok} ok, ${data.stats.audit_after_fix.minor_fix} minor_fix, ${data.stats.audit_after_fix.wrong} wrong</p>
  <table>
    <thead><tr><th>Slug</th><th>Name</th><th>Reason</th><th>Phenotype</th><th>Vertical</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  writeFileSync(PATHS.html, html);
}

function main() {
  mkdirSync(OUT, { recursive: true });
  if (!existsSync(PATHS.audits)) {
    console.error('Missing audit results. Run: npm run audit:classifications');
    process.exit(1);
  }

  const data = buildQueue();
  writeFileSync(PATHS.json, JSON.stringify(data, null, 2));
  writeCsv(data);
  writeHtml(data);

  console.log('Human correction queue');
  console.log('  Unique slugs:', data.stats.unique_slugs);
  console.log('  By reason:   ', data.stats.by_reason);
  console.log('  Post-fix audit:', data.stats.audit_after_fix);
  console.log('Wrote:');
  console.log(' ', PATHS.json);
  console.log(' ', PATHS.csv);
  console.log(' ', PATHS.html);
}

main();
