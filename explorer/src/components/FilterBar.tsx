import type { DataBundle, FilterState } from '../types';
import { hasActiveSidebarFilters } from '../hooks/useFilterState';

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

  return (
    <div className="sidebar">
      <div className="filter-sidebar-head">
        <span className="filter-sidebar-title">Filters</span>
        <button
          type="button"
          className="filter-reset-btn"
          onClick={onReset}
          disabled={!filtersActive}
          title="Clear batch, sector, industry, and other sidebar filters"
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
          {bundle.facets.batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Sector</label>
        <select
          value={state.sector}
          onChange={(e) => onChange({ sector: e.target.value, industry: '' })}
        >
          <option value="">All sectors</option>
          {bundle.facets.sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label>Industry</label>
        <select value={state.industry} onChange={(e) => onChange({ industry: e.target.value })}>
          <option value="">All industries</option>
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
      <div className="filter-group">
        <label>Min confidence ({state.minConfidence.toFixed(2)})</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={state.minConfidence}
          onChange={(e) => onChange({ minConfidence: parseFloat(e.target.value) })}
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
        {filteredCount} / {bundle.meta.assignment_count} companies match filters
      </p>
    </div>
  );
}
