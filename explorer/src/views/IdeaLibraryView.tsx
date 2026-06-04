import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CardJudgment, DataBundle, StartupIdeaCard } from '../types';
import { fetchLibrary, generateLibraryCards, saveCardJudgment, archiveCard, restoreCard, type LibraryResponse } from '../api/library';
import { StartupCard } from '../components/StartupCard';

type SortMode = 'goodness' | 'opportunity' | 'human_score' | 'newest' | 'name';
type FilterMode = 'all' | 'unjudged' | 'promising' | 'maybe' | 'low_score' | 'archived';

interface Props {
  bundle: DataBundle;
}

export function IdeaLibraryView({ bundle }: Props) {
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [llmOk, setLlmOk] = useState(false);
  const [sort, setSort] = useState<SortMode>('newest');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [count, setCount] = useState(5);
  const [query, setQuery] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [businessModel, setBusinessModel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const industries = useMemo(() => {
    if (!sectorId) return bundle.facets.industries;
    return bundle.facets.industries.filter((i) => i.sector_id === sectorId);
  }, [bundle, sectorId]);

  const reload = useCallback(async () => {
    try {
      const data = await fetchLibrary(filter === 'archived');
      setLibrary(data);
      setLlmOk(data.llm_configured);
      setApiError(null);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    }
  }, [filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenError(null);
    setGenerating(true);
    setGenProgress(`Generating ${count} startup card${count === 1 ? '' : 's'}…`);
    try {
      const result = await generateLibraryCards({
        count,
        query: query.trim() || undefined,
        sectorId: sectorId || undefined,
        industryId: industryId || undefined,
        businessModel: businessModel || undefined,
      });
      setLibrary(result.library);
      setGenProgress(`Added ${result.new_cards.length} card${result.new_cards.length === 1 ? '' : 's'}`);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
      setGenProgress(null);
    } finally {
      setGenerating(false);
    }
  }, [count, query, sectorId, industryId, businessModel]);

  const handleArchive = useCallback(async (id: string, notes?: string) => {
    setSavingId(id);
    try {
      const result = await archiveCard(id, notes);
      setLibrary(result.library);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }, []);

  const handleRestore = useCallback(async (id: string) => {
    setSavingId(id);
    try {
      const result = await restoreCard(id);
      setLibrary(result.library);
      if (filter === 'archived') {
        await reload();
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }, [filter, reload]);

  const handleJudge = useCallback(async (id: string, judgment: CardJudgment) => {
    setSavingId(id);
    try {
      const result = await saveCardJudgment(id, judgment);
      setLibrary(result.library);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }, []);

  const cards = useMemo(() => {
    if (!library) return [];
    let list: StartupIdeaCard[] = [...library.cards];

    if (filter === 'archived') return list;

    if (filter === 'unjudged') list = list.filter((c) => !c.judgment && c.human_score == null);
    else if (filter === 'low_score') list = list.filter((c) => (c.human_score ?? 6) <= 2);
    else if (filter !== 'all') list = list.filter((c) => c.judgment === filter);

    list.sort((a, b) => {
      if (sort === 'name') return a.startup.name.localeCompare(b.startup.name);
      if (sort === 'newest') return String(b.generated_at).localeCompare(String(a.generated_at));
      if (sort === 'human_score') return (b.human_score ?? 0) - (a.human_score ?? 0);
      if (sort === 'opportunity') {
        return (b.whitespace.opportunity_score ?? 0) - (a.whitespace.opportunity_score ?? 0);
      }
      return (b.scores.goodness_index?.overall ?? 0) - (a.scores.goodness_index?.overall ?? 0);
    });

    return list.map((c, i) => ({ ...c, card_rank: i + 1 }));
  }, [library, sort, filter]);

  if (apiError && !library) {
    return (
      <div className="library-empty">
        <h2>Startup idea library</h2>
        <p>{apiError}</p>
        <pre>npm run explorer:dev</pre>
      </div>
    );
  }

  if (!library) {
    return <div className="loading">Loading startup library…</div>;
  }

  const stats = library.stats;

  return (
    <div className="idea-library">
      <section className={`library-generate-panel ${filter === 'archived' ? 'collapsed' : ''}`}>
        <h2>Generate more cards</h2>
        <p className="generator-hint">
          Pick empty BM × vertical cells, invent startups, add to your library. Judgments save to{' '}
          <code>output/startup-library/judgments.json</code>.
        </p>

        {!llmOk && (
          <div className="generator-banner warn">
            No LLM key in <code>.env</code> — generation disabled.
          </div>
        )}

        <div className="library-generate-grid">
          <div className="filter-group">
            <label htmlFor="lib-count">How many cards</label>
            <input
              id="lib-count"
              type="number"
              min={1}
              max={30}
              value={count}
              onChange={(e) => setCount(Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            />
          </div>
          <div className="filter-group">
            <label htmlFor="lib-sector">Sector</label>
            <select
              id="lib-sector"
              value={sectorId}
              onChange={(e) => {
                setSectorId(e.target.value);
                setIndustryId('');
              }}
            >
              <option value="">Any sector</option>
              {bundle.facets.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="lib-industry">Industry</label>
            <select
              id="lib-industry"
              value={industryId}
              onChange={(e) => setIndustryId(e.target.value)}
              disabled={!industries.length}
            >
              <option value="">Any industry</option>
              {industries.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="lib-bm">Business model</label>
            <select id="lib-bm" value={businessModel} onChange={(e) => setBusinessModel(e.target.value)}>
              <option value="">Any (structurally fit)</option>
              {bundle.facets.businessModels.map((bm) => (
                <option key={bm.id} value={bm.id}>
                  {bm.id} — {bm.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="lib-query">Industry or idea guidance (optional)</label>
          <input
            id="lib-query"
            type="text"
            placeholder="e.g. defense range ops, dental practices, freight brokerage"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !generating && llmOk && handleGenerate()}
          />
        </div>

        <div className="generator-actions">
          <button
            type="button"
            className="btn-accent"
            onClick={handleGenerate}
            disabled={generating || !llmOk}
          >
            {generating ? 'Generating…' : `Generate ${count} card${count === 1 ? '' : 's'}`}
          </button>
        </div>

        {genProgress && !genError && <p className="generator-hint">{genProgress}</p>}
        {genError && <p className="generator-error">{genError}</p>}
        {apiError && library && <p className="generator-error">{apiError}</p>}
      </section>

      <div className="library-toolbar">
        <div className="library-stats">
          {filter === 'archived' ? (
            <>
              <strong>{library.card_count}</strong> archived
            </>
          ) : (
            <>
              <strong>{library.card_count}</strong> active · <strong>{library.archived_count ?? stats?.archived ?? 0}</strong>{' '}
              archived · <strong>{stats?.judged ?? 0}</strong> judged
            </>
          )}
        </div>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="newest">Newest first</option>
            <option value="goodness">AI goodness</option>
            <option value="human_score">Your score</option>
            <option value="opportunity">Whitespace opportunity</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label>
          Filter
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)}>
            <option value="all">All</option>
            <option value="unjudged">Unjudged</option>
            <option value="promising">Promising</option>
            <option value="maybe">Maybe</option>
            <option value="low_score">Low score</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>

      {!cards.length ? (
        <p className="library-empty-filter">
          {filter === 'archived'
            ? 'No archived cards yet — reject bad ideas to send them here.'
            : 'No cards yet — use the form above to generate your first batch.'}
        </p>
      ) : (
        <div className="startup-card-grid">
          {cards.map((card) => (
            <StartupCard
              key={card.id}
              card={card}
              matrixGapCount={bundle.meta.gap_count}
              onJudge={filter === 'archived' ? undefined : handleJudge}
              onArchive={filter === 'archived' ? undefined : handleArchive}
              onRestore={filter === 'archived' ? handleRestore : undefined}
              archived={filter === 'archived'}
              saving={savingId === card.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
