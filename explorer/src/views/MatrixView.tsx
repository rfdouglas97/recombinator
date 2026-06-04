import { useMemo } from 'react';
import type { CellSelection, DataBundle, FilterState, GapSelection } from '../types';
import { densityColor, sectorColor, useMatrixData } from '../hooks/useMatrixData';

interface Props {
  bundle: DataBundle;
  state: FilterState;
  onChange: (p: Partial<FilterState>) => void;
  onCellClick: (sel: CellSelection | GapSelection) => void;
}

export function MatrixView({ bundle, state, onChange, onCellClick }: Props) {
  const { rows, cols, cellMap, max, grouped } = useMatrixData(bundle, state);

  const colGroups = useMemo(() => {
    if (grouped || state.matrixMode === 'phenotype_industry') {
      return [{ label: '', cols }];
    }
    const groups = new Map<string, typeof cols>();
    for (const c of cols) {
      const g = c.groupLabel ?? 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(c);
    }
    return [...groups.entries()].map(([label, groupCols]) => ({ label, cols: groupCols }));
  }, [cols, grouped, state.matrixMode]);

  function renderCell(rowId: string, colId: string, sectorId?: string) {
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
            borderColor: sectorId && cell.count > 0 ? sectorColor(sectorId, bundle.facets.sectors) : undefined,
          }}
          onClick={() => {
            if (cell.isGap && cell.count === 0) {
              const bm = bundle.facets.businessModels.find((b) => b.id === rowId);
              const vert = bundle.facets.verticals.find((v) => v.id === colId);
              onCellClick({
                kind: 'gap',
                businessModel: rowId,
                businessModelLabel: bm?.label ?? rowId,
                verticalId: colId,
                verticalLabel: vert?.label ?? grouped ? bundle.facets.sectors.find((s) => s.id === colId)?.label ?? colId : colId,
                sectorId: vert?.sector_id ?? colId,
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

  return (
    <>
      <div className="toolbar">
        <label>
          Matrix
          <select
            value={state.matrixMode}
            onChange={(e) =>
              onChange({ matrixMode: e.target.value as FilterState['matrixMode'] })
            }
          >
            <option value="bm_vertical">BM × Vertical</option>
            <option value="phenotype_industry">Phenotype × Industry</option>
          </select>
        </label>
        {state.matrixMode === 'bm_vertical' && (
          <label>
            <input
              type="checkbox"
              checked={state.sectorCollapsed}
              onChange={(e) => onChange({ sectorCollapsed: e.target.checked })}
            />
            Collapse columns by sector
          </label>
        )}
        <label>
          Display
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
      </div>
      <div className="matrix-wrap">
        <table className="matrix-table">
          <thead>
            {colGroups.length > 1 && colGroups[0].label !== '' && (
              <tr className="sector-header">
                <th className="row-header" />
                {colGroups.map((g) => (
                  <th key={g.label} colSpan={g.cols.length}>
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              <th className="row-header">
                {state.matrixMode === 'bm_vertical' ? 'Business model' : 'Phenotype'}
              </th>
              {colGroups.flatMap((g) =>
                g.cols.map((c) => (
                  <th key={c.id} title={c.id}>
                    {c.label.length > 18 ? c.label.slice(0, 16) + '…' : c.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="row-header" title={row.id}>
                  {row.label.length > 28 ? row.label.slice(0, 26) + '…' : row.label}
                </td>
                {colGroups.flatMap((g) =>
                  g.cols.map((c) => renderCell(row.id, c.id, c.sectorId)),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>
          <span className="legend-swatch" style={{ background: densityColor(5, max) }} />
          High density
        </span>
        <span>
          <span className="legend-swatch" style={{ background: 'var(--gap)', border: '1px dashed #f0883e' }} />
          Whitespace (gap)
        </span>
        <span>{bundle.meta.gap_count} gap cells in ontology</span>
      </div>
    </>
  );
}
