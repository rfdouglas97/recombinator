#!/usr/bin/env node
/**
 * Build HTML + CSV review queue from classification audit results.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'output/audit/classification-audits.json');
const OUT_HTML = join(ROOT, 'output/audit/review.html');
const OUT_CSV = join(ROOT, 'output/audit/review.csv');

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

function priority(a) {
  let p = a.severity ?? (a.verdict === 'wrong' ? 3 : a.verdict === 'minor_fix' ? 2 : 1);
  if (a.current?.vertical_normalize_method?.startsWith('yc_')) p += 0.5;
  if ((a.current?.vertical_normalize_confidence ?? 1) < 0.7) p += 0.3;
  return p;
}

function buildCsv(audits) {
  const header = [
    'slug',
    'name',
    'verdict',
    'classification_confidence',
    'escalated',
    'severity',
    'phenotype_current',
    'phenotype_suggested',
    'vertical_current',
    'vertical_suggested',
    'industry_sub_vertical',
    'industry_suggested',
    'bm_current',
    'bm_suggested',
    'normalize_method',
    'rationale',
  ].join(',');
  const rows = audits.map((a) =>
    [
      a.slug,
      a.name,
      a.verdict,
      a.classification_confidence,
      a.escalated ? 'yes' : 'no',
      a.severity,
      a.current?.phenotype_primary_id,
      a.suggested_phenotype_primary_id,
      a.current?.vertical_id,
      a.suggested_vertical_id,
      a.current?.industry_sub_vertical,
      a.suggested_industry_sub_vertical,
      (a.current?.business_models ?? []).join('|'),
      (a.suggested_business_models ?? []).join('|'),
      a.current?.vertical_normalize_method,
      a.rationale,
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header, ...rows].join('\n');
}

function buildHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Classification Audit Review</title>
  <style>
    :root { --bg:#0f1114; --panel:#161a1f; --border:#2a323d; --text:#e8eaed; --muted:#8b949e;
      --ok:#3dd68c; --minor:#f0b429; --wrong:#ff6b6b; }
    * { box-sizing:border-box; }
    body { margin:0; font:14px/1.45 system-ui,sans-serif; background:var(--bg); color:var(--text); }
    header { padding:16px 20px; border-bottom:1px solid var(--border); background:var(--panel); position:sticky; top:0; z-index:5; }
    h1 { margin:0 0 6px; font-size:18px; }
    .stats { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
    .stat { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:6px 12px; font-size:12px; }
    .stat b { font-size:16px; display:block; }
    main { padding:16px 20px 40px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; align-items:center; }
    input, select { background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:8px 10px; }
    input { flex:1; min-width:200px; }
    table { width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:8px; overflow:hidden; }
    th, td { text-align:left; padding:10px; border-bottom:1px solid var(--border); vertical-align:top; }
    th { color:var(--muted); font-size:11px; text-transform:uppercase; background:#1a1f28; position:sticky; top:100px; }
    tr:hover td { background:rgba(255,255,255,.03); }
    .badge { padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
    .ok { background:rgba(61,214,140,.15); color:var(--ok); }
    .minor { background:rgba(240,180,41,.15); color:var(--minor); }
    .wrong { background:rgba(255,107,107,.15); color:var(--wrong); }
    .mono { font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#b8c0cc; }
    .muted { color:var(--muted); font-size:12px; }
    .chg { color:var(--minor); }
  </style>
</head>
<body>
  <header>
    <h1>Classification Audit Review</h1>
    <div class="muted">Generated ${esc(data.generated_at)} · model ${esc(data.model)}</div>
    <div class="stats" id="stats"></div>
  </header>
  <main>
    <div class="toolbar">
      <input id="q" type="search" placeholder="Search slug, name, rationale…" />
      <select id="verdict"><option value="">All verdicts</option><option value="wrong">wrong</option><option value="minor_fix">minor_fix</option><option value="ok">ok</option></select>
      <select id="sort"><option value="priority">Sort: priority</option><option value="slug">Sort: slug</option><option value="verdict">Sort: verdict</option></select>
    </div>
    <table><thead><tr>
      <th>Verdict</th><th>Company</th><th>Phenotype</th><th>Vertical</th><th>Industry niche</th><th>BM</th><th>Rationale</th>
    </tr></thead><tbody id="rows"></tbody></table>
  </main>
  <script type="application/json" id="data">${json}</script>
  <script>
    const DATA = JSON.parse(document.getElementById('data').textContent);
    const stats = { ok:0, minor_fix:0, wrong:0 };
    DATA.audits.forEach(a => stats[a.verdict]=(stats[a.verdict]||0)+1);
    document.getElementById('stats').innerHTML = [
      ['Total', DATA.audits.length], ['OK', stats.ok], ['Minor fix', stats.minor_fix], ['Wrong', stats.wrong]
    ].map(([l,v])=>'<div class="stat"><b>'+v+'</b>'+l+'</div>').join('');

    function diff(cur, sug) {
      if (!sug || sug === cur) return '<span class="mono">'+ (cur||'—') +'</span>';
      return '<span class="mono">'+ (cur||'—') +'</span><br><span class="chg">→ '+ sug +'</span>';
    }

    function render() {
      const q = document.getElementById('q').value.toLowerCase();
      const vf = document.getElementById('verdict').value;
      const sort = document.getElementById('sort').value;
      let rows = DATA.audits.filter(a => {
        if (vf && a.verdict !== vf) return false;
        if (!q) return true;
        const hay = [a.slug,a.name,a.rationale,a.current?.industry_sub_vertical].join(' ').toLowerCase();
        return hay.includes(q);
      });
      if (sort === 'priority') rows.sort((a,b) => (b._priority||0) - (a._priority||0));
      else if (sort === 'slug') rows.sort((a,b) => a.slug.localeCompare(b.slug));
      else rows.sort((a,b) => a.verdict.localeCompare(b.verdict));

      document.getElementById('rows').innerHTML = rows.map(a => '<tr>' +
        '<td><span class="badge '+({ok:'ok',minor_fix:'minor',wrong:'wrong'}[a.verdict]||'minor')+'">'+a.verdict+'</span></td>' +
        '<td><div>'+a.name+'</div><div class="mono">'+a.slug+'</div></td>' +
        '<td>'+ diff(a.current?.phenotype_primary_id, a.suggested_phenotype_primary_id) +'</td>' +
        '<td>'+ diff(a.current?.vertical_id, a.suggested_vertical_id) +
          (a.current?.vertical_normalize_method ? '<div class="muted">'+a.current.vertical_normalize_method+'</div>' : '') +'</td>' +
        '<td>'+ diff(a.current?.industry_sub_vertical, a.suggested_industry_sub_vertical) +'</td>' +
        '<td><span class="mono">'+ (a.current?.business_models||[]).join(', ') +'</span>' +
          (a.suggested_business_models?.length ? '<br><span class="chg">→ '+a.suggested_business_models.join(', ')+'</span>' : '') +'</td>' +
        '<td class="muted">'+a.rationale+'</td></tr>').join('');
    }
    document.getElementById('q').oninput = render;
    document.getElementById('verdict').onchange = render;
    document.getElementById('sort').onchange = render;
    render();
  </script>
</body>
</html>`;
}

function main() {
  if (!existsSync(IN)) {
    console.error('Missing', IN, '— run npm run audit:classifications first');
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(IN, 'utf8'));
  const audits = (raw.audits ?? raw).map((a) => ({ ...a, _priority: priority(a) }));
  audits.sort((a, b) => b._priority - a._priority);

  const model = audits[0]?.model ?? 'unknown';
  const payload = { generated_at: raw.generated_at ?? new Date().toISOString(), model, audits };

  mkdirSync(dirname(OUT_HTML), { recursive: true });
  writeFileSync(OUT_HTML, buildHtml(payload));
  writeFileSync(OUT_CSV, buildCsv(audits));

  const counts = { ok: 0, minor_fix: 0, wrong: 0 };
  for (const a of audits) counts[a.verdict] = (counts[a.verdict] ?? 0) + 1;

  console.log('Wrote', OUT_HTML);
  console.log('Wrote', OUT_CSV);
  console.log('  ok:', counts.ok, '| minor_fix:', counts.minor_fix, '| wrong:', counts.wrong);
}

main();
