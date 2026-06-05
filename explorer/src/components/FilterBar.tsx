import { useMemo } from 'react';
import type { DataBundle, FilterState } from '../types';
import { hasActiveSidebarFilters } from '../hooks/useFilterState';
import { filterCompanies } from '../utils/filterCompanies';

function batchSortKey(batch: string) {
  const m = batch.match(/^(Winter|Spring|Summer|Fall)\s+(\d{4})$/);
  if (!m) return batch;
  const season = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 }[m[1] as keyof typeof season] ?? 9;
  return `${m[2]}-${season}-${batch}`;
}

/** All batches with ≥1 matching company; cohort order when available, else chrono. */
function orderedBatchOptions(
  batchCounts: Map<string, number>,
  cohortBatches: string[] | undefined,
  facetBatches: string[],
) {
  const withCounts = [...batchCounts.entries()].filter(([, n]) => n > 0).map(([b]) => b);
  const order = cohortBatches?.length ? cohortBatches : facetBatches;
  if (order.length) {
    const inOrder = order.filter((b) => (batchCounts.get(b) ?? 0) > 0);
    const extras = withCounts
      .filter((b) => !order.includes(b))
      .sort((a, b) => batchSortKey(a).localeCompare(batchSortKey(b)));
    return [...inOrder, ...extras];
  }
  return withCounts.sort((a, b) => batchSortKey(a).localeCompare(batchSortKey(b)));
}

interface Props {
  bundle: DataBundle;
  state: FilterState;
  onChange: (p: Partial<FilterState>) => void;
  onReset: () => void;
  filteredCount: number;
}

export function FilterBar({ bundle, state, onChange, onReset, filteredCount }: Props) {
  const filtersActive = hasActiveSidebarFilters(state);
  const industries = state.sector
    ? bundle.facets.industries.filter((i) => i.sector_id === state.sector)
    : bundle.facets.industries;

  const batchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filterCompanies(bundle, { ...state, batch: '' })) {
      if (!c.batch) continue;
      counts.set(c.batch, (counts.get(c.batch) ?? 0) + 1);
    }
    return counts;
  }, [bundle, state]);

  const batchOptions = useMemo(
    () => orderedBatchOptions(batchCounts, bundle.meta.cohort_batches, bundle.facets.batches),
    [batchCounts, bundle.meta.cohort_batches, bundle.facets.batches],
  );

  return (
    <div className="sidebar">
      <div className="filter-sidebar-head">
        <span className="filter-sidebar-title">Filters</span>
        <button
          type="button"
          className="filter-reset-btn"
          onClick={onReset}
          disabled={!filtersActive}
          title="Clear batch, YC industry, sub-industry, and other sidebar filters"
        >
          Reset filters
        </button>
      </div>
      <p className="filter-sidebar-hint">Applies to gap matrix and ontology only.</p>
      <div className="filter-group">
        <label>Search</label>
        <input
          type="text"
          placeholder="Name, slug, tagline…"
          value={state.search}
          onChange={(e) => onChange({ search: e.target.value })}
        />
      </div>
      <div className="filter-group">
        <label>Batch</label>
        <select value={state.batch} onChange={(e) => onChange({ batch: e.target.value })}>
          <option value="">All batches</option>
          {batchOptions.map((b) => (
            <option key={b} value={b}>
              {b} ({batchCounts.get(b)})
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Industry</label>
        <select
          value={state.sector}
          onChange={(e) => onChange({ sector: e.target.value, industry: '' })}
        >
          <option value="">All industries</option>
          {bundle.facets.sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Sub-industry</label>
        <select value={state.industry} onChange={(e) => onChange({ industry: e.target.value })}>
          <option value="">All sub-industries</option>
          {industries.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Phenotype family</label>
        <select value={state.phenotypeFamily} onChange={(e) => onChange({ phenotypeFamily: e.target.value })}>
          <option value="">All families</option>
          {bundle.facets.phenotypeFamilies.map((f) => (
            <option key={f} value={f}>
              {f.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Business model</label>
        <select value={state.businessModel} onChange={(e) => onChange({ businessModel: e.target.value })}>
          <option value="">All BMs</option>
          {bundle.facets.businessModels.map((bm) => (
            <option key={bm.id} value={bm.id}>
              {bm.id}: {bm.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
        {filteredCount} / {bundle.meta.assignment_count} companies match filters
      </p>
    </div>
  );
}
