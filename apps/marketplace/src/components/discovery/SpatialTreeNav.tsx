'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { SpatialMapNode } from '@sonic-gameworld/gameworld-sdk';
import { cn } from '@sonic-gameworld/ui';
import { findPath } from '../../lib/spatialTree.js';
import type { DiscoveryCluster } from '../../lib/types.js';

export interface SpatialTreeNavProps {
  root: SpatialMapNode;
  selectedCluster: DiscoveryCluster | null;
  selectedGenreKey: string | null;
  selectedProductId: string | null;
  onSelectCluster: (cluster: DiscoveryCluster | null) => void;
  onSelectGenre: (genreKey: string | null) => void;
  onSelectProduct: (productId: string) => void;
}

/** `world:WORLDS` -> `WORLDS`; `city:WORLDS:CYBERPUNK` -> `WORLDS:CYBERPUNK`; ids come from spatialTree.ts. */
function clusterOf(nodeId: string): DiscoveryCluster | undefined {
  const m = /^(?:world|city|district):([A-Z]+)/.exec(nodeId);
  return m?.[1] as DiscoveryCluster | undefined;
}
function genreKeyOf(nodeId: string): string | undefined {
  const m = /^(?:city|district):([A-Z]+:[A-Z_]+)/.exec(nodeId);
  return m?.[1];
}

const LEVEL_LABEL: Record<SpatialMapNode['level'], string> = {
  ROOT: 'Market',
  CATEGORY: 'Category',
  GENRE: 'Genre',
  WORLD: 'World',
  CITY: 'City',
  DISTRICT: 'District',
  BUILDING: 'Building',
  ROOM: 'Room',
  ASSET: 'Asset',
  ITEM: 'Item',
};

/**
 * Left-hand spatial breadcrumb tree, synchronized with the globe/canvas selection:
 * WORLD (cluster) → CITY (genre) → DISTRICT (category) → BUILDING → ROOM → ASSET (product),
 * per CONTRACTS §5/§12. A node is "active" by comparing the shared selection primitives
 * (cluster/genreKey/productId) rather than by node id, so clicking either surface stays in sync.
 */
export function SpatialTreeNav(props: SpatialTreeNavProps) {
  const { root, selectedCluster, selectedGenreKey, selectedProductId } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Whenever the shared selection changes (from the globe, the tree, or a deep link), make sure the
  // path to it is expanded so the tree visibly reflects what's focused elsewhere on the page.
  useEffect(() => {
    const targetId = selectedProductId
      ? `asset:${selectedProductId}`
      : selectedGenreKey
        ? `city:${selectedGenreKey}`
        : selectedCluster
          ? `world:${selectedCluster}`
          : null;
    if (!targetId) return;
    const path = findPath(root, targetId);
    if (!path) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const node of path) next.add(node.id);
      return next;
    });
  }, [root, selectedCluster, selectedGenreKey, selectedProductId]);

  const breadcrumb = useMemo(() => {
    const targetId = selectedProductId ? `asset:${selectedProductId}` : selectedGenreKey ? `city:${selectedGenreKey}` : selectedCluster ? `world:${selectedCluster}` : null;
    if (!targetId) return null;
    return findPath(root, targetId);
  }, [root, selectedCluster, selectedGenreKey, selectedProductId]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleActivate = (node: SpatialMapNode) => {
    toggle(node.id);
    if (node.level === 'WORLD') {
      const cluster = clusterOf(node.id);
      if (cluster) props.onSelectCluster(selectedCluster === cluster ? null : cluster);
    } else if (node.level === 'CITY') {
      const genreKey = genreKeyOf(node.id);
      if (genreKey) props.onSelectGenre(selectedGenreKey === genreKey ? null : genreKey);
    } else if ((node.level === 'BUILDING' || node.level === 'ASSET') && node.productId) {
      props.onSelectProduct(node.productId);
    }
  };

  return (
    <nav aria-label="Spatial discovery tree" className="flex h-full flex-col gap-3">
      {breadcrumb && breadcrumb.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2 font-hud text-[10px] uppercase tracking-wider text-muted">
          {breadcrumb.slice(1).map((node, i) => (
            <span key={node.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-border" />}
              <span className={i === breadcrumb.length - 2 ? 'text-accent' : ''}>{node.name}</span>
            </span>
          ))}
        </div>
      )}
      <ul className="flex-1 space-y-0.5 overflow-y-auto pr-1 text-sm">
        {root.children.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            selectedCluster={selectedCluster}
            selectedGenreKey={selectedGenreKey}
            selectedProductId={selectedProductId}
            onToggle={toggle}
            onActivate={handleActivate}
          />
        ))}
      </ul>
    </nav>
  );
}

interface TreeNodeProps {
  node: SpatialMapNode;
  depth: number;
  expanded: Set<string>;
  selectedCluster: DiscoveryCluster | null;
  selectedGenreKey: string | null;
  selectedProductId: string | null;
  onToggle: (id: string) => void;
  onActivate: (node: SpatialMapNode) => void;
}

function isActive(node: SpatialMapNode, sel: Pick<TreeNodeProps, 'selectedCluster' | 'selectedGenreKey' | 'selectedProductId'>): boolean {
  if (node.level === 'WORLD') return clusterOf(node.id) === sel.selectedCluster;
  if (node.level === 'CITY') return genreKeyOf(node.id) === sel.selectedGenreKey;
  if (node.level === 'BUILDING' || node.level === 'ROOM' || node.level === 'ASSET') return node.productId === sel.selectedProductId;
  return false;
}

function TreeNode({ node, depth, expanded, onToggle, onActivate, ...sel }: TreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const open = expanded.has(node.id);
  const active = isActive(node, sel);
  // BUILDING -> ROOM -> ASSET is a fixed 1:1:1 chain per product; collapse it to one clickable row
  // labeled with the product name, so the tree stays scannable instead of three near-duplicate rows.
  if (node.level === 'BUILDING') {
    return (
      <li>
        <button
          type="button"
          onClick={() => onActivate(node)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-control py-1.5 pr-2 text-left transition-colors',
            active ? 'bg-accent/10 text-accent' : 'text-text/80 hover:bg-bg hover:text-text',
          )}
        >
          <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-60" />
          <span className="truncate text-xs">{node.name}</span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onToggle(node.id);
          onActivate(node);
        }}
        style={{ paddingLeft: `${depth * 14}px` }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-control py-1.5 pr-2 text-left font-hud text-[11px] uppercase tracking-wider transition-colors',
          active ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-bg hover:text-text',
        )}
        title={LEVEL_LABEL[node.level]}
      >
        {hasChildren ? (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        <span className="ml-auto shrink-0 text-[9px] text-muted/70">{node.count}</span>
      </button>
      {hasChildren && open && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onActivate={onActivate} {...sel} />
          ))}
        </ul>
      )}
    </li>
  );
}
