import { useMemo } from 'react';
import type { CellSelection, DataBundle, FilterState, GapSelection } from '../types';
import {
  cellBorderColor,
  densityColor,
  resolveGapVertical,
  useMatrixData,
} from '../hooks/useMatrixData';

interface ColGroup {
  id: string;
  label: string;
  cols: ReturnType<typeof useMatrixData>['cols'];
}

interface Props {
  bundle: DataBundle;
  state: FilterState;
  onChange: (p: Partial<FilterState>) => void;
  onCellClick: (sel: CellSelection | GapSelection) => void;
}

const BM_GAP_MODES = new Set<FilterState['matrixMode']>(['bm_sector', 'bm_industry', 'bm_vertical']);

function columnHasCompanies(
  colId: string,
  rows: ReturnType<typeof useMatrixData>['rows'],
  cellMap: ReturnType<typeof useMatrixData>['cellMap'],
): boolean {
  return rows.some((row) => (cellMap.get(`${row.id}|${colId}`)?.count ?? 0) > 0);
}

export function MatrixView({ bundle, state, onChange, onCellClick }: Props) {
  const { rows, cols, cellMap, max } = useMatrixData(bundle, state);

  const visibleCols = useMemo(() => {
    if (!state.matrixHideEmptyCols) return cols;
    return cols.filter((c) => columnHasCompanies(c.id, rows, cellMap));
  }, [cols, rows, cellMap, state.matrixHideEmptyCols]);

  const colGroups = useMemo((): ColGroup[] => {
    if (state.matrixMode === 'bm_sector') {
      return [{ id: '_all', label: '', cols: visibleCols }];
    }
    const groups = new Map<string, typeof visibleCols>();
    for (const c of visibleCols) {
      const g = c.groupLabel ?? 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(c);
    }
    return [...groups.entries()].map(([label, groupCols]) => ({
      id: groupCols[0]?.sectorId ?? label,
      label,
      cols: groupCols,
    }));
  }, [visibleCols, state.matrixMode]);

  const showSectorHeader = colGroups.length > 1 && colGroups[0].label !== '';

  function renderCell(rowId: string, colId: string) {
    const cell = cellMap.get(`${rowId}|${colId}`);
    if (!cell) return <td key={`${rowId}-${colId}`} />;

    const showGap =
      state.matrixDisplay === 'gaps' || (state.matrixDisplay === 'both' && cell.isGap);
    const showDensity =
      state.matrixDisplay === 'density' || (state.matrixDisplay === 'both' && cell.count > 0);

    if (state.matrixDisplay === 'gaps' && !cell.isGap && cell.count === 0) {
      return <td key={`${rowId}-${colId}`}><div className="matrix-cell" style={{ background: 'transparent' }} /></td>;
    }

    const bg =
      showDensity && cell.count > 0
        ? densityColor(cell.count, max)
        : showGap && cell.isGap
          ? 'var(--gap)'
          : 'var(--density-low)';

    const className = [
      'matrix-cell',
      showGap && cell.isGap ? 'gap-only' : '',
      state.matrixDisplay === 'both' && cell.isGap && cell.count > 0 ? 'gap-outline' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <td key={`${rowId}-${colId}`} title={`${cell.count} companies`}>
        <div
          className={className}
          style={{
            background: bg,
            borderColor: cell.count > 0 ? cellBorderColor() : undefined,
          }}
          onClick={() => {
            if (cell.isGap && cell.count === 0) {
              const bm = bundle.facets.businessModels.find((b) => b.id === rowId);
              const resolved = BM_GAP_MODES.has(state.matrixMode)
                ? resolveGapVertical(bundle, rowId, colId, state.matrixMode)
                : null;
              const vert = bundle.facets.verticals.find((v) => v.id === colId);
              const sector = bundle.facets.sectors.find((s) => s.id === colId);
              onCellClick({
                kind: 'gap',
                businessModel: rowId,
                businessModelLabel: bm?.label ?? rowId,
                verticalId: resolved?.verticalId ?? colId,
                verticalLabel:
                  resolved?.verticalLabel ??
                  vert?.label ??
                  bundle.facets.industries.find((i) => i.id === colId)?.label ??
                  sector?.label ??
                  colId,
                sectorId: resolved?.sectorId ?? vert?.sector_id ?? sector?.id,
              });
            } else {
              onCellClick({
                kind: 'cell',
                rowId,
                colId,
                slugs: cell.slugs,
                count: cell.count,
                isGap: cell.isGap,
              });
            }
          }}
        />
      </td>
    );
  }

  const sectorFilterDimsMatrix =
    BM_GAP_MODES.has(state.matrixMode) && Boolean(state.sector || state.industry);

  return (
    <>
      {sectorFilterDimsMatrix && (
        <p className="matrix-filter-hint">
          Sidebar sector/industry filter applies to the company list only — matrix density shows all
          sectors. Clear the Sector filter to narrow the list.
        </p>
      )}
      <div className="toolbar">
        <label>
          <span className="toolbar-key">Matrix</span>
          <select
            value={state.matrixMode}
            onChange={(e) =>
              onChange({ matrixMode: e.target.value as FilterState['matrixMode'] })
            }
          >
            <option value="bm_sector">BM × Sector</option>
            <option value="bm_industry">BM × Sub-industry</option>
            <option value="bm_vertical">BM × Vertical</option>
          </select>
        </label>
        <label>
          <span className="toolbar-key">Display</span>
          <select
            value={state.matrixDisplay}
            onChange={(e) =>
              onChange({ matrixDisplay: e.target.value as FilterState['matrixDisplay'] })
            }
          >
            <option value="both">Density + gaps</option>
            <option value="density">Density only</option>
            <option value="gaps">Gaps / whitespace only</option>
          </select>
        </label>
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={state.matrixHideEmptyCols}
            onChange={(e) => onChange({ matrixHideEmptyCols: e.target.checked })}
          />
          Hide empty columns
        </label>
      </div>
      <div className="matrix-wrap">
        <table
          className={`matrix-table${showSectorHeader ? ' matrix-table--grouped' : ''}${state.matrixMode === 'bm_sector' ? ' matrix-table--sector-cols' : ''}`}
        >
          <thead>
            {showSectorHeader && (
              <tr className="sector-header">
                <th className="row-header sector-corner" />
                {colGroups.map((g) => (
                  <th
                    key={g.id}
                    colSpan={g.cols.length}
                    className="sector-header-cell"
                    title={g.label}
                  >
                    <span className="sector-header-title">{g.label}</span>
                  </th>
                ))}
              </tr>
            )}
            <tr className="industry-header">
              <th className="row-header corner-header">Business model</th>
              {colGroups.flatMap((g) =>
                g.cols.map((c) => (
                  <th
                    key={c.id}
                    className={
                      state.matrixMode === 'bm_sector' ? 'col-header col-header-sector' : 'col-header'
                    }
                    title={c.id}
                  >
                    <span className="col-header-label">{c.label}</span>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="row-header" title={row.id}>
                  {row.label}
                </td>
                {colGroups.flatMap((g) => g.cols.map((c) => renderCell(row.id, c.id)))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>
          <span className="legend-swatch" style={{ background: densityColor(max, max) }} />
          High density
        </span>
        <span>
          <span className="legend-swatch gap-only" />
          Whitespace (gap)
        </span>
        <span>
          <span className="legend-swatch" style={{ boxShadow: '0 0 0 1.5px var(--ring)' }} />
          Cross-listed
        </span>
        <span>{bundle.meta.gap_count} gap cells in ontology</span>
      </div>
    </>
  );
}
