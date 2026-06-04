import { useState, type ReactNode } from 'react';
import type { CardJudgment, StartupIdeaCard } from '../types';

interface Props {
  card: StartupIdeaCard;
  matrixGapCount?: number;
  onJudge?: (id: string, judgment: CardJudgment) => void;
  onArchive?: (id: string, notes?: string) => void;
  onRestore?: (id: string) => void;
  archived?: boolean;
  saving?: boolean;
}

function preview(text: string | undefined | null, max = 90) {
  if (!text) return '';
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
}

function CardDrawer({
  title,
  children,
  previewText,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  previewText?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`card-drawer ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="card-drawer-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="card-drawer-title">{title}</span>
        <span className="card-drawer-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {!open && previewText ? <p className="card-drawer-preview">{previewText}</p> : null}
      {open ? <div className="card-drawer-body">{children}</div> : null}
    </div>
  );
}

export function StartupCard({ card, matrixGapCount, onJudge, onArchive, onRestore, archived, saving }: Props) {
  const { whitespace, startup, scores } = card;
  const gapCount = whitespace.matrix_gap_count ?? matrixGapCount;
  const [notes, setNotes] = useState(card.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(Boolean(card.notes));

  const submit = (partial: CardJudgment) => {
    onJudge?.(card.id, {
      verdict: partial.verdict ?? card.judgment ?? null,
      human_score: partial.human_score ?? card.human_score ?? null,
      notes: partial.notes ?? notes,
    });
  };

  return (
    <article className="startup-card">
      <header className="startup-card-header">
        <span className="card-rank">#{card.card_rank}</span>
        {scores.goodness_index && (
          <span className={`chip goodness-${scores.goodness_index.band}`}>
            AI {Math.round(scores.goodness_index.overall)}
          </span>
        )}
        {card.human_score != null && (
          <span className="chip human-score">You: {card.human_score}/5</span>
        )}
        {card.judgment && <span className={`chip judgment-${card.judgment}`}>{card.judgment}</span>}
      </header>

      <section className="generator-whitespace-reveal">
        <h3>Whitespace</h3>
        <div className="gap-card">
          <p className="whitespace-cell">
            <strong>{whitespace.business_model_label}</strong> × <strong>{whitespace.vertical_label}</strong>
          </p>
          <p className="generator-hint">
            {whitespace.sector_label}
            {whitespace.workflow ? ` · ${whitespace.workflow}` : ''}
            {whitespace.opportunity_rank != null ? ` · rank #${whitespace.opportunity_rank}` : ''}
          </p>
          {gapCount != null && (
            <p className="generator-hint">
              {gapCount.toLocaleString()} empty cells in the matrix — zero YC companies here today.
            </p>
          )}
        </div>
      </section>

      <section className="generator-result startup-card-body">
        <h3>{startup.name}</h3>
        <p className="result-oneliner">{startup.one_liner}</p>
        <div className="chips">
          {startup.chips.map((chip) => (
            <span key={chip} className="chip">
              {chip}
            </span>
          ))}
          {!scores.validation?.valid && <span className="chip warn">validation warnings</span>}
        </div>

        <CardDrawer title="Description" previewText={preview(startup.long_description, 120)}>
          <p>{startup.long_description}</p>
        </CardDrawer>

        <CardDrawer
          title="Business"
          previewText={preview(startup.what_they_sell, 80) || preview(startup.who_pays, 80)}
        >
          <p>
            <strong>Sells:</strong> {startup.what_they_sell}
          </p>
          <p>
            <strong>AI play:</strong> {startup.ai_play}
          </p>
          <p>
            <strong>Who pays:</strong> {startup.who_pays}
          </p>
        </CardDrawer>

        {(startup.why_good_idea?.proof_from_batch || startup.generation_rationale) && (
          <CardDrawer
            title="Thesis"
            previewText={
              preview(startup.why_good_idea?.proof_from_batch, 80) ||
              preview(startup.generation_rationale, 80)
            }
          >
            {startup.why_good_idea?.proof_from_batch && (
              <p className="desc">
                <strong>Proof:</strong> {startup.why_good_idea.proof_from_batch}
              </p>
            )}
            <p className="desc">
              <strong>Rationale:</strong> {startup.generation_rationale}
            </p>
          </CardDrawer>
        )}
      </section>

      {(onJudge || onArchive || onRestore) && (
        <footer className="startup-card-judge">
          {archived && onRestore ? (
            <button type="button" className="btn-primary restore-btn" disabled={saving} onClick={() => onRestore(card.id)}>
              Restore to library
            </button>
          ) : (
            <>
              {onJudge && (
                <>
                  <div className="judge-row judge-actions">
                    <span className="judge-label">Score</span>
                    <div className="score-stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`score-star ${(card.human_score ?? 0) >= n ? 'active' : ''}`}
                          disabled={saving}
                          onClick={() => submit({ human_score: n, verdict: card.judgment ?? undefined })}
                          aria-label={`Score ${n} of 5`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <div className="verdict-row">
                      <button
                        type="button"
                        className={card.judgment === 'promising' ? 'active promising' : ''}
                        disabled={saving}
                        onClick={() => submit({ verdict: 'promising' })}
                      >
                        Promising
                      </button>
                      <button
                        type="button"
                        className={card.judgment === 'maybe' ? 'active maybe' : ''}
                        disabled={saving}
                        onClick={() => submit({ verdict: 'maybe' })}
                      >
                        Maybe
                      </button>
                      {onArchive && (
                        <button
                          type="button"
                          className="reject archive-inline"
                          disabled={saving}
                          onClick={() => onArchive(card.id, notes.trim() || undefined)}
                          title="Reject and move to archive"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
              {!onJudge && onArchive && (
                <div className="judge-row verdict-row">
                  <button
                    type="button"
                    className="reject archive-inline"
                    disabled={saving}
                    onClick={() => onArchive(card.id, notes.trim() || undefined)}
                    title="Reject and move to archive"
                  >
                    Reject
                  </button>
                </div>
              )}
              {onJudge && (
                <>
                  <button type="button" className="notes-toggle" onClick={() => setNotesOpen((v) => !v)}>
                    {notesOpen ? 'Hide notes' : 'Add notes'}
                  </button>
                  {notesOpen && (
                    <div className="notes-row">
                      <textarea
                        rows={2}
                        placeholder="Why is this shit / promising?"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-primary notes-save"
                        disabled={saving}
                        onClick={() => submit({ notes })}
                      >
                        Save notes
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </footer>
      )}
    </article>
  );
}
