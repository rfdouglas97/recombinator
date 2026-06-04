import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMatch, ChatMessage } from '../api/chat';
import { checkChatHealth, sendChatMessage } from '../api/chat';
import type { DataBundle, DrawerSelection, FilterState } from '../types';
import {
  companiesToMatches,
  formatLocalSearchReply,
  searchCompaniesLocal,
} from '../utils/searchCompanies';

interface Props {
  bundle: DataBundle;
  state: FilterState;
  filteredSlugs: string[];
  drawer: DrawerSelection;
  open: boolean;
  onClose: () => void;
  onOpenCompany: (slug: string) => void;
}

const SUGGESTIONS = [
  'Which companies are building AI agents for healthcare?',
  'Show me Winter 2026 companies in fintech',
  'Find companies with biotech R&D phenotypes',
  'Who sells to enterprise pharma?',
];

function selectedSlugFromDrawer(drawer: DrawerSelection): string | null {
  if (!drawer) return null;
  if (drawer.kind === 'company') return drawer.slug;
  return null;
}

function renderMarkdownLite(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="chat-line">
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return part;
        })}
      </p>
    );
  });
}

export function YcChatPanel({
  bundle,
  state,
  filteredSlugs,
  drawer,
  open,
  onClose,
  onOpenCompany,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask me anything about the YC database — find companies by vertical, phenotype, batch, or what they sell. I use your sidebar filters as context.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [lastMatches, setLastMatches] = useState<ChatMatch[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    checkChatHealth()
      .then((h) => setLlmOk(h.llm_configured))
      .catch(() => setLlmOk(false));
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, lastMatches]);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput('');
      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setLoading(true);

      const filters = {
        batch: state.batch,
        sector: state.sector,
        industry: state.industry,
        phenotypeFamily: state.phenotypeFamily,
        businessModel: state.businessModel,
        minConfidence: state.minConfidence,
        search: state.search,
      };
      const selectedSlug = selectedSlugFromDrawer(drawer);

      try {
        const result = await sendChatMessage({
          messages: nextMessages,
          filters,
          filterSlugs: filteredSlugs.length < bundle.meta.assignment_count ? filteredSlugs : undefined,
          selectedSlug,
        });
        setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
        setLastMatches(result.matches);
      } catch (e) {
        const local = searchCompaniesLocal(bundle, trimmed, state);
        const reply = formatLocalSearchReply(trimmed, local);
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        setLastMatches(companiesToMatches(local));
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, bundle, state, filteredSlugs, drawer],
  );

  if (!open) return null;

  return (
    <div className="chat-panel-backdrop" onClick={onClose} role="presentation">
      <div
        className="chat-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="yc-chat-title"
      >
        <header className="chat-panel-header">
          <div>
            <h2 id="yc-chat-title">YC Database Chat</h2>
            <p className="chat-panel-subtitle">
              {bundle.meta.assignment_count} companies
              {llmOk === true ? ' · LLM answers' : llmOk === false ? ' · keyword search' : ''}
              {filteredSlugs.length < bundle.meta.assignment_count
                ? ` · scoped to ${filteredSlugs.length} filtered`
                : ''}
            </p>
          </div>
          <button type="button" className="chat-panel-close" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        </header>

        <div className="chat-messages" ref={scrollRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.role === 'assistant' ? renderMarkdownLite(m.content) : <p>{m.content}</p>}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble assistant chat-loading">
              <p>Searching…</p>
            </div>
          )}
          {error && <p className="chat-error-hint">API fallback: {error}</p>}
        </div>

        {lastMatches.length > 0 && (
          <div className="chat-matches">
            <span className="chat-matches-label">Results</span>
            <div className="chat-match-list">
              {lastMatches.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  className="chat-match-chip"
                  onClick={() => onOpenCompany(m.slug)}
                  title={m.one_liner ?? m.slug}
                >
                  <strong>{m.name}</strong>
                  <small>{m.vertical_label ?? m.batch}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chat-suggestion" disabled={loading} onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>

        <form
          className="chat-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Search or ask about companies…"
            value={input}
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
          />
          <button type="submit" className="btn-accent" disabled={loading || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
