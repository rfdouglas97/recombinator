import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let companiesCache = null;
let verticalsById = null;

function loadVerticalLookup() {
  if (verticalsById) return verticalsById;
  const path = join(ROOT, 'taxonomy/verticals.json');
  if (!existsSync(path)) {
    verticalsById = {};
    return verticalsById;
  }
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  verticalsById = Object.fromEntries((doc.verticals ?? []).map((v) => [v.id, v]));
  return verticalsById;
}

export function loadCompanyRecords() {
  if (companiesCache) return companiesCache;
  const path = join(ROOT, 'output/verticals/normalized-assignments.json');
  if (!existsSync(path)) {
    throw new Error('Missing output/verticals/normalized-assignments.json — run npm run data:bundle');
  }
  companiesCache = JSON.parse(readFileSync(path, 'utf8'));
  return companiesCache;
}

export function tokenize(text) {
  return [
    ...new Set(
      String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}

function companyHaystack(c) {
  return [
    c.name,
    c.slug,
    c.one_liner,
    c.description_combined,
    c.industry_sub_vertical,
    c.vertical_label,
    c.vertical_id,
    c.phenotype_primary_label,
    c.phenotype_family,
    c.what_they_sell,
    c.ai_play,
    c.who_pays,
    c.value_wedge,
    ...(c.yc_tags ?? []),
    ...(c.business_models ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreCompany(c, tokens, boost = 0) {
  if (!tokens.length) return boost;
  const hay = companyHaystack(c);
  const name = c.name?.toLowerCase() ?? '';
  const slug = c.slug?.toLowerCase() ?? '';
  let score = boost;

  for (const t of tokens) {
    if (name.includes(t)) score += 12;
    else if (slug.includes(t)) score += 10;
    else if (hay.includes(t)) score += 3;
  }
  return score;
}

function applyFilters(list, filters = {}) {
  const verts = loadVerticalLookup();
  return list.filter((c) => {
    if (filters.batch && c.batch !== filters.batch) return false;
    if (filters.sector && c.vertical_sector_id !== filters.sector) return false;
    if (filters.industry) {
      const v = verts[c.vertical_id];
      if (v?.industry_id !== filters.industry) return false;
    }
    if (filters.phenotypeFamily && c.phenotype_family !== filters.phenotypeFamily) return false;
    if (filters.businessModel && !(c.business_models ?? []).includes(filters.businessModel)) return false;
    if (filters.minConfidence > 0 && (c.confidence ?? 0) < filters.minConfidence) return false;
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      if (!companyHaystack(c).includes(q)) return false;
    }
    return true;
  });
}

export function formatMatch(c) {
  return {
    slug: c.slug,
    name: c.name,
    batch: c.batch,
    one_liner: c.one_liner ?? null,
    vertical_label: c.vertical_label ?? null,
    phenotype_primary_label: c.phenotype_primary_label ?? null,
    what_they_sell: c.what_they_sell ?? null,
    ai_play: c.ai_play ?? null,
    website: c.website ?? null,
    yc_profile_url: c.yc_profile_url ?? null,
  };
}

export function searchCompanies({
  query = '',
  filters = {},
  filterSlugs = null,
  selectedSlug = null,
  limit = 12,
} = {}) {
  let list = loadCompanyRecords();

  if (Array.isArray(filterSlugs) && filterSlugs.length) {
    const allowed = new Set(filterSlugs);
    list = list.filter((c) => allowed.has(c.slug));
  } else {
    list = applyFilters(list, filters);
  }

  const tokens = tokenize(query);
  const selected = selectedSlug ? list.find((c) => c.slug === selectedSlug) : null;

  if (!tokens.length) {
    const ranked = list
      .map((c) => ({ c, score: selectedSlug === c.slug ? 100 : 0 }))
      .sort((a, b) => b.score - a.score);
    return ranked.slice(0, limit).map(({ c }) => formatMatch(c));
  }

  const scored = list
    .map((c) => ({
      c,
      score: scoreCompany(c, tokens, selectedSlug === c.slug ? 50 : 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const matches = scored.slice(0, limit).map(({ c }) => formatMatch(c));

  if (selected && !matches.some((m) => m.slug === selected.slug)) {
    matches.unshift(formatMatch(selected));
    if (matches.length > limit) matches.pop();
  }

  return matches;
}

export function buildRetrievalContext(matches, { filters, selectedSlug, meta } = {}) {
  const filterBits = [];
  if (filters?.batch) filterBits.push(`batch=${filters.batch}`);
  if (filters?.sector) filterBits.push(`sector=${filters.sector}`);
  if (filters?.industry) filterBits.push(`industry=${filters.industry}`);
  if (filters?.phenotypeFamily) filterBits.push(`phenotype_family=${filters.phenotypeFamily}`);
  if (filters?.businessModel) filterBits.push(`business_model=${filters.businessModel}`);
  if (filters?.search) filterBits.push(`sidebar_search="${filters.search}"`);

  const lines = [
    `YC database: ${meta?.assignment_count ?? 401} classified companies with vertical, phenotype, and business model tags.`,
    filterBits.length ? `Active explorer filters: ${filterBits.join(', ')}` : 'No sidebar filters active.',
    selectedSlug ? `User has selected company slug: ${selectedSlug}` : '',
    '',
    'Retrieved companies (cite by name; slug in parentheses when listing):',
  ].filter(Boolean);

  if (!matches.length) {
    lines.push('(none matched — say so and suggest broader search terms)');
  } else {
    for (const m of matches) {
      lines.push(
        `- ${m.name} (${m.slug}) · ${m.batch ?? '?'} · ${m.vertical_label ?? '?'} · ${m.phenotype_primary_label ?? '?'}`,
      );
      if (m.one_liner) lines.push(`  One-liner: ${m.one_liner}`);
      if (m.what_they_sell) lines.push(`  Sells: ${m.what_they_sell}`);
      if (m.ai_play) lines.push(`  AI play: ${m.ai_play}`);
    }
  }

  return lines.join('\n');
}

export function formatSearchReply(query, matches) {
  if (!matches.length) {
    return query.trim()
      ? `No companies matched "${query.trim()}". Try different keywords — e.g. vertical ("dental"), phenotype ("agent runtime"), or tags ("SaaS", "biotech").`
      : 'Ask me to find companies — e.g. "healthcare AI agents" or "Winter 2026 fintech".';
  }

  const header = query.trim()
    ? `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query.trim()}":`
    : `Showing ${matches.length} companies:`;

  const body = matches
    .map(
      (m, i) =>
        `${i + 1}. **${m.name}** (${m.slug}) — ${m.one_liner ?? m.vertical_label ?? 'No description'}`,
    )
    .join('\n');

  return `${header}\n\n${body}\n\nClick a result below to open its profile. Set ANTHROPIC_API_KEY in .env for natural-language answers.`;
}
