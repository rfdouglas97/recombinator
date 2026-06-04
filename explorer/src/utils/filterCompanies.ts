import type { Company, DataBundle, Filters } from '../types';

export function filterCompanies(bundle: DataBundle, filters: Filters): Company[] {
  const q = filters.search.trim().toLowerCase();
  return Object.values(bundle.companies).filter((c) => {
    if (filters.batch && c.batch !== filters.batch) return false;
    if (filters.sector && c.vertical_sector_id !== filters.sector) return false;
    if (filters.industry) {
      const v = bundle.facets.verticals.find((x) => x.id === c.vertical_id);
      if (v?.industry_id !== filters.industry) return false;
    }
    if (filters.phenotypeFamily && c.phenotype_family !== filters.phenotypeFamily) return false;
    if (filters.businessModel && !c.business_models.includes(filters.businessModel)) return false;
    if (filters.minConfidence > 0 && (c.confidence ?? 0) < filters.minConfidence) return false;
    if (q) {
      const hay = [c.name, c.slug, c.one_liner, c.industry_sub_vertical, c.phenotype_primary_label]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
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
