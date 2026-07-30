import { useMemo } from 'react';
import type { DataBundle, DrawerSelection, FilterState } from '../types';
import { filterCompanies } from '../utils/filterCompanies';
import { computeTrends, FULL_BATCH_MIN, fullBatchLabels } from '../utils/trends';
import type { Insight, TrendDimension, TrendSeries } from '../utils/trends';
import {
  ChartCard,
  MixBars,
  ShareLines,
  Sparkline,
  type ColorMap,
} from '../components/TrendCharts';

interface Props {
  bundle: DataBundle;
  state: FilterState;
  onOpenDrawer: (sel: DrawerSelection) => void;
}

const DIMENSION_LABEL: Record<TrendDimension, string> = {
  bm: 'Business model',
  sector: 'Sector',
  family: 'Phenotype',
  vertical: 'Vertical',
};

/** Stable key→color-slot assignment from the unfiltered corpus, so sidebar
 *  filters never repaint a series the reader has already learned. */
function buildColorMap(series: TrendSeries[], base?: ColorMap): ColorMap {
  const map = new Map(base);
  const used = new Set(map.values());
  let next = 0;
  for (const s of series) {
    if (s.isOther || map.has(s.key)) continue;
    while (used.has(next)) next += 1;
    map.set(s.key, next);
    used.add(next);
  }
  return map;
}

function InsightCard({ insight, onClick }: { insight: Insight; onClick?: () => void }) {
  const arrow = insight.direction === 'up' ? '▲' : '▼';
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      className={`trend-insight${clickable ? '' : ' static'}`}
      onClick={onClick}
      disabled={!clickable}
    >
      <div className="trend-insight-top">
        <span className="trend-insight-chip">{DIMENSION_LABEL[insight.dimension]}</span>
        <span className="trend-insight-delta">
          {arrow} {Math.abs(insight.deltaPts).toFixed(0)} pts
        </span>
      </div>
      <div className="trend-insight-title">{insight.title}</div>
      <div className="trend-insight-detail">{insight.detail}</div>
      <div className="trend-insight-spark">
        <Sparkline values={insight.spark} />
        <span className="trend-insight-spark-label">
          share by batch, {insight.earlyWindow.split('–')[0]}–{insight.lateWindow.split('–').pop()}
        </span>
      </div>
    </button>
  );
}

export function TrendsView({ bundle, state, onOpenDrawer }: Props) {
  // The batch filter is the time axis here — ignore it; honor everything else.
  const companies = useMemo(
    () => filterCompanies(bundle, { ...state, batch: '' }),
    [bundle, state]
  );
  // Batch "fullness" is judged on the unfiltered corpus so sidebar filters
  // narrow the shares without collapsing the time axis.
  const fullBatches = useMemo(
    () => fullBatchLabels(Object.values(bundle.companies), bundle),
    [bundle]
  );
  const trends = useMemo(
    () => computeTrends(companies, bundle, fullBatches),
    [companies, bundle, fullBatches]
  );

  // Color assignments come from the full corpus so filtering never repaints.
  const baseTrends = useMemo(
    () => computeTrends(Object.values(bundle.companies), bundle, fullBatches),
    [bundle, fullBatches]
  );
  const colorMaps = useMemo(
    () => ({
      bm: buildColorMap(trends.bm, buildColorMap(baseTrends.bm)),
      sector: buildColorMap(trends.sector, buildColorMap(baseTrends.sector)),
      family: buildColorMap(trends.family, buildColorMap(baseTrends.family)),
      vertical: buildColorMap(trends.risingVerticals, buildColorMap(baseTrends.risingVerticals)),
    }),
    [trends, baseTrends]
  );

  const filtered = companies.length !== Object.keys(bundle.companies).length;

  const openSeries = (s: TrendSeries, batchIndex?: number) => {
    const slugs =
      batchIndex === undefined ? s.slugsPerBatch.flat() : (s.slugsPerBatch[batchIndex] ?? []);
    if (!slugs.length) return;
    const suffix = batchIndex === undefined ? '' : ` — ${trends.batches[batchIndex].label}`;
    onOpenDrawer({ kind: 'companies', slugs, title: `${s.label}${suffix} (${slugs.length})` });
  };

  const openInsight = (ins: Insight) => {
    if (!ins.slugs.length) return;
    onOpenDrawer({
      kind: 'companies',
      slugs: ins.slugs,
      title: `${ins.label} (${ins.slugs.length})`,
    });
  };

  if (trends.batches.length < 2) {
    return (
      <div className="trends">
        <div className="trend-empty">
          <p>
            Not enough batch history to chart trends yet — {trends.batches.length} batch with{' '}
            {FULL_BATCH_MIN}+ companies under the current filters.
          </p>
          <p className="trend-empty-hint">Loosen the sidebar filters or ingest more batches.</p>
        </div>
      </div>
    );
  }

  const partialNote = trends.partialBatches.length
    ? `${trends.partialBatches.map((b) => `${b.label} (${b.n})`).join(', ')} excluded until ${FULL_BATCH_MIN}+ companies are ingested — they join these charts automatically.`
    : null;

  return (
    <div className="trends">
      <header className="trends-head">
        <div>
          <h2>How YC's preferences are shifting</h2>
          <p className="trends-sub">
            Computed live from {trends.totalCompanies.toLocaleString()} companies across{' '}
            {trends.batches.length} batches ({trends.batches[0].label} →{' '}
            {trends.batches[trends.batches.length - 1].label}). Takeaways regenerate as new company
            data lands.
          </p>
          {partialNote ? <p className="trends-note">{partialNote}</p> : null}
          {trends.offCohortCount > 0 ? (
            <p className="trends-note">
              {trends.offCohortCount} companies from batches outside the study cohort are excluded
              (biased subsamples of historical batches).
            </p>
          ) : null}
          {filtered ? (
            <p className="trends-note">
              Trends reflect the current sidebar filters
              {state.batch ? ' (the batch filter is ignored — batches are the time axis)' : ''}.
            </p>
          ) : null}
        </div>
      </header>

      {trends.insights.length ? (
        <div className="trend-insights">
          {trends.insights.map((ins) => (
            <InsightCard
              key={`${ins.dimension}:${ins.key}`}
              insight={ins}
              onClick={ins.slugs.length ? () => openInsight(ins) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="trends-note">No statistically meaningful shifts under the current filters.</p>
      )}

      <div className="trend-grid">
        <ChartCard
          title="Business model mix by batch"
          subtitle="Share of each batch by primary business model"
          batches={trends.batches}
          series={trends.bm}
        >
          <MixBars
            batches={trends.batches}
            series={trends.bm}
            colorMap={colorMaps.bm}
            onSegmentClick={openSeries}
          />
        </ChartCard>

        <ChartCard
          title="Sector mix by batch"
          subtitle="Share of each batch by taxonomy sector"
          batches={trends.batches}
          series={trends.sector}
        >
          <MixBars
            batches={trends.batches}
            series={trends.sector}
            colorMap={colorMaps.sector}
            onSegmentClick={openSeries}
          />
        </ChartCard>

        <ChartCard
          title="Phenotype family mix by batch"
          subtitle="Share of each batch by product phenotype family"
          batches={trends.batches}
          series={trends.family}
        >
          <MixBars
            batches={trends.batches}
            series={trends.family}
            colorMap={colorMaps.family}
            onSegmentClick={openSeries}
          />
        </ChartCard>

        {trends.risingVerticals.length ? (
          <ChartCard
            title="Verticals on the rise"
            subtitle="Share of batch for the fastest-growing verticals (click a label for companies)"
            batches={trends.batches}
            series={trends.risingVerticals}
          >
            <ShareLines
              batches={trends.batches}
              series={trends.risingVerticals}
              colorMap={colorMaps.vertical}
              onSeriesClick={(s) => openSeries(s)}
            />
          </ChartCard>
        ) : null}
      </div>
    </div>
  );
}
