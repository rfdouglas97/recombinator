import type { Company, DataBundle, Filters } from '../types';

function tokenize(text: string) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2),
    ),
  ];
}

function haystack(c: Company, bundle: DataBundle) {
  const v = bundle.facets.verticals.find((x) => x.id === c.vertical_id);
  return [
    c.name,
    c.slug,
    c.one_liner,
    c.description,
    c.industry_sub_vertical,
    c.vertical_label,
    c.phenotype_primary_label,
    c.phenotype_family,
    c.what_they_sell,
    c.ai_play,
    v?.industry_label,
    v?.sector_label,
    ...c.business_models,
    ...c.yc_tags,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreCompany(c: Company, tokens: string[], bundle: DataBundle, boost = 0) {
  if (!tokens.length) return boost;
  const hay = haystack(c, bundle);
  const name = c.name.toLowerCase();
  const slug = c.slug.toLowerCase();
  let score = boost;

  for (const t of tokens) {
    if (name.includes(t)) score += 12;
    else if (slug.includes(t)) score += 10;
    else if (hay.includes(t)) score += 3;
  }
  return score;
}

/** Client-side fallback when API is unavailable. */
export function searchCompaniesLocal(
  bundle: DataBundle,
  query: string,
  filters: Filters,
  limit = 12,
): Company[] {
  const tokens = tokenize(query.trim());
  const base = Object.values(bundle.companies).filter((c) => {
    if (filters.batch && c.batch !== filters.batch) return false;
    if (filters.sector && c.vertical_sector_id !== filters.sector) return false;
    if (filters.industry) {
      const v = bundle.facets.verticals.find((x) => x.id === c.vertical_id);
      if (v?.industry_id !== filters.industry) return false;
    }
    if (filters.phenotypeFamily && c.phenotype_family !== filters.phenotypeFamily) return false;
    if (filters.businessModel && !c.business_models.includes(filters.businessModel)) return false;
    if (filters.minConfidence > 0 && (c.confidence ?? 0) < filters.minConfidence) return false;
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      if (!haystack(c, bundle).includes(q)) return false;
    }
    return true;
  });

  if (!tokens.length) return base.slice(0, limit);

  return base
    .map((c) => ({ c, score: scoreCompany(c, tokens, bundle) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => c);
}

export function formatLocalSearchReply(query: string, companies: Company[]): string {
  if (!companies.length) {
    return query.trim()
      ? `No companies matched "${query.trim()}" in the current filter scope.`
      : 'Try a search like "healthcare AI" or "agent infrastructure".';
  }

  const lines = companies.map(
    (c, i) => `${i + 1}. ${c.name} (${c.slug}) — ${c.one_liner ?? c.vertical_label ?? ''}`,
  );
  return `Found ${companies.length} match${companies.length === 1 ? '' : 'es'} (offline search):\n\n${lines.join('\n')}`;
}

export function companiesToMatches(companies: Company[]) {
  return companies.map((c) => ({
    slug: c.slug,
    name: c.name,
    batch: c.batch,
    one_liner: c.one_liner,
    vertical_label: c.vertical_label,
    phenotype_primary_label: c.phenotype_primary_label,
    what_they_sell: c.what_they_sell,
    ai_play: c.ai_play,
    website: c.website,
    yc_profile_url: c.yc_profile_url,
  }));
}
