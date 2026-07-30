import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BatchInfo, TrendSeries } from '../utils/trends';

/**
 * Categorical series palette (validated with the dataviz six-check validator
 * against the app's white surface: CVD ΔE 9.1 adjacent, normal-vision 19.6).
 * Aqua/yellow/magenta sit below 3:1 contrast on white — the relief channel is
 * the per-chart table view plus in-segment labels, both always available.
 * "Other" is never a hue slot; it wears the neutral gray.
 */
export const SERIES_COLORS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];
export const OTHER_COLOR = '#9c978d';

/** Ink for labels set inside a colored fill, picked by fill luminance. */
function inkOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#1b1a17' : '#ffffff';
}

export type ColorMap = Map<string, number>;

export function seriesColor(s: TrendSeries, colorMap?: ColorMap, fallbackIndex = 0): string {
  if (s.isOther) return OTHER_COLOR;
  const idx = colorMap?.get(s.key) ?? fallbackIndex;
  return SERIES_COLORS[idx % SERIES_COLORS.length];
}

const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/* ---------------------------------- tooltip --------------------------------- */

interface TooltipRow {
  label: string;
  color: string;
  value: string;
  strong?: boolean;
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}

function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="trend-tooltip"
      style={{ left: tip.x, top: tip.y }}
      role="status"
      aria-live="polite"
    >
      <div className="trend-tooltip-title">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className={`trend-tooltip-row${r.strong ? ' strong' : ''}`}>
          <span className="trend-tooltip-key" style={{ background: r.color }} />
          <span className="trend-tooltip-value">{r.value}</span>
          <span className="trend-tooltip-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- chart card ------------------------------- */

interface ChartCardProps {
  title: string;
  subtitle?: string;
  batches: BatchInfo[];
  series: TrendSeries[];
  children: ReactNode;
}

/**
 * Card chrome plus the table-view twin every chart ships with (the WCAG relief
 * channel for sub-3:1 fills — values are always reachable without hover).
 */
export function ChartCard({ title, subtitle, batches, series, children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="trend-card">
      <header className="trend-card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="trend-card-subtitle">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className={`trend-table-toggle${showTable ? ' active' : ''}`}
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
        >
          {showTable ? 'Chart' : 'Table'}
        </button>
      </header>
      {showTable ? (
        <div className="trend-table-wrap">
          <table className="trend-table">
            <thead>
              <tr>
                <th scope="col">Series</th>
                {batches.map((b) => (
                  <th key={b.label} scope="col" title={b.label}>
                    {b.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key}>
                  <th scope="row">{s.label}</th>
                  {batches.map((b, i) => (
                    <td key={b.label}>
                      {fmtPct(s.shares[i])} <span className="trend-table-n">({s.counts[i]})</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function Legend({ series, colorMap }: { series: TrendSeries[]; colorMap?: ColorMap }) {
  return (
    <div className="trend-legend">
      {series.map((s, i) => (
        <span key={s.key} className="trend-legend-item">
          <span
            className="trend-legend-swatch"
            style={{ background: seriesColor(s, colorMap, i) }}
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------ 100% stacked mix ----------------------------- */

interface MixBarsProps {
  batches: BatchInfo[];
  series: TrendSeries[];
  colorMap?: ColorMap;
  onSegmentClick?: (s: TrendSeries, batchIndex: number) => void;
}

/** Horizontal 100%-stacked bar per batch: the part-to-whole mix, oldest first. */
export function MixBars({ batches, series, colorMap, onSegmentClick }: MixBarsProps) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const move = (e: React.MouseEvent, s: TrendSeries, i: number, color: string) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      x: Math.min(e.clientX - rect.left + 12, rect.width - 180),
      y: e.clientY - rect.top + 14,
      title: `${batches[i].label} · ${batches[i].n} companies`,
      rows: [
        {
          label: s.label,
          color,
          value: `${fmtPct(s.shares[i])} (${s.counts[i]})`,
          strong: true,
        },
      ],
    });
  };

  return (
    <div className="trend-mix" ref={wrapRef} onMouseLeave={() => setTip(null)}>
      {batches.map((b, i) => {
        const visible = series.filter((s) => s.counts[i] > 0);
        return (
          <div key={b.label} className="trend-mix-row">
            <div className="trend-mix-label" title={b.label}>
              <span>{b.short}</span>
              <span className="trend-mix-n">{b.n}</span>
            </div>
            <div className="trend-mix-track">
              {visible.map((s, vi) => {
                const color = seriesColor(s, colorMap, series.indexOf(s));
                const share = s.shares[i];
                const last = vi === visible.length - 1;
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`trend-mix-seg${last ? ' last' : ''}`}
                    style={{ flexGrow: share, background: color }}
                    onMouseMove={(e) => move(e, s, i, color)}
                    onFocus={() =>
                      setTip({
                        x: 12,
                        y: 8,
                        title: `${b.label} · ${b.n} companies`,
                        rows: [
                          {
                            label: s.label,
                            color,
                            value: `${fmtPct(share)} (${s.counts[i]})`,
                            strong: true,
                          },
                        ],
                      })
                    }
                    onBlur={() => setTip(null)}
                    onClick={() => onSegmentClick?.(s, i)}
                    aria-label={`${s.label}: ${fmtPct(share)} of ${b.label}`}
                  >
                    {share >= 0.08 ? (
                      <span className="trend-mix-seg-label" style={{ color: inkOn(color) }}>
                        {fmtPct(share)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <Legend series={series} colorMap={colorMap} />
      <ChartTooltip tip={tip} />
    </div>
  );
}

/* --------------------------------- line chart -------------------------------- */

interface ShareLinesProps {
  batches: BatchInfo[];
  series: TrendSeries[];
  colorMap?: ColorMap;
  onSeriesClick?: (s: TrendSeries) => void;
}

const LW = 640;
const LH = 240;
const PAD = { top: 14, right: 150, bottom: 28, left: 44 };

/** Multi-line share-over-batches chart with crosshair + all-series tooltip. */
export function ShareLines({ batches, series, colorMap, onSeriesClick }: ShareLinesProps) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxShare = Math.max(0.02, ...series.flatMap((s) => s.shares));
  const yMax = Math.ceil(maxShare * 1.15 * 20) / 20; // next 5% step
  const plotW = LW - PAD.left - PAD.right;
  const plotH = LH - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (batches.length > 1 ? (i / (batches.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const ticks = useMemo(() => {
    const step = yMax > 0.2 ? 0.1 : 0.05;
    const out: number[] = [];
    for (let v = 0; v <= yMax + 1e-9; v += step) out.push(v);
    return out;
  }, [yMax]);

  // End labels: nudge apart with leader lines when they collide.
  const endLabels = useMemo(() => {
    const items = series
      .map((s, i) => ({
        s,
        color: seriesColor(s, colorMap, i),
        ideal: y(s.shares[s.shares.length - 1] ?? 0),
      }))
      .sort((a, b) => a.ideal - b.ideal);
    const MIN = 16;
    let prev = -Infinity;
    return items.map((it) => {
      const yy = Math.max(it.ideal, prev + MIN);
      prev = yy;
      return { ...it, y: yy };
    });
  }, [series, colorMap, yMax, batches.length]);

  const handleMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || batches.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * LW;
    const i = Math.max(
      0,
      Math.min(batches.length - 1, Math.round(((sx - PAD.left) / plotW) * (batches.length - 1)))
    );
    setHoverX(i);
    const wrapRect = wrap.getBoundingClientRect();
    const rows = series
      .map((s, si) => ({
        label: s.label,
        color: seriesColor(s, colorMap, si),
        value: `${fmtPct(s.shares[i], 1)} (${s.counts[i]})`,
        share: s.shares[i],
      }))
      .sort((a, b) => b.share - a.share)
      .map(({ share: _share, ...r }) => r);
    setTip({
      x: Math.min(e.clientX - wrapRect.left + 14, wrapRect.width - 230),
      y: Math.min(e.clientY - wrapRect.top + 14, wrapRect.height - 30),
      title: `${batches[i].label} · ${batches[i].n} companies`,
      rows,
    });
  };

  const clear = () => {
    setTip(null);
    setHoverX(null);
  };

  return (
    <div className="trend-lines" ref={wrapRef} onMouseLeave={clear}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${LW} ${LH}`}
        role="img"
        aria-label="Share of batch over time"
        onMouseMove={handleMove}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={LW - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="trend-axis-text">
              {fmtPct(t)}
            </text>
          </g>
        ))}
        {batches.map((b, i) => (
          <text key={b.label} x={x(i)} y={LH - 8} textAnchor="middle" className="trend-axis-text">
            {b.short}
          </text>
        ))}
        {hoverX !== null ? (
          <line
            x1={x(hoverX)}
            x2={x(hoverX)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
        ) : null}
        {series.map((s, si) => {
          const color = seriesColor(s, colorMap, si);
          const d = s.shares
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
            .join(' ');
          const lastI = s.shares.length - 1;
          return (
            <g key={s.key}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* end marker: >=8px dot with a 2px surface ring */}
              <circle cx={x(lastI)} cy={y(s.shares[lastI])} r={6} fill="var(--surface)" />
              <circle cx={x(lastI)} cy={y(s.shares[lastI])} r={4} fill={color} />
              {hoverX !== null ? (
                <>
                  <circle cx={x(hoverX)} cy={y(s.shares[hoverX])} r={6} fill="var(--surface)" />
                  <circle cx={x(hoverX)} cy={y(s.shares[hoverX])} r={4} fill={color} />
                </>
              ) : null}
            </g>
          );
        })}
        {endLabels.map((it) => {
          const lastI = it.s.shares.length - 1;
          const lineY = y(it.s.shares[lastI] ?? 0);
          return (
            <g
              key={it.s.key}
              className={onSeriesClick ? 'trend-endlabel clickable' : 'trend-endlabel'}
              onClick={() => onSeriesClick?.(it.s)}
            >
              {Math.abs(it.y - lineY) > 2 ? (
                <line
                  x1={x(lastI) + 8}
                  y1={lineY}
                  x2={LW - PAD.right + 14}
                  y2={it.y}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                />
              ) : null}
              <line
                x1={LW - PAD.right + 16}
                x2={LW - PAD.right + 28}
                y1={it.y}
                y2={it.y}
                stroke={it.color}
                strokeWidth={2}
              />
              <text x={LW - PAD.right + 33} y={it.y + 4} className="trend-endlabel-text">
                {it.s.label.length > 22 ? `${it.s.label.slice(0, 21)}…` : it.s.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={series} colorMap={colorMap} />
      <ChartTooltip tip={tip} />
    </div>
  );
}

/* ---------------------------------- sparkline -------------------------------- */

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 96;
  const H = 28;
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values);
  const span = Math.max(max - min, 0.001);
  const x = (i: number) => 3 + (i / (values.length - 1)) * (W - 6);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (H - 6);
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const lastI = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-spark" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="var(--faint)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(lastI)} cy={y(values[lastI])} r={4.5} fill="var(--surface)" />
      <circle cx={x(lastI)} cy={y(values[lastI])} r={3} fill="var(--accent)" />
    </svg>
  );
}
