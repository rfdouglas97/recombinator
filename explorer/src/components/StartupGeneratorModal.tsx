import { useCallback, useEffect, useState } from 'react';
import type { DataBundle, GeneratedStartup } from '../types';
import { checkGeneratorHealth, discoverStartup } from '../api/generator';

interface Props {
  bundle: DataBundle;
  open: boolean;
  onClose: () => void;
}

export function StartupGeneratorModal({ bundle, open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<GeneratedStartup | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [llmOk, setLlmOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rollSeed, setRollSeed] = useState(0);

  useEffect(() => {
    if (!open) return;
    checkGeneratorHealth()
      .then((h) => {
        setApiOk(true);
        setLlmOk(h.llm_configured);
      })
      .catch(() => {
        setApiOk(false);
        setLlmOk(false);
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const seed = Date.now() + rollSeed;
      const generated = await discoverStartup({
        query: query.trim() || undefined,
        seed,
      });
      setResult(generated);
      setRollSeed((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [query, rollSeed]);

  if (!open) return null;

  const gap = result?.selected_gap;
  const guided = Boolean(query.trim());

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal startup-generator-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="generator-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="generator-title">Startup Generator</h2>
            <p className="modal-subtitle">
              We pick an empty BM × vertical cell in the matrix and invent a YC startup for it — you get the
              whitespace reveal plus the company.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {apiOk === false && (
          <div className="generator-banner error">
            Generator API not running. Start with <code>npm run explorer:dev</code> from the project root.
          </div>
        )}
        {apiOk && !llmOk && (
          <div className="generator-banner warn">
            No LLM key in <code>.env</code> — set ANTHROPIC_API_KEY or OPENAI_API_KEY to generate.
          </div>
        )}

        <div className="modal-body generator-form">
          <div className="filter-group">
            <label htmlFor="gen-query">Target industry or idea (optional)</label>
            <input
              id="gen-query"
              type="text"
              placeholder="e.g. dental practices, freight brokerage — leave blank for a random whitespace"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && llmOk && handleGenerate()}
            />
            <p className="generator-hint">
              {guided
                ? 'We’ll find the best-matching empty cell for your hint, then generate.'
                : 'No hint? We’ll drop you into a valid empty cell at random — structurally fit pairings only.'}
            </p>
          </div>

          <div className="generator-actions">
            <button
              type="button"
              className="btn-accent"
              onClick={handleGenerate}
              disabled={loading || !llmOk || !apiOk}
            >
              {loading ? 'Generating…' : result ? 'Generate another' : 'Generate startup'}
            </button>
          </div>

          {error && <p className="generator-error">{error}</p>}

          {gap && result && (
            <section className="generator-whitespace-reveal">
              <h3>Whitespace</h3>
              <div className="gap-card">
                <p className="whitespace-cell">
                  <strong>{gap.business_model_label}</strong> × <strong>{gap.vertical_label}</strong>
                </p>
                <p className="generator-hint">
                  {gap.sector_label}
                  {gap.workflow ? ` · ${gap.workflow}` : ''}
                  {' · '}
                  {result.selection_method === 'best_match' ? 'matched your hint' : 'random valid gap'}
                </p>
                <p className="generator-hint">
                  {bundle.meta.gap_count.toLocaleString()} empty cells in the matrix — zero YC companies here today.
                </p>
              </div>
            </section>
          )}

          {result && (
            <section className="generator-result">
              <h3>{result.record.name}</h3>
              <p className="result-oneliner">{result.record.one_liner}</p>
              <div className="chips">
                <span className="chip">{result.record.target_cell.business_model}</span>
                <span className="chip">{result.record.target_cell.vertical_id}</span>
                <span className="chip">{result.record.phenotype_primary_id}</span>
                {!result.validation.valid && <span className="chip warn">validation warnings</span>}
              </div>
              <p>{result.record.long_description}</p>
              <p>
                <strong>Sells:</strong> {result.record.what_they_sell}
              </p>
              <p>
                <strong>AI play:</strong> {result.record.ai_play}
              </p>
              <p>
                <strong>Who pays:</strong> {result.record.who_pays}
              </p>
              <p className="desc">
                <strong>Rationale:</strong> {result.record.generation_rationale}
              </p>
              {!result.validation.valid && (
                <p className="generator-error">{result.validation.errors.join('; ')}</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
