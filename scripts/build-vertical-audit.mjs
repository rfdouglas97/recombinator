#!/usr/bin/env node
/**
 * Build self-contained HTML audit page for vertical ontology + expansion results.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { SECTORS, INDUSTRIES, VERTICALS } from '../taxonomy/verticals-data.mjs';
import { buildOntologyDocument, loadVerticalOntology } from '../taxonomy/verticals.mjs';
import { normalizeVertical } from '../taxonomy/verticals.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'output/verticals/audit.html');

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadAssignments() {
  const path = join(ROOT, 'output/phenotypes/assignments.json');
  if (!existsSync(path)) return [];
  const raw = readJson(path, []);
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function buildAuditData() {
  const ontology = loadVerticalOntology();
  const proposalsRaw = readJson(join(ROOT, 'output/verticals/expansion-proposals.json'), {
    proposals: [],
  });
  const mergeReport = readJson(join(ROOT, 'output/verticals/merge-report.json'), {
    rejected: [],
    stats: {},
  });
  const expansionApproved = readJson(join(ROOT, 'output/verticals/expansion-approved.json'), {
    verticals: [],
    stats: {},
  });
  const assignments = loadAssignments();
  const ontologyBuilt = buildOntologyDocument();

  const seedIds = new Set(VERTICALS.map((v) => v.id));
  const expandedIds = new Set((expansionApproved.verticals ?? []).map((v) => v.id));

  const verticalRows = ontology.verticals.map((v) => {
    const source = seedIds.has(v.id) ? 'seed' : expandedIds.has(v.id) ? 'llm_expansion' : 'unknown';
    const mappedCompanies = assignments
      .filter((a) => {
        const n = normalizeVertical(
          { industry_sub_vertical: a.industry_sub_vertical, yc_industries: a.yc_industries },
          ontology
        );
        return n.vertical_id === v.id;
      })
      .map((a) => ({ slug: a.slug, name: a.name, raw: a.industry_sub_vertical }));

    return {
      ...v,
      source,
      yc_company_count: mappedCompanies.length,
      yc_companies: mappedCompanies,
    };
  });

  const proposalsByIndustry = {};
  for (const p of proposalsRaw.proposals ?? []) {
    const key = p.industry_id ?? 'unknown';
    if (!proposalsByIndustry[key]) proposalsByIndustry[key] = [];
    proposalsByIndustry[key].push(p);
  }

  return {
    generated_at: new Date().toISOString(),
    counts: {
      sectors: SECTORS.length,
      industries: INDUSTRIES.length,
      seed_verticals: VERTICALS.length,
      llm_proposals_raw: (proposalsRaw.proposals ?? []).length,
      llm_approved: (expansionApproved.verticals ?? []).length,
      llm_rejected: (mergeReport.rejected ?? []).length,
      total_verticals: ontology.verticals.length,
      phenotype_assignments: assignments.length,
      industries_with_yc_coverage: new Set(
        verticalRows.filter((v) => v.yc_company_count > 0).map((v) => v.industry_id)
      ).size,
    },
    merge_stats: mergeReport.stats ?? expansionApproved.stats ?? {},
    sectors: SECTORS,
    industries: INDUSTRIES,
    verticals: verticalRows,
    rejected: mergeReport.rejected ?? [],
    proposals_by_industry: proposalsByIndustry,
    reflections:
      readJson(join(ROOT, 'output/verticals/expansion-state.json'), {})?.reflections ?? [],
  };
}

function buildHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vertical Ontology Audit</title>
  <style>
    :root {
      --bg: #0f1117; --panel: #171a22; --border: #2a2f3a; --text: #e8eaed;
      --muted: #9aa0a6; --accent: #6ea8fe; --seed: #3dd68c; --llm: #f0b429; --rej: #ff6b6b;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 20px 24px; border-bottom: 1px solid var(--border); background: var(--panel); position: sticky; top: 0; z-index: 10; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .sub { color: var(--muted); font-size: 13px; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .stat { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; min-width: 120px; }
    .stat b { display: block; font-size: 18px; }
    .stat span { color: var(--muted); font-size: 12px; }
    main { padding: 20px 24px 60px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; align-items: center; }
    input, select { background: var(--panel); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 8px 10px; }
    input { min-width: 220px; flex: 1; }
    .tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 8px 14px; border-radius: 999px; cursor: pointer; }
    .tab.active { background: var(--accent); color: #0f1117; border-color: var(--accent); font-weight: 600; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { background: #1c2030; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; position: sticky; top: 120px; }
    tr:hover td { background: rgba(110,168,254,.06); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .badge.seed { background: rgba(61,214,140,.15); color: var(--seed); }
    .badge.llm { background: rgba(240,180,41,.15); color: var(--llm); }
    .badge.rej { background: rgba(255,107,107,.15); color: var(--rej); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #b8c0cc; }
    .muted { color: var(--muted); font-size: 12px; }
    .pill { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; background: var(--bg); border-radius: 4px; font-size: 11px; }
    .section { display: none; }
    .section.active { display: block; }
    .empty { padding: 40px; text-align: center; color: var(--muted); }
    details summary { cursor: pointer; color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>Vertical Ontology Audit</h1>
    <div class="sub">Canonical industry × workflow verticals for BM gap analysis · Generated ${esc(data.generated_at)}</div>
    <div class="stats" id="stats"></div>
  </header>
  <main>
    <div class="tabs" id="tabs"></div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search id, label, workflow, buyers..." />
      <select id="sectorFilter"><option value="">All sectors</option></select>
      <select id="industryFilter"><option value="">All industries</option></select>
    </div>
    <div id="sections"></div>
  </main>
  <script type="application/json" id="audit-data">${json}</script>
  <script>
    const DATA = JSON.parse(document.getElementById('audit-data').textContent);

    const statsEl = document.getElementById('stats');
    const c = DATA.counts;
    [
      ['Total verticals', c.total_verticals],
      ['Seed', c.seed_verticals],
      ['LLM approved', c.llm_approved],
      ['LLM rejected', c.llm_rejected],
      ['Raw proposals', c.llm_proposals_raw],
      ['Industries', c.industries],
      ['YC assignments', c.phenotype_assignments],
    ].forEach(([label, val]) => {
      statsEl.innerHTML += '<div class="stat"><b>' + val + '</b><span>' + label + '</span></div>';
    });

    const tabs = [
      { id: 'all', label: 'All verticals (' + DATA.verticals.length + ')' },
      { id: 'seed', label: 'Seed only' },
      { id: 'llm', label: 'LLM expanded' },
      { id: 'yc', label: 'With YC companies' },
      { id: 'gaps', label: 'Zero YC coverage' },
      { id: 'rejected', label: 'Rejected (' + DATA.rejected.length + ')' },
      { id: 'industries', label: 'By industry' },
    ];

    let activeTab = 'all';
    const tabsEl = document.getElementById('tabs');
    tabs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (t.id === activeTab ? ' active' : '');
      btn.textContent = t.label;
      btn.onclick = () => { activeTab = t.id; render(); };
      tabsEl.appendChild(btn);
    });

    const sectorFilter = document.getElementById('sectorFilter');
    DATA.sectors.forEach(s => {
      const o = document.createElement('option');
      o.value = s.id; o.textContent = s.label; sectorFilter.appendChild(o);
    });
    const industryFilter = document.getElementById('industryFilter');
    DATA.industries.forEach(i => {
      const o = document.createElement('option');
      o.value = i.id; o.textContent = i.label; industryFilter.appendChild(o);
    });

    document.getElementById('search').oninput = render;
    sectorFilter.onchange = render;
    industryFilter.onchange = render;

    function filterVerticals(list) {
      const q = document.getElementById('search').value.toLowerCase().trim();
      const sector = sectorFilter.value;
      const industry = industryFilter.value;
      return list.filter(v => {
        if (sector && v.sector_id !== sector) return false;
        if (industry && v.industry_id !== industry) return false;
        if (!q) return true;
        const hay = [v.id, v.label, v.workflow, v.industry_label, v.sector_label, ...(v.buyers||[]), ...(v.aliases||[])].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    function verticalTable(rows) {
      if (!rows.length) return '<div class="empty">No rows match filters.</div>';
      let html = '<table><thead><tr><th>Source</th><th>ID</th><th>Label</th><th>Sector / Industry</th><th>Workflow</th><th>Buyers</th><th>YC</th></tr></thead><tbody>';
      rows.forEach(v => {
        const badge = v.source === 'seed' ? 'seed' : 'llm';
        const yc = v.yc_company_count
          ? '<details><summary>' + v.yc_company_count + '</summary><div class="muted">' + v.yc_companies.map(c => c.slug).join(', ') + '</div></details>'
          : '<span class="muted">0</span>';
        html += '<tr>' +
          '<td><span class="badge ' + badge + '">' + v.source + '</span></td>' +
          '<td class="mono">' + v.id + '</td>' +
          '<td><div>' + v.label + '</div>' + (v.aliases?.length ? '<div class="muted">' + v.aliases.slice(0,2).join(' · ') + '</div>' : '') + '</td>' +
          '<td><div>' + (v.sector_label||'') + '</div><div class="muted">' + (v.industry_label||'') + '</div></td>' +
          '<td class="mono">' + (v.workflow||'—') + '</td>' +
          '<td class="muted">' + (v.buyers||[]).slice(0,2).join(', ') + '</td>' +
          '<td>' + yc + '</td></tr>';
      });
      html += '</tbody></table>';
      return html;
    }

    function rejectedTable(rows) {
      if (!rows.length) return '<div class="empty">No rejected proposals.</div>';
      let html = '<table><thead><tr><th>Status</th><th>ID</th><th>Label</th><th>Industry</th><th>Reason</th></tr></thead><tbody>';
      rows.forEach(r => {
        html += '<tr><td><span class="badge rej">' + (r.status||'rejected') + '</span></td>' +
          '<td class="mono">' + (r.id||'—') + '</td><td>' + (r.label||'') + '</td>' +
          '<td class="muted">' + (r.industry_id||'') + '</td><td class="muted">' + (r.reject_reason||'') + '</td></tr>';
      });
      return html + '</tbody></table>';
    }

    function industryView() {
      let html = '';
      DATA.industries.forEach(ind => {
        const verts = filterVerticals(DATA.verticals.filter(v => v.industry_id === ind.id));
        const props = (DATA.proposals_by_industry[ind.id] || []).length;
        html += '<details style="margin-bottom:12px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:12px">' +
          '<summary><b>' + ind.label + '</b> <span class="muted">(' + ind.id + ') · ' + verts.length + ' verticals · ' + props + ' raw proposals</span></summary>' +
          verticalTable(verts) + '</details>';
      });
      return html;
    }

    function render() {
      document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', tabs[i].id === activeTab));
      const sections = document.getElementById('sections');
      let rows = DATA.verticals;
      if (activeTab === 'seed') rows = rows.filter(v => v.source === 'seed');
      else if (activeTab === 'llm') rows = rows.filter(v => v.source === 'llm_expansion');
      else if (activeTab === 'yc') rows = rows.filter(v => v.yc_company_count > 0);
      else if (activeTab === 'gaps') rows = rows.filter(v => v.yc_company_count === 0);
      rows = filterVerticals(rows);

      if (activeTab === 'rejected') {
        sections.innerHTML = '<div class="section active">' + rejectedTable(filterVerticals(DATA.rejected.map(r => ({...r, sector_id:'', industry_id:r.industry_id})))) + '</div>';
        return;
      }
      if (activeTab === 'industries') {
        sections.innerHTML = '<div class="section active">' + industryView() + '</div>';
        return;
      }
      sections.innerHTML = '<div class="section active">' + verticalTable(rows) + '</div>';
    }
    render();
  </script>
</body>
</html>`;
}

function main() {
  mkdirSync(dirname(OUT), { recursive: true });
  const data = buildAuditData();
  writeFileSync(OUT, buildHtml(data));
  console.log('Wrote', OUT);
  console.log('  Total verticals:', data.counts.total_verticals);
  console.log(
    '  Seed:',
    data.counts.seed_verticals,
    '| LLM approved:',
    data.counts.llm_approved,
    '| Rejected:',
    data.counts.llm_rejected
  );
}

main();
