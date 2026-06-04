import { useEffect, useMemo, useState } from 'react';
import { loadBundle } from './data/loadBundle';
import type { DataBundle, TreeNode } from './types';
import { SIDEBAR_FILTER_DEFAULTS, useFilterState } from './hooks/useFilterState';
import { filterCompanies } from './utils/filterCompanies';
import { FilterBar } from './components/FilterBar';
import { MatrixView } from './views/MatrixView';
import { OntologyView } from './views/OntologyView';
import { CompanyDrawer } from './views/CompanyDrawer';
import { StartupGeneratorModal } from './components/StartupGeneratorModal';
import { YcChatPanel } from './components/YcChatPanel';
import { BrandMark } from './components/BrandMark';
import { SidebarToggleIcon } from './components/SidebarToggleIcon';

export default function App() {
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(
    () => localStorage.getItem('yc-explorer-sidebar-hidden') === '1',
  );
  const { state, patch, drawer, drawerOpen, openDrawer, closeDrawer } = useFilterState(bundle);

  const toggleSidebar = () => {
    setSidebarHidden((hidden) => {
      const next = !hidden;
      localStorage.setItem('yc-explorer-sidebar-hidden', next ? '1' : '0');
      return next;
    });
  };

  useEffect(() => {
    loadBundle()
      .then(setBundle)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const filtered = useMemo(
    () => (bundle ? filterCompanies(bundle, state) : []),
    [bundle, state],
  );

  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <p>Run: npm run data:bundle</p>
      </div>
    );
  }

  if (!bundle) {
    return <div className="loading">Loading YC database…</div>;
  }

  const handleNodeSelect = (node: TreeNode, slugs: string[]) => {
    if (node.type === 'company' && slugs.length === 1) {
      openDrawer({ kind: 'company', slug: slugs[0] });
    } else if (slugs.length) {
      openDrawer({ kind: 'companies', slugs, title: `${node.label} (${slugs.length})` });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <BrandMark size={26} />
          <div className="brand-word">
            <span className="brand-name">Recombinator</span>
            <span className="brand-tag">DATABASE EXPLORER</span>
          </div>
        </div>
        <div className="tab-bar">
          <button
            type="button"
            className={state.view === 'matrix' ? 'active' : ''}
            onClick={() => patch({ view: 'matrix' })}
          >
            Gap matrix
          </button>
          <button
            type="button"
            className={state.view === 'ontology' ? 'active' : ''}
            onClick={() => patch({ view: 'ontology' })}
          >
            Ontology
          </button>
        </div>
        <span className="meta">
          {bundle.meta.assignment_count} companies · {bundle.meta.vertical_count} verticals ·{' '}
          {bundle.meta.gap_count} gaps · {new Date(bundle.generated_at).toLocaleString()}
        </span>
        <div className="header-actions">
          <button
            type="button"
            className="header-btn sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarHidden ? 'Show filters' : 'Hide filters'}
            aria-label={sidebarHidden ? 'Show filters' : 'Hide filters'}
            aria-pressed={!sidebarHidden}
          >
            <SidebarToggleIcon open={!sidebarHidden} size={18} />
            <span className="sidebar-toggle-text">Filters</span>
          </button>
          <button type="button" className="header-btn" onClick={() => setChatOpen(true)}>
            Ask Recombinator
          </button>
          <button type="button" className="btn-accent header-btn" onClick={() => setGeneratorOpen(true)}>
            Startup Generator
          </button>
        </div>
      </header>
      <StartupGeneratorModal bundle={bundle} open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
      <YcChatPanel
        bundle={bundle}
        drawer={drawer}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onOpenCompany={(slug) => openDrawer({ kind: 'company', slug })}
      />
      <div className={`app-body ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
        <FilterBar
          bundle={bundle}
          state={state}
          onChange={patch}
          onReset={() => patch(SIDEBAR_FILTER_DEFAULTS)}
          filteredCount={filtered.length}
        />
        <button
          type="button"
          className={`sidebar-edge-toggle${sidebarHidden ? ' is-collapsed' : ''}`}
          onClick={toggleSidebar}
          title={sidebarHidden ? 'Show filters' : 'Hide filters'}
          aria-label={sidebarHidden ? 'Show filters' : 'Hide filters'}
          aria-pressed={!sidebarHidden}
        >
          <SidebarToggleIcon open={!sidebarHidden} size={16} />
        </button>
        <div className="main">
          {state.view === 'ontology' ? (
            <OntologyView
              bundle={bundle}
              state={state}
              onChange={patch}
              onNodeSelect={handleNodeSelect}
            />
          ) : (
            <MatrixView
              bundle={bundle}
              state={state}
              onChange={patch}
              onCellClick={(sel) => openDrawer(sel)}
            />
          )}
          <div className="footer-hint">
            Data: {bundle.meta.sources[0]} · Rebuild: npm run data:bundle
          </div>
        </div>
        <aside className={`drawer ${drawerOpen ? '' : 'closed'}`}>
          <CompanyDrawer
            bundle={bundle}
            selection={drawer}
            onSelectCompany={(slug) => openDrawer({ kind: 'company', slug })}
            onClose={closeDrawer}
          />
        </aside>
      </div>
    </div>
  );
}
