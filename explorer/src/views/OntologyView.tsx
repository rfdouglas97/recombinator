import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { hierarchy } from 'd3-hierarchy';
import type { DataBundle, FilterState, TreeNode } from '../types';
import { filteredSlugSet } from '../utils/filterCompanies';

interface Props {
  bundle: DataBundle;
  state: FilterState;
  onChange: (p: Partial<FilterState>) => void;
  onNodeSelect: (node: TreeNode, slugs: string[]) => void;
  onSectorBrush: (sectorId: string) => void;
}

const NODE_HEIGHT = 36;
const DEPTH_WIDTH = 280;
const MAX_COMPANY_CHILDREN = 12;

function getNodeDepth(root: TreeNode, id: string, depth = 0): number | null {
  if (root.id === id) return depth;
  for (const c of root.children ?? []) {
    const d = getNodeDepth(c, id, depth + 1);
    if (d !== null) return d;
  }
  return null;
}

function collectExpandOneLevel(root: TreeNode, expanded: Set<string>, out: string[]) {
  const isExpanded = root.type === 'root' || expanded.has(root.id);
  if (!isExpanded) return;

  for (const child of root.children ?? []) {
    if (child.type === 'company') continue;
    const hasKids = (child.children?.length ?? 0) > 0;
    if (hasKids && !expanded.has(child.id)) {
      out.push(child.id);
    } else if (expanded.has(child.id)) {
      collectExpandOneLevel(child, expanded, out);
    }
  }
}

function maxExpandedDepth(root: TreeNode, expanded: Set<string>): number {
  let max = 0;
  for (const id of expanded) {
    const d = getNodeDepth(root, id);
    if (d !== null && d > max) max = d;
  }
  return max;
}

function pruneTree(node: TreeNode, slugFilter: Set<string>): TreeNode | null {
  if (node.type === 'company') {
    return slugFilter.has(node.id) ? { ...node, children: [] } : null;
  }
  const children = (node.children ?? [])
    .map((c) => pruneTree(c, slugFilter))
    .filter((c): c is TreeNode => c !== null);
  if (node.type !== 'root' && children.length === 0) return null;
  return { ...node, children };
}

function countCompanies(node: TreeNode): number {
  if (node.type === 'company') return 1;
  return (node.children ?? []).reduce((s, c) => s + countCompanies(c), 0);
}

function collectSlugs(node: TreeNode, slugFilter: Set<string>): string[] {
  const out: string[] = [];
  function walk(n: TreeNode) {
    if (n.type === 'company') {
      if (slugFilter.has(n.id)) out.push(n.id);
      return;
    }
    for (const c of n.children ?? []) walk(c);
  }
  walk(node);
  return out;
}

function buildVisibleTree(node: TreeNode, expanded: Set<string>, slugFilter: Set<string>): TreeNode {
  const kids = node.children ?? [];
  const isExpanded = node.type === 'root' || expanded.has(node.id);

  if (!isExpanded) {
    return { ...node, children: [] };
  }

  if (node.type === 'vertical' || node.type === 'phenotype') {
    const companies = kids.filter((c) => c.type === 'company' && slugFilter.has(c.id));
    if (companies.length > MAX_COMPANY_CHILDREN) {
      return { ...node, children: [] };
    }
    return {
      ...node,
      children: companies.map((c) => ({ ...c, children: [] })),
    };
  }

  const children = kids
    .filter((c) => c.type !== 'company')
    .map((c) => buildVisibleTree(c, expanded, slugFilter));

  return { ...node, children };
}

function nodeAccent(data: TreeNode, sectors: DataBundle['facets']['sectors']): string {
  if (data.type === 'sector') {
    const i = sectors.findIndex((s) => s.id === data.id);
    const hues = [210, 150, 35, 0, 270, 185];
    return `hsl(${hues[i % hues.length]}, 45%, 55%)`;
  }
  if (data.type === 'family' || data.type === 'phenotype') return 'var(--accent)';
  return 'var(--border)';
}

export function OntologyView({ bundle, state, onChange, onNodeSelect, onSectorBrush }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['root']));
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [zoomHint, setZoomHint] = useState(1);
  const [resetNonce, setResetNonce] = useState(0);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const lastTransformRef = useRef<d3.ZoomTransform | null>(null);
  const lastResetNonceRef = useRef(0);

  const slugFilter = useMemo(() => filteredSlugSet(bundle, state), [bundle, state]);

  const rootTree = useMemo(() => {
    const raw =
      state.ontologyMode === 'industry_vertical'
        ? bundle.trees.industry_vertical
        : bundle.trees.phenotype;
    const pruned = pruneTree(raw, slugFilter);
    return pruned ?? { ...raw, children: [] };
  }, [bundle, state.ontologyMode, slugFilter]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set(['root']));
  }, []);

  const expandOneLevel = useCallback(() => {
    const ids: string[] = [];
    collectExpandOneLevel(rootTree, expanded, ids);
    if (!ids.length) return;
    setExpanded((prev) => new Set([...prev, ...ids]));
  }, [rootTree, expanded]);

  const collapseOneLevel = useCallback(() => {
    const maxDepth = maxExpandedDepth(rootTree, expanded);
    if (maxDepth <= 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        if (getNodeDepth(rootTree, id) === maxDepth) next.delete(id);
      }
      return next;
    });
  }, [rootTree, expanded]);

  const canExpandLevel = useMemo(() => {
    const ids: string[] = [];
    collectExpandOneLevel(rootTree, expanded, ids);
    return ids.length > 0;
  }, [rootTree, expanded]);

  const canCollapseLevel = useMemo(
    () => maxExpandedDepth(rootTree, expanded) > 0,
    [rootTree, expanded],
  );

  const resetView = useCallback(() => {
    setExpanded(new Set(['root']));
    onChange({ sector: '', ontologyFocusId: null });
    setResetNonce((n) => n + 1);
  }, [onChange]);

  const expandAll = useCallback(() => {
    const ids = new Set<string>(['root']);
    function walk(n: TreeNode) {
      if (n.type !== 'company' && (n.children?.length ?? 0) > 0) {
        ids.add(n.id);
        for (const c of n.children ?? []) walk(c);
      }
    }
    walk(rootTree);
    setExpanded(ids);
  }, [rootTree]);

  useEffect(() => {
    setExpanded(new Set(['root']));
    lastTransformRef.current = null;
  }, [state.ontologyMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const visibleRoot = buildVisibleTree(rootTree, expanded, slugFilter);
    const hRoot = hierarchy(visibleRoot, (d) => d.children);
    const treeLayout = d3.tree<TreeNode>().nodeSize([NODE_HEIGHT, DEPTH_WIDTH]);
    treeLayout(hRoot);

    const nodes = hRoot.descendants();
    const links = hRoot.links();

    let minX = 0,
      maxX = NODE_HEIGHT,
      minY = 0,
      maxY = DEPTH_WIDTH;
    for (const d of nodes) {
      minX = Math.min(minX, d.x ?? 0);
      maxX = Math.max(maxX, d.x ?? 0);
      minY = Math.min(minY, d.y ?? 0);
      maxY = Math.max(maxY, d.y ?? 0);
    }

    const pad = { top: 48, left: 56, right: 120, bottom: 48 };
    const graphW = maxY - minY + pad.left + pad.right;
    const graphH = maxX - minX + pad.top + pad.bottom;

    return {
      nodes,
      links,
      minX,
      minY,
      pad,
      graphW,
      graphH,
      visibleRoot,
    };
  }, [rootTree, expanded, slugFilter]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!rootTree.children?.length) {
      svg
        .append('text')
        .attr('x', 40)
        .attr('y', 40)
        .attr('fill', 'var(--text-muted)')
        .text('No nodes match filters');
      return;
    }

    const { nodes, links, pad, graphW, graphH } = layout;

    const g = svg.append('g').attr('class', 'ontology-zoom-layer');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .filter((event) => {
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown') return event.button === 0;
        return false;
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setZoomHint(Math.round(event.transform.k * 100) / 100);
        lastTransformRef.current = event.transform;
      });

    svg.call(zoom as never);

    zoomBehaviorRef.current = zoom;

    const offsetX = (size.w - graphW) / 2;
    const offsetY = (size.h - graphH) / 2;
    const initial = d3.zoomIdentity.translate(offsetX, offsetY).scale(0.95);

    const shouldResetZoom = resetNonce !== lastResetNonceRef.current || !lastTransformRef.current;
    const transform = shouldResetZoom ? initial : lastTransformRef.current!;

    if (shouldResetZoom) {
      lastResetNonceRef.current = resetNonce;
      svg.transition().duration(350).call(zoom.transform as never, transform);
      lastTransformRef.current = transform;
      setZoomHint(0.95);
    } else {
      svg.call(zoom.transform as never, transform);
    }

    g.append('g')
      .attr('class', 'ontology-links')
      .selectAll('path')
      .data(links)
      .join('path')
      .attr('d', (d) => {
        const sx = (d.source.y ?? 0) + pad.left;
        const sy = (d.source.x ?? 0) + pad.top;
        const tx = (d.target.y ?? 0) + pad.left;
        const ty = (d.target.x ?? 0) + pad.top;
        const mx = (sx + tx) / 2;
        return `M${sx},${sy} H${mx} V${ty} H${tx}`;
      })
      .attr('fill', 'none')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1)
      .attr('opacity', 0.7);

    const nodeG = g
      .append('g')
      .attr('class', 'ontology-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('transform', (d) => `translate(${(d.y ?? 0) + pad.left},${(d.x ?? 0) + pad.top})`)
      .style('cursor', 'pointer');

    nodeG
      .append('line')
      .attr('x1', -10)
      .attr('x2', -10)
      .attr('y1', -10)
      .attr('y2', 10)
      .attr('stroke', (d) => nodeAccent(d.data, bundle.facets.sectors))
      .attr('stroke-width', 2);

    nodeG.each(function (d) {
      const el = d3.select(this);
      const fullNode = findRawNode(rootTree, d.data.id) ?? d.data;
      const kidCount = (fullNode.children ?? []).length;
      const isExpanded = expanded.has(d.data.id) || d.data.type === 'root';
      const showToggle = kidCount > 0 && d.data.type !== 'company';

      if (showToggle) {
        el.append('text')
          .attr('class', 'ontology-toggle')
          .attr('x', -28)
          .attr('y', 4)
          .attr('text-anchor', 'middle')
          .attr('fill', 'var(--text-muted)')
          .attr('font-size', 14)
          .attr('font-family', 'var(--font-mono)')
          .text(isExpanded ? '−' : '+');
      }

      const label =
        d.data.type === 'company'
          ? bundle.companies[d.data.id]?.name ?? d.data.id
          : d.data.label;

      const count = countCompanies(fullNode);
      const suffix =
        !isExpanded && kidCount > 0
          ? ` (${count})`
          : (d.data.type === 'vertical' || d.data.type === 'phenotype') &&
              kidCount > MAX_COMPANY_CHILDREN &&
              isExpanded
            ? ` (${count} companies — click)`
            : '';

      el.append('text')
        .attr('x', 4)
        .attr('y', 4)
        .attr('fill', d.data.type === 'company' ? 'var(--text-muted)' : 'var(--text)')
        .attr('font-size', d.data.type === 'company' ? 12 : 13)
        .text(truncateLabel(label, 36) + suffix);
    });

    nodeG.on('click', (event, d) => {
      event.stopPropagation();
      const fullNode = findRawNode(rootTree, d.data.id) ?? d.data;
      const kidCount = (fullNode.children ?? []).length;

      if (d.data.type === 'company') {
        onNodeSelect(d.data, [d.data.id]);
        return;
      }

      if (
        (d.data.type === 'vertical' || d.data.type === 'phenotype') &&
        kidCount > MAX_COMPANY_CHILDREN
      ) {
        const slugs = collectSlugs(fullNode, slugFilter);
        onNodeSelect(fullNode, slugs);
        return;
      }

      if (kidCount > 0) {
        toggleExpand(d.data.id);
      } else {
        const slugs = collectSlugs(fullNode, slugFilter);
        if (slugs.length) onNodeSelect(fullNode, slugs);
      }

      if (fullNode.type === 'sector') onSectorBrush(fullNode.id);
    });

    svg.on('click', () => {
      /* pan surface */
    });
  }, [
    layout,
    rootTree,
    expanded,
    size,
    bundle,
    state.ontologyMode,
    slugFilter,
    toggleExpand,
    onNodeSelect,
    onSectorBrush,
    resetNonce,
  ]);

  return (
    <>
      <div className="toolbar ontology-toolbar">
        <label>
          Ontology
          <select
            value={state.ontologyMode}
            onChange={(e) =>
              onChange({
                ontologyMode: e.target.value as FilterState['ontologyMode'],
                ontologyFocusId: null,
              })
            }
          >
            <option value="industry_vertical">Industry vertical</option>
            <option value="phenotype">Business phenotype</option>
          </select>
        </label>
        <button type="button" onClick={expandOneLevel} disabled={!canExpandLevel}>
          Expand level
        </button>
        <button type="button" onClick={collapseOneLevel} disabled={!canCollapseLevel}>
          Collapse level
        </button>
        <button type="button" onClick={collapseAll}>
          Collapse all
        </button>
        <button type="button" onClick={resetView}>
          Reset view
        </button>
        <button type="button" onClick={expandAll}>
          Expand all
        </button>
        <span className="ontology-hint">
          Drag to pan · Scroll to zoom · {Math.round(zoomHint * 100)}% · Click +/− or use level controls
        </span>
      </div>
      <div ref={containerRef} className="ontology-canvas view-area">
        <svg ref={svgRef} className="ontology-svg-pan" width="100%" height="100%" />
      </div>
    </>
  );
}

function findRawNode(root: TreeNode, id: string): TreeNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const found = findRawNode(c, id);
    if (found) return found;
  }
  return null;
}

function truncateLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
