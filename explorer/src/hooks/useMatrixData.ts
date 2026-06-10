import { useMemo } from 'react';
import type { DataBundle, FilterState, MatrixMode } from '../types';
import { filteredSlugSet } from '../utils/filterCompanies';
import { verticalIdsForYcIndustry, verticalIdsForYcParent, ycParent } from '../utils/ycIndustries';

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

function sectorLabel(bundle: DataBundle, sectorId: string): string {
  return bundle.facets.sectors.find((s) => s.id === sectorId)?.label ?? sectorId;
}

function aggregateBmCells(
  bundle: DataBundle,
  bmId: string,
  verticals: DataBundle['facets']['verticals'],
  colId: string,
  slugFilter: Set<string>,
  gapSet: Set<string>
): MatrixCell {
  let count = 0;
  const slugs: string[] = [];
  let isGap = false;
  let isObserved = false;

  for (const v of verticals) {
    const key = `${bmId}|${v.id}`;
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

  return {
    rowId: bmId,
    colId,
    count,
    slugs,
    isGap: count === 0 && isGap,
    isObserved,
  };
}

/** Pick a BM × vertical gap inside an aggregated industry (or sector) column. */
export function resolveGapVertical(
  bundle: DataBundle,
  bmId: string,
  colId: string,
  mode: Extract<MatrixMode, 'bm_sector' | 'bm_industry' | 'bm_vertical'>
): { verticalId: string; verticalLabel: string; sectorId: string } | null {
  const gapSet = new Set(bundle.matrices.bm_vertical_gaps);
  if (mode === 'bm_vertical') {
    const v = bundle.facets.verticals.find((x) => x.id === colId);
    if (!v) return null;
    const sectorId = ycParent(
      Object.values(bundle.companies).find((c) => c.vertical_id === v.id)?.yc_industries
    );
    return { verticalId: v.id, verticalLabel: v.label, sectorId: sectorId ?? '' };
  }
  const vertIdSet =
    mode === 'bm_sector'
      ? verticalIdsForYcParent(bundle.companies, colId)
      : verticalIdsForYcIndustry(bundle.companies, colId);
  const verts = bundle.facets.verticals.filter((v) => vertIdSet.has(v.id));
  const sectorId = mode === 'bm_sector' ? colId : (colId.split('::')[0] ?? '');
  for (const v of verts) {
    if (gapSet.has(`${bmId}|${v.id}`)) {
      return { verticalId: v.id, verticalLabel: v.label, sectorId };
    }
  }
  const v = verts[0];
  return v ? { verticalId: v.id, verticalLabel: v.label, sectorId } : null;
}

export function useMatrixData(bundle: DataBundle, state: FilterState) {
  return useMemo(() => {
    const slugFilter = filteredSlugSet(bundle, state);
    const gapSet = new Set(bundle.matrices.bm_vertical_gaps);

    const rows: MatrixRow[] = bundle.facets.businessModels.map((bm) => ({
      id: bm.id,
      label: bm.label,
    }));

    const cells: MatrixCell[] = [];
    const cellMap = new Map<string, MatrixCell>();

    if (state.matrixMode === 'bm_sector') {
      const sectors = state.sector
        ? bundle.facets.sectors.filter((s) => s.id === state.sector)
        : bundle.facets.sectors;
      const cols: MatrixCol[] = sectors.map((s) => ({
        id: s.id,
        label: s.label,
        sectorId: s.id,
      }));

      for (const bm of rows) {
        for (const sec of cols) {
          const vertIdSet = verticalIdsForYcParent(bundle.companies, sec.id, slugFilter);
          const verts = bundle.facets.verticals.filter((v) => vertIdSet.has(v.id));
          const cell = aggregateBmCells(bundle, bm.id, verts, sec.id, slugFilter, gapSet);
          cells.push(cell);
          cellMap.set(`${bm.id}|${sec.id}`, cell);
        }
      }

      const max = Math.max(1, ...cells.map((c) => c.count));
      return { rows, cols, cells, cellMap, max, grouped: false };
    }

    if (state.matrixMode === 'bm_industry') {
      let industries = bundle.facets.industries;
      if (state.sector) industries = industries.filter((i) => i.sector_id === state.sector);
      if (state.industry) industries = industries.filter((i) => i.id === state.industry);
      const cols: MatrixCol[] = industries.map((ind) => ({
        id: ind.id,
        label: ind.label,
        sectorId: ind.sector_id,
        groupLabel: sectorLabel(bundle, ind.sector_id),
      }));

      for (const bm of rows) {
        for (const ind of cols) {
          const vertIdSet = verticalIdsForYcIndustry(bundle.companies, ind.id, slugFilter);
          const verts = bundle.facets.verticals.filter((v) => vertIdSet.has(v.id));
          const cell = aggregateBmCells(bundle, bm.id, verts, ind.id, slugFilter, gapSet);
          cells.push(cell);
          cellMap.set(`${bm.id}|${ind.id}`, cell);
        }
      }

      const max = Math.max(1, ...cells.map((c) => c.count));
      return { rows, cols, cells, cellMap, max, grouped: true };
    }

    // BM × workflow vertical
    let vertIdSet: Set<string> | null = null;
    if (state.sector) {
      vertIdSet = verticalIdsForYcParent(bundle.companies, state.sector, slugFilter);
      if (state.industry) {
        const subSet = verticalIdsForYcIndustry(bundle.companies, state.industry, slugFilter);
        vertIdSet = new Set([...vertIdSet].filter((id) => subSet.has(id)));
      }
    } else if (state.industry) {
      vertIdSet = verticalIdsForYcIndustry(bundle.companies, state.industry, slugFilter);
    }
    const verts = vertIdSet
      ? bundle.facets.verticals.filter((v) => vertIdSet!.has(v.id))
      : bundle.facets.verticals;

    const cols: MatrixCol[] = verts.map((v) => ({
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

    const max = Math.max(1, ...cells.map((c) => c.count));
    return { rows, cols, cells, cellMap, max, grouped: false };
  }, [bundle, state]);
}
