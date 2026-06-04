import { useEffect, useMemo, useState } from 'react';
import { loadBundle } from './data/loadBundle';
import type { DataBundle, TreeNode } from './types';
import { useFilterState } from './hooks/useFilterState';
import { filterCompanies } from './utils/filterCompanies';
import { FilterBar } from './components/FilterBar';
import { MatrixView } from './views/MatrixView';
import { OntologyView } from './views/OntologyView';
import { IdeaLibraryView } from './views/IdeaLibraryView';
import { CompanyDrawer } from './views/CompanyDrawer';
import { StartupGeneratorModal } from './components/StartupGeneratorModal';
import { YcChatPanel } from './components/YcChatPanel';

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

  const filteredSlugs = useMemo(() => filtered.map((c) => c.slug), [filtered]);

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
        <h1>YC Database Explorer</h1>
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
          <button
            type="button"
            className={state.view === 'library' ? 'active' : ''}
            onClick={() => patch({ view: 'library' })}
          >
            Idea library
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
            title={sidebarHidden ? 'Show filter sidebar' : 'Hide filter sidebar'}
          >
            {sidebarHidden ? 'Show filters' : 'Hide filters'}
          </button>
          <button type="button" className="header-btn" onClick={() => setChatOpen(true)}>
            Ask YC DB
          </button>
          <button type="button" className="btn-accent header-btn" onClick={() => setGeneratorOpen(true)}>
            Startup Generator
          </button>
        </div>
      </header>
      <StartupGeneratorModal bundle={bundle} open={generatorOpen} onClose={() => setGeneratorOpen(false)} />
      <YcChatPanel
        bundle={bundle}
        state={state}
        filteredSlugs={filteredSlugs}
        drawer={drawer}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onOpenCompany={(slug) => openDrawer({ kind: 'company', slug })}
      />
      <div className={`app-body ${sidebarHidden ? 'sidebar-hidden' : ''}`}>
        <FilterBar bundle={bundle} state={state} onChange={patch} filteredCount={filtered.length} />
        <button
          type="button"
          className="sidebar-edge-toggle"
          onClick={toggleSidebar}
          title={sidebarHidden ? 'Show filter sidebar' : 'Hide filter sidebar'}
          aria-label={sidebarHidden ? 'Show filters' : 'Hide filters'}
        >
          {sidebarHidden ? '›' : '‹'}
        </button>
        <div className="main">
          {state.view === 'matrix' ? (
            <MatrixView
              bundle={bundle}
              state={state}
              onChange={patch}
              onCellClick={(sel) => openDrawer(sel)}
            />
          ) : state.view === 'ontology' ? (
            <OntologyView
              bundle={bundle}
              state={state}
              onChange={patch}
              onNodeSelect={handleNodeSelect}
              onSectorBrush={(sectorId) => patch({ sector: sectorId, sectorCollapsed: false })}
            />
          ) : (
            <IdeaLibraryView bundle={bundle} />
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
