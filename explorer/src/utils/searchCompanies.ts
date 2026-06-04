import type { Company, DataBundle, Filters } from '../types';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'between', 'under', 'again', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now', 'me', 'my', 'we', 'our', 'you',
  'your', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'any', 'both',
  'find', 'show', 'list', 'tell', 'give', 'get', 'want', 'know', 'see', 'look', 'like', 'help',
  'about', 'using', 'use', 'used', 'make', 'made', 'building', 'build', 'built', 'working', 'work',
  'companies', 'company', 'startup', 'startups', 'similar', 'comparable', 'peers', 'competitors',
  'database', 'explorer', 'please', 'thanks', 'hello', 'hey',
  'phenotype', 'phenotypes', 'vertical', 'verticals', 'sector', 'sectors',
]);

const TERM_EXPANSIONS: Record<string, string[]> = {
  fintech: ['financial', 'payments', 'lending', 'banking', 'fintech'],
  healthcare: ['health', 'medical', 'clinical', 'pharma', 'hospital', 'patient'],
  health: ['healthcare', 'medical', 'clinical'],
  biotech: ['biotech', 'pharma', 'therapeutic', 'drug'],
  pharma: ['pharmaceutical', 'pharma', 'drug'],
  agents: ['agent', 'agents', 'agentic', 'autonomous'],
  agent: ['agents', 'agentic'],
  devtools: ['developer', 'devtools', 'sdk', 'api'],
  enterprise: ['enterprise', 'b2b', 'saas'],
  saas: ['saas', 'software'],
  insurance: ['insurance', 'insurtech', 'payer'],
  robotics: ['robotics', 'robot', 'automation'],
  defense: ['defense', 'military', 'national security'],
  voice: ['voice', 'speech', 'audio', 'telephony'],
  ai: ['ai', 'artificial', 'ml', 'machine learning', 'llm'],
  llm: ['llm', 'language model', 'generative'],
  legal: ['legal', 'law', 'compliance'],
  security: ['security', 'cyber', 'cybersecurity'],
  sales: ['sales', 'gtm', 'revenue'],
  marketing: ['marketing', 'ads', 'advertising'],
  restaurant: ['restaurant', 'hospitality', 'food service', 'dining'],
  automotive: ['automotive', 'fleet', 'vehicle', 'mobility'],
  semiconductor: ['semiconductor', 'chip', 'silicon'],
};

const BATCH_ALIASES: [RegExp, string][] = [
  [/\b(w26|winter\s*['']?26|winter\s*2026)\b/i, 'Winter 2026'],
  [/\b(s26|spring\s*['']?26|spring\s*2026)\b/i, 'Spring 2026'],
  [/\b(x26|summer\s*['']?26|summer\s*2026)\b/i, 'Summer 2026'],
  [/\b(f26|fall\s*['']?26|fall\s*2026)\b/i, 'Fall 2026'],
];

const SECTOR_HINTS: [RegExp, string][] = [
  [/\b(fintech|payments?|lending|banking|insurtech)\b/i, 'financial-services'],
  [/\b(healthcare|health\s*tech|digital\s*health|medical|clinical|hospital)\b/i, 'healthcare-life-sciences'],
  [/\b(biotech|pharma|therapeutic|drug\s*discovery)\b/i, 'healthcare-life-sciences'],
  [/\b(enterprise|b2b\s*saas|devtools?|developer\s*tools)\b/i, 'enterprise-software'],
  [/\b(ai\s*infra|agent\s*(platform|runtime|infrastructure))\b/i, 'ai-infrastructure'],
  [/\b(robotics?|manufacturing|industrial)\b/i, 'industrials-defense'],
  [/\b(defense|military|aerospace)\b/i, 'industrials-defense'],
  [/\b(consumer|retail|e-?commerce)\b/i, 'retail-commerce'],
  [/\b(restaurant|hospitality|food\s*service)\b/i, 'retail-commerce'],
];

interface SoftHints {
  batch?: string;
  sector?: string;
  businessModel?: string;
}

function parseSearchQuery(text: string) {
  const raw = text.trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const quoted = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase().trim());
  const bmMatch = normalized.match(/\bbm-?(\d{2})\b/i);
  const rawParts = normalized
    .replace(/bm-?\d{2}/gi, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const focusTokens = rawParts.filter((t) => !STOP_WORDS.has(t)).slice(0, 8);
  const matchTokens = new Set(focusTokens);
  for (const t of focusTokens.slice(0, 4)) {
    for (const alt of (TERM_EXPANSIONS[t] ?? []).slice(0, 3)) {
      for (const piece of alt.toLowerCase().split(/\s+/).filter((x) => x.length >= 2)) {
        matchTokens.add(piece);
      }
    }
  }
  if (bmMatch) matchTokens.add(`bm-${bmMatch[1]}`);
  return {
    normalized,
    focusTokens,
    matchTokens: [...matchTokens],
    quoted,
    businessModel: bmMatch ? `BM-${bmMatch[1]}` : null,
  };
}

function inferSoftHints(query: string): SoftHints {
  const soft: SoftHints = {};
  for (const [re, batch] of BATCH_ALIASES) {
    if (re.test(query)) {
      soft.batch = batch;
      break;
    }
  }
  for (const [re, sector] of SECTOR_HINTS) {
    if (re.test(query)) {
      soft.sector = sector;
      break;
    }
  }
  const parsed = parseSearchQuery(query);
  if (parsed.businessModel) soft.businessModel = parsed.businessModel;
  return soft;
}

function scoreSoftHints(c: Company, soft: SoftHints) {
  let score = 0;
  if (soft.batch && c.batch === soft.batch) score += 32;
  if (soft.sector && c.vertical_sector_id === soft.sector) score += 28;
  if (soft.businessModel && c.business_models.includes(soft.businessModel)) score += 22;
  return score;
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
    c.vertical_id,
    c.vertical_sector_id,
    c.phenotype_primary_label,
    c.phenotype_primary_id,
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

function tokenHits(c: Company, bundle: DataBundle, token: string) {
  const hay = haystack(c, bundle);
  const name = c.name.toLowerCase();
  const slug = c.slug.toLowerCase();
  const slugCompact = slug.replace(/-/g, '');
  if (name.includes(token)) return { hit: true, weight: 14 };
  if (slug === token || slug.startsWith(`${token}-`) || slug.endsWith(`-${token}`)) {
    return { hit: true, weight: 16 };
  }
  if (slug.includes(token)) return { hit: true, weight: 11 };
  if (slugCompact.includes(token)) return { hit: true, weight: 10 };
  if (hay.includes(token)) return { hit: true, weight: 4 };
  return { hit: false, weight: 0 };
}

function scoreCompany(
  c: Company,
  bundle: DataBundle,
  parsed: ReturnType<typeof parseSearchQuery>,
  soft: SoftHints,
  boost = 0,
) {
  const { normalized, matchTokens, focusTokens, quoted } = parsed;
  if (!matchTokens.length && !quoted.length && !normalized) return boost + scoreSoftHints(c, soft);

  const hay = haystack(c, bundle);
  let score = boost + scoreSoftHints(c, soft);
  let matchedFocus = 0;

  if (normalized.length >= 3 && hay.includes(normalized)) score += 48;
  for (const phrase of quoted) {
    if (phrase.length >= 2 && hay.includes(phrase)) score += 42;
  }

  const seen = new Set<string>();
  for (const t of matchTokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    const { hit, weight } = tokenHits(c, bundle, t);
    if (hit) score += weight;
  }

  for (const t of focusTokens) {
    if (tokenHits(c, bundle, t).hit) matchedFocus += 1;
  }

  if (focusTokens.length > 0) {
    score += Math.round((matchedFocus / focusTokens.length) * 20);
    if (focusTokens.length >= 2 && matchedFocus < 1 && scoreSoftHints(c, soft) === 0) return 0;
  } else if (score <= boost + scoreSoftHints(c, soft)) {
    return 0;
  }

  return score;
}

/** Client-side fallback when API is unavailable. */
export function searchCompaniesLocal(
  bundle: DataBundle,
  query: string,
  filters: Filters,
  limit = 40,
): Company[] {
  const parsed = parseSearchQuery(query.trim());
  const soft = inferSoftHints(query);
  const cap = Math.min(Math.max(limit, 1), 60);

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

  if (!parsed.matchTokens.length && !parsed.quoted.length && !parsed.normalized) {
    return base.slice(0, cap);
  }

  return base
    .map((c) => ({ c, score: scoreCompany(c, bundle, parsed, soft) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map(({ c }) => c);
}

export function formatLocalSearchReply(query: string, companies: Company[]): string {
  if (!companies.length) {
    return query.trim()
      ? `No companies matched "${query.trim()}" in the current filter scope.`
      : 'Try a search like "healthcare AI" or "agent infrastructure".';
  }

  const lines = companies.slice(0, 20).map(
    (c, i) => `${i + 1}. ${c.name} (${c.slug}) — ${c.one_liner ?? c.vertical_label ?? ''}`,
  );
  const more =
    companies.length > 20 ? `\n\n+${companies.length - 20} more matches (ask to narrow the search).` : '';
  return `Found ${companies.length} match${companies.length === 1 ? '' : 'es'} (offline search):\n\n${lines.join('\n')}${more}`;
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
