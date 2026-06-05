import type { Company, DataBundle, Filters } from '../types';
import { companyMatchesYcIndustry, ycParent } from './ycIndustries';

function companyFilterHaystack(c: Company, bundle: DataBundle): string {
  const v = bundle.facets.verticals.find((x) => x.id === c.vertical_id);
  return [
    c.name,
    c.slug,
    c.one_liner,
    c.industry_sub_vertical,
    c.phenotype_primary_label,
    c.vertical_label,
    c.vertical_id,
    v?.industry_label,
    v?.sector_label,
    ...(c.yc_industries ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function filterCompanies(bundle: DataBundle, filters: Filters): Company[] {
  const q = filters.search.trim().toLowerCase();
  return Object.values(bundle.companies).filter((c) => {
    if (filters.batch && c.batch !== filters.batch) return false;
    if (filters.sector && ycParent(c.yc_industries) !== filters.sector) return false;
    if (filters.industry && !companyMatchesYcIndustry(c.yc_industries, filters.industry)) return false;
    if (filters.phenotypeFamily && c.phenotype_family !== filters.phenotypeFamily) return false;
    if (filters.businessModel && !c.business_models.includes(filters.businessModel)) return false;
    if (filters.minConfidence > 0 && (c.confidence ?? 0) < filters.minConfidence) return false;
    if (q && !companyFilterHaystack(c, bundle).includes(q)) return false;
    return true;
  });
}

export function filteredSlugSet(bundle: DataBundle, filters: Filters): Set<string> {
  return new Set(filterCompanies(bundle, filters).map((c) => c.slug));
}

/** Ignore sector/industry for matrix density or ontology structure (keep all branches visible). */
export function slugSetIgnoringSectorIndustry(bundle: DataBundle, filters: Filters): Set<string> {
  return filteredSlugSet(bundle, { ...filters, sector: '', industry: '' });
}

/** @deprecated use slugSetIgnoringSectorIndustry */
export const matrixDensitySlugSet = slugSetIgnoringSectorIndustry;
