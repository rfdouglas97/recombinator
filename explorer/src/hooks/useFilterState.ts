import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataBundle, DrawerSelection, FilterState } from '../types';

const DEFAULT: FilterState = {
  view: 'matrix',
  ontologyMode: 'industry_vertical',
  matrixMode: 'bm_sector',
  matrixDisplay: 'both',
  matrixHideEmptyCols: false,
  vizLayout: 'sunburst',
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
  const view = p.get('view');
  if (view === 'ontology' || view === 'matrix') {
    out.view = view as FilterState['view'];
  }
  if (p.get('batch')) out.batch = p.get('batch')!;
  if (p.get('sector')) out.sector = p.get('sector')!;
  const matrix = p.get('matrix');
  if (matrix === 'bm_sector' || matrix === 'bm_industry' || matrix === 'bm_vertical') {
    out.matrixMode = matrix as FilterState['matrixMode'];
  }
  if (p.get('display') === 'density' || p.get('display') === 'gaps' || p.get('display') === 'both') {
    out.matrixDisplay = p.get('display') as FilterState['matrixDisplay'];
  }
  if (p.get('hideEmpty') === '1') out.matrixHideEmptyCols = true;
  return out;
}

function syncUrl(state: FilterState) {
  const p = new URLSearchParams();
  if (state.view !== 'matrix') p.set('view', state.view);
  if (state.batch) p.set('batch', state.batch);
  if (state.sector) p.set('sector', state.sector);
  if (state.matrixMode !== 'bm_sector') p.set('matrix', state.matrixMode);
  if (state.matrixDisplay !== 'both') p.set('display', state.matrixDisplay);
  if (state.matrixHideEmptyCols) p.set('hideEmpty', '1');
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
