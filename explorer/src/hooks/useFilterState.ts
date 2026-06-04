import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataBundle, DrawerSelection, FilterState } from '../types';

const DEFAULT: FilterState = {
  view: 'matrix',
  ontologyMode: 'industry_vertical',
  matrixMode: 'bm_vertical',
  matrixDisplay: 'both',
  vizLayout: 'sunburst',
  sectorCollapsed: true,
  ontologyFocusId: null,
  batch: '',
  sector: '',
  industry: '',
  phenotypeFamily: '',
  businessModel: '',
  minConfidence: 0,
  search: '',
};

function parseUrl(): Partial<FilterState> {
  const p = new URLSearchParams(window.location.search);
  const out: Partial<FilterState> = {};
  if (p.get('view') === 'ontology' || p.get('view') === 'matrix' || p.get('view') === 'library') {
    out.view = p.get('view') as FilterState['view'];
  }
  if (p.get('batch')) out.batch = p.get('batch')!;
  if (p.get('sector')) out.sector = p.get('sector')!;
  if (p.get('matrix') === 'phenotype_industry' || p.get('matrix') === 'bm_vertical') {
    out.matrixMode = p.get('matrix') as FilterState['matrixMode'];
  }
  if (p.get('display') === 'density' || p.get('display') === 'gaps' || p.get('display') === 'both') {
    out.matrixDisplay = p.get('display') as FilterState['matrixDisplay'];
  }
  return out;
}

function syncUrl(state: FilterState) {
  const p = new URLSearchParams();
  if (state.view !== 'matrix') p.set('view', state.view);
  if (state.batch) p.set('batch', state.batch);
  if (state.sector) p.set('sector', state.sector);
  if (state.matrixMode !== 'bm_vertical') p.set('matrix', state.matrixMode);
  if (state.matrixDisplay !== 'both') p.set('display', state.matrixDisplay);
  const qs = p.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function useFilterState(_bundle: DataBundle | null) {
  const [state, setState] = useState<FilterState>(() => ({ ...DEFAULT, ...parseUrl() }));
  const [drawer, setDrawer] = useState<DrawerSelection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    syncUrl(state);
  }, [state]);

  const patch = useCallback((partial: Partial<FilterState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  const openDrawer = useCallback((sel: DrawerSelection) => {
    setDrawer(sel);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  return useMemo(
    () => ({ state, patch, drawer, drawerOpen, openDrawer, closeDrawer, setDrawer }),
    [state, patch, drawer, drawerOpen, openDrawer, closeDrawer],
  );
}
