import { useMemo } from 'react';
import type { DataBundle, FilterState } from '../types';
import { filteredSlugSet } from '../utils/filterCompanies';

export interface MatrixRow {
  id: string;
  label: string;
}

export interface MatrixCol {
  id: string;
  label: string;
  sectorId?: string;
  groupLabel?: string;
}

export interface MatrixCell {
  rowId: string;
  colId: string;
  count: number;
  slugs: string[];
  isGap: boolean;
  isObserved: boolean;
}

// Recombinator: a single coral accent ramp (no per-sector rainbow). Filled
// cells ramp the accent's alpha by relative density; empty cells read as the
// neutral "cell-empty" surface.
const DENSITY_RGB = '242, 84, 45';

export function densityColor(count: number, max: number): string {
  if (count <= 0) return 'var(--cell-empty)';
  const t = Math.min(count / Math.max(max, 1), 1);
  const alpha = 0.18 + t * 0.74;
  return `rgba(${DENSITY_RGB}, ${alpha.toFixed(3)})`;
}

// Border tone for a filled cell — the accent at a higher alpha than its fill.
export function cellBorderColor(): string {
  return `rgba(${DENSITY_RGB}, 0.55)`;
}

export function useMatrixData(bundle: DataBundle, state: FilterState) {
  return useMemo(() => {
    const slugFilter = filteredSlugSet(bundle, state);
    const gapSet = new Set(bundle.matrices.bm_vertical_gaps);

    if (state.matrixMode === 'phenotype_industry') {
      const industryCounts = new Map<string, number>();
      const cells: MatrixCell[] = [];
      const phenotypeRows = state.phenotypeFamily
        ? bundle.facets.phenotypes.filter((p) => p.family === state.phenotypeFamily)
        : bundle.facets.phenotypes;

      for (const [key, data] of Object.entries(bundle.matrices.phenotype_industry)) {
        const filtered = data.slugs.filter((s) => slugFilter.has(s));
        if (filtered.length === 0 && data.count > 0) continue;
        const [phenotypeId, industry] = key.split('|');
        const colKey = industry;
        industryCounts.set(colKey, (industryCounts.get(colKey) ?? 0) + filtered.length);
        cells.push({
          rowId: phenotypeId,
          colId: colKey,
          count: filtered.length,
          slugs: filtered,
          isGap: filtered.length === 0,
          isObserved: data.count > 0,
        });
      }

      const topIndustries = [...industryCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([id]) => id);

      const rows: MatrixRow[] = phenotypeRows.map((p) => ({ id: p.id, label: p.label }));
      const cols: MatrixCol[] = topIndustries.map((id) => ({ id, label: id }));
      const cellMap = new Map(cells.map((c) => [`${c.rowId}|${c.colId}`, c]));
      const max = Math.max(1, ...cells.map((c) => c.count));

      return { rows, cols, cells, cellMap, max, grouped: false };
    }

    // BM × vertical
    const rows: MatrixRow[] = bundle.facets.businessModels.map((bm) => ({
      id: bm.id,
      label: bm.label,
    }));

    let cols: MatrixCol[];
    const cells: MatrixCell[] = [];
    const cellMap = new Map<string, MatrixCell>();

    if (state.sectorCollapsed) {
      cols = bundle.facets.sectors.map((s) => ({ id: s.id, label: s.label, sectorId: s.id }));
      for (const bm of rows) {
        for (const sector of cols) {
          let count = 0;
          const slugs: string[] = [];
          let isGap = false;
          let isObserved = false;

          for (const v of bundle.facets.verticals) {
            if (v.sector_id !== sector.id) continue;
            const key = `${bm.id}|${v.id}`;
            const data = bundle.matrices.bm_vertical[key];
            const inGap = gapSet.has(key);
            if (data) {
              isObserved = true;
              const filtered = data.slugs.filter((s) => slugFilter.has(s));
              count += filtered.length;
              slugs.push(...filtered);
            } else if (inGap) {
              isGap = true;
            }
          }

          const cell: MatrixCell = {
            rowId: bm.id,
            colId: sector.id,
            count,
            slugs,
            isGap: count === 0 && isGap,
            isObserved,
          };
          cells.push(cell);
          cellMap.set(`${bm.id}|${sector.id}`, cell);
        }
      }
    } else {
      let verts = bundle.facets.verticals;
      if (state.sector) verts = verts.filter((v) => v.sector_id === state.sector);
      if (state.industry) verts = verts.filter((v) => v.industry_id === state.industry);

      cols = verts.map((v) => ({
        id: v.id,
        label: v.label,
        sectorId: v.sector_id,
        groupLabel: v.sector_label,
      }));

      for (const bm of rows) {
        for (const v of cols) {
          const key = `${bm.id}|${v.id}`;
          const data = bundle.matrices.bm_vertical[key];
          const inGap = gapSet.has(key);
          const filtered = data ? data.slugs.filter((s) => slugFilter.has(s)) : [];
          const cell: MatrixCell = {
            rowId: bm.id,
            colId: v.id,
            count: filtered.length,
            slugs: filtered,
            isGap: filtered.length === 0 && (inGap || !data),
            isObserved: !!data,
          };
          cells.push(cell);
          cellMap.set(key, cell);
        }
      }
    }

    const max = Math.max(1, ...cells.map((c) => c.count));
    return { rows, cols, cells, cellMap, max, grouped: state.sectorCollapsed };
  }, [bundle, state]);
}
