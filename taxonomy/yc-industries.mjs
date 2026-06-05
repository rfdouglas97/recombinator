/**
 * YC directory industry ontology (parent + sub-industry tags from yc_industries[]).
 * Used for explorer facets, ontology tree, and matrix aggregation — workflow verticals stay separate.
 */

/** Display order for YC top-level industry filters (matches YC directory). */
export const YC_PARENT_ORDER = [
  'B2B',
  'Consumer',
  'Fintech',
  'Healthcare',
  'Education',
  'Industrials',
  'Real Estate and Construction',
  'Government',
];

/** Sub-industries known to YC (grouped by parent). Corpus may omit tags with zero companies. */
export const YC_SUBINDUSTRIES_BY_PARENT = {
  B2B: [
    'Analytics',
    'Engineering, Product and Design',
    'Finance and Accounting',
    'Human Resources',
    'Infrastructure',
    'Legal',
    'Marketing',
    'Office Management',
    'Operations',
    'Productivity',
    'Recruiting and Talent',
    'Retail',
    'Sales',
    'Security',
    'Supply Chain and Logistics',
  ],
  Consumer: [
    'Apparel and Cosmetics',
    'Consumer Electronics',
    'Content',
    'Food and Beverage',
    'Gaming',
    'Home and Personal',
    'Job and Career Services',
    'Social',
    'Transportation Services',
    'Travel, Leisure and Tourism',
    'Virtual and Augmented Reality',
  ],
  Fintech: [
    'Asset Management',
    'Banking and Exchange',
    'Consumer Finance',
    'Credit and Lending',
    'Insurance',
    'Payments',
  ],
  Healthcare: [
    'Consumer Health and Wellness',
    'Diagnostics',
    'Drug Discovery and Delivery',
    'Healthcare IT',
    'Healthcare Services',
    'Industrial Bio',
    'Medical Devices',
    'Therapeutics',
  ],
  Industrials: [
    'Agriculture',
    'Automotive',
    'Aviation and Space',
    'Climate',
    'Defense',
    'Drones',
    'Energy',
    'Manufacturing and Robotics',
  ],
  'Real Estate and Construction': ['Construction', 'Housing and Real Estate'],
};

export const YC_PARENT_ONLY_SUB = '__general__';
export const YC_PARENT_ONLY_LABEL = 'General';

export function ycParent(ycIndustries) {
  return ycIndustries?.[0] ?? null;
}

export function ycSub(ycIndustries) {
  return ycIndustries?.[1] ?? null;
}

export function ycSubIndustryId(parent, sub) {
  if (!parent) return null;
  if (!sub || sub === YC_PARENT_ONLY_SUB) return `${parent}::${YC_PARENT_ONLY_SUB}`;
  return `${parent}::${sub}`;
}

export function parseYcSubIndustryId(id) {
  if (!id) return { parent: null, sub: null };
  const idx = id.indexOf('::');
  if (idx === -1) return { parent: null, sub: id };
  const parent = id.slice(0, idx);
  const sub = id.slice(idx + 2);
  return {
    parent,
    sub: sub === YC_PARENT_ONLY_SUB ? null : sub,
    isParentOnly: sub === YC_PARENT_ONLY_SUB,
  };
}

function sortParents(parents) {
  const order = new Map(YC_PARENT_ORDER.map((p, i) => [p, i]));
  return [...parents].sort((a, b) => {
    const ao = order.has(a) ? order.get(a) : 999;
    const bo = order.has(b) ? order.get(b) : 999;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b);
  });
}

function sortSubs(parent, subs) {
  const canonical = YC_SUBINDUSTRIES_BY_PARENT[parent] ?? [];
  const order = new Map(canonical.map((s, i) => [s, i]));
  return [...subs].sort((a, b) => {
    if (a === YC_PARENT_ONLY_SUB) return -1;
    if (b === YC_PARENT_ONLY_SUB) return 1;
    const ao = order.has(a) ? order.get(a) : 999;
    const bo = order.has(b) ? order.get(b) : 999;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b);
  });
}

/** Build sector (YC parent) + industry (YC sub) facets from company records. */
export function buildYcFacetsFromCompanies(companies) {
  const list = Array.isArray(companies) ? companies : Object.values(companies ?? {});
  const parentCounts = new Map();
  const subCounts = new Map();

  for (const c of list) {
    const parent = ycParent(c.yc_industries);
    if (!parent) continue;
    parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    const sub = ycSub(c.yc_industries);
    if (sub) {
      const key = `${parent}|${sub}`;
      subCounts.set(key, (subCounts.get(key) ?? 0) + 1);
    } else {
      const key = `${parent}|${YC_PARENT_ONLY_SUB}`;
      subCounts.set(key, (subCounts.get(key) ?? 0) + 1);
    }
  }

  const sectors = sortParents([...parentCounts.keys()]).map((id) => ({
    id,
    label: id,
  }));

  const industries = [];
  for (const [key, count] of subCounts) {
    const [parent, sub] = key.split('|');
    const label = sub === YC_PARENT_ONLY_SUB ? YC_PARENT_ONLY_LABEL : sub;
    industries.push({
      id: ycSubIndustryId(parent, sub === YC_PARENT_ONLY_SUB ? null : sub),
      label,
      sector_id: parent,
      count,
    });
  }
  industries.sort(
    (a, b) =>
      sortParents([a.sector_id, b.sector_id]).indexOf(a.sector_id) -
        sortParents([a.sector_id, b.sector_id]).indexOf(b.sector_id) ||
      a.label.localeCompare(b.label),
  );

  return { sectors, industries };
}

/** YC industry → sub-industry → workflow vertical → company. */
export function buildYcIndustryVerticalTree(companies, verticalOntology) {
  const verticals = verticalOntology?.verticals ?? [];
  const vertById = Object.fromEntries(verticals.map((v) => [v.id, v]));
  const list = Object.values(companies ?? {});

  const nest = {};
  for (const c of list) {
    if (!c.vertical_id) continue;
    const parent = ycParent(c.yc_industries) || 'Unspecified';
    const sub = ycSub(c.yc_industries) || YC_PARENT_ONLY_SUB;
    nest[parent] ??= {};
    nest[parent][sub] ??= {};
    nest[parent][sub][c.vertical_id] ??= [];
    nest[parent][sub][c.vertical_id].push(c.slug);
  }

  const root = { id: 'root', label: 'All companies', type: 'root', children: [] };

  for (const parent of sortParents(Object.keys(nest))) {
    const sectorNode = { id: parent, label: parent, type: 'sector', children: [] };

    for (const sub of sortSubs(parent, Object.keys(nest[parent]))) {
      const subLabel = sub === YC_PARENT_ONLY_SUB ? YC_PARENT_ONLY_LABEL : sub;
      const indNode = {
        id: ycSubIndustryId(parent, sub === YC_PARENT_ONLY_SUB ? null : sub),
        label: subLabel,
        type: 'industry',
        children: [],
      };

      const vertEntries = Object.entries(nest[parent][sub]).sort((a, b) => {
        const la = vertById[a[0]]?.label ?? a[0];
        const lb = vertById[b[0]]?.label ?? b[0];
        return la.localeCompare(lb);
      });

      for (const [vertId, slugs] of vertEntries) {
        const v = vertById[vertId];
        indNode.children.push({
          id: vertId,
          label: v?.label ?? vertId,
          type: 'vertical',
          workflow: v?.workflow ?? null,
          companyCount: slugs.length,
          children: slugs.sort().map((slug) => ({
            id: slug,
            label: slug,
            type: 'company',
            children: [],
          })),
        });
      }

      if (indNode.children.length) sectorNode.children.push(indNode);
    }

    if (sectorNode.children.length) root.children.push(sectorNode);
  }

  return root;
}

/** Vertical ids that have ≥1 company matching YC parent (and optional sub-industry filter). */
export function verticalIdsForYcFilter(companies, parentId, industryId = null) {
  const list = Object.values(companies ?? {});
  const parsed = industryId ? parseYcSubIndustryId(industryId) : null;
  const vertIds = new Set();

  for (const c of list) {
    if (!c.vertical_id) continue;
    if (ycParent(c.yc_industries) !== parentId) continue;
    if (parsed) {
      if (parsed.isParentOnly) {
        if (ycSub(c.yc_industries)) continue;
      } else if (ycSub(c.yc_industries) !== parsed.sub) {
        continue;
      }
    }
    vertIds.add(c.vertical_id);
  }

  return vertIds;
}

export function companyMatchesYcIndustry(c, industryId) {
  const { parent, sub, isParentOnly } = parseYcSubIndustryId(industryId);
  if (!parent || ycParent(c.yc_industries) !== parent) return false;
  if (isParentOnly) return !ycSub(c.yc_industries);
  return ycSub(c.yc_industries) === sub;
}
