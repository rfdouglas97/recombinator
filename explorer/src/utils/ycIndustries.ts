export const YC_PARENT_ONLY_SUB = '__general__';

export function ycParent(ycIndustries: string[] | undefined): string | null {
  return ycIndustries?.[0] ?? null;
}

export function ycSub(ycIndustries: string[] | undefined): string | null {
  return ycIndustries?.[1] ?? null;
}

export function parseYcSubIndustryId(id: string) {
  const idx = id.indexOf('::');
  if (idx === -1) return { parent: null as string | null, sub: id, isParentOnly: false };
  const parent = id.slice(0, idx);
  const sub = id.slice(idx + 2);
  return {
    parent,
    sub: sub === YC_PARENT_ONLY_SUB ? null : sub,
    isParentOnly: sub === YC_PARENT_ONLY_SUB,
  };
}

export function companyMatchesYcIndustry(
  ycIndustries: string[] | undefined,
  industryId: string
): boolean {
  const { parent, sub, isParentOnly } = parseYcSubIndustryId(industryId);
  if (!parent || ycParent(ycIndustries) !== parent) return false;
  if (isParentOnly) return !ycSub(ycIndustries);
  return ycSub(ycIndustries) === sub;
}

export function verticalIdsForYcParent(
  companies: Record<string, { slug: string; vertical_id?: string; yc_industries?: string[] }>,
  parentId: string,
  slugFilter?: Set<string>
): Set<string> {
  const vertIds = new Set<string>();
  for (const c of Object.values(companies)) {
    if (slugFilter && !slugFilter.has(c.slug)) continue;
    if (!c.vertical_id) continue;
    if (ycParent(c.yc_industries) !== parentId) continue;
    vertIds.add(c.vertical_id);
  }
  return vertIds;
}

export function verticalIdsForYcIndustry(
  companies: Record<string, { slug: string; vertical_id?: string; yc_industries?: string[] }>,
  industryId: string,
  slugFilter?: Set<string>
): Set<string> {
  const vertIds = new Set<string>();
  for (const c of Object.values(companies)) {
    if (slugFilter && !slugFilter.has(c.slug)) continue;
    if (!c.vertical_id) continue;
    if (!companyMatchesYcIndustry(c.yc_industries, industryId)) continue;
    vertIds.add(c.vertical_id);
  }
  return vertIds;
}
