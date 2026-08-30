'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
import { randomUuid, transformAt, vec3, ENTITY_KINDS, type EntityKind } from '@sonic-gameworld/world-schema';
import { Button, cn } from '@sonic-gameworld/ui';
import { entityKindIcon } from '../../lib/icons';
import { useStudioStore } from '../../lib/store';

function buildChildrenIndex(entities: WorldEntity[]): Map<string | undefined, WorldEntity[]> {
  const idx = new Map<string | undefined, WorldEntity[]>();
  for (const e of entities) {
    const key = e.parentId;
    idx.set(key, [...(idx.get(key) ?? []), e]);
  }
  return idx;
}

export interface SceneTreeProps {
  document: WorldDocument;
}

export function SceneTree({ document }: SceneTreeProps) {
  const selection = useStudioStore((s) => s.selection);
  const toggleSelect = useStudioStore((s) => s.toggleSelect);
  const setHovered = useStudioStore((s) => s.setHovered);
  const reparentEntity = useStudioStore((s) => s.reparentEntity);
  const addEntity = useStudioStore((s) => s.addEntity);
  const removeEntity = useStudioStore((s) => s.removeEntity);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(document.entities.map((e) => e.id)));
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [newKind, setNewKind] = useState<EntityKind>('PROP');

  const childrenIndex = useMemo(() => buildChildrenIndex(document.entities), [document.entities]);
  const roots = childrenIndex.get(undefined) ?? [];

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const createEntity = () => {
    addEntity({
      id: randomUuid(),
      kind: newKind,
      name: `New ${newKind}`,
      transform: transformAt(vec3().x, 0, 0, 1),
      tags: [],
      permissions: { ownerId: document.passport.creatorId, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as EntityKind)}
          className="h-7 flex-1 rounded-control border border-border bg-bg px-2 text-xs text-text"
        >
          {ENTITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={createEntity} leftIcon={<Plus className="h-3.5 w-3.5" />}>
          Add
        </Button>
      </div>
      <div
        className={cn('flex-1 overflow-y-auto py-1', dragOverRoot && 'bg-accent2/5')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverRoot(true);
        }}
        onDragLeave={() => setDragOverRoot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverRoot(false);
          const id = e.dataTransfer.getData('text/plain');
          if (id) reparentEntity(id, undefined);
        }}
      >
        {roots.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">No entities yet — add one above.</p>
        ) : (
          roots.map((entity) => (
            <SceneTreeNode
              key={entity.id}
              entity={entity}
              depth={0}
              childrenIndex={childrenIndex}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              selection={selection}
              onSelect={toggleSelect}
              onHover={setHovered}
              onReparent={reparentEntity}
              onDelete={removeEntity}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SceneTreeNodeProps {
  entity: WorldEntity;
  depth: number;
  childrenIndex: Map<string | undefined, WorldEntity[]>;
  expanded: Set<string>;
  toggleExpanded: (id: string) => void;
  selection: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onHover: (id: string | null) => void;
  onReparent: (id: string, parentId: string | undefined) => void;
  onDelete: (id: string) => void;
}

function SceneTreeNode({ entity, depth, childrenIndex, expanded, toggleExpanded, selection, onSelect, onHover, onReparent, onDelete }: SceneTreeNodeProps) {
  const children = childrenIndex.get(entity.id) ?? [];
  const isExpanded = expanded.has(entity.id);
  const isSelected = selection.includes(entity.id);
  const [dragOver, setDragOver] = useState(false);
  const Icon = entityKindIcon(entity.kind);

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={isSelected}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', entity.id)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const draggedId = e.dataTransfer.getData('text/plain');
          if (draggedId && draggedId !== entity.id) onReparent(draggedId, entity.id);
        }}
        onMouseEnter={() => onHover(entity.id)}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => onSelect(entity.id, e.metaKey || e.ctrlKey || e.shiftKey)}
        style={{ paddingLeft: 8 + depth * 16 }}
        className={cn(
          'group flex cursor-pointer items-center gap-1.5 rounded-control py-1 pr-2 text-sm transition-colors',
          isSelected ? 'bg-accent/10 text-accent' : 'text-text/85 hover:bg-bg',
          dragOver && 'ring-1 ring-inset ring-accent2/60',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(entity.id);
          }}
          className={cn('flex h-4 w-4 items-center justify-center text-muted', children.length === 0 && 'invisible')}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="flex-1 truncate">{entity.name}</span>
        {entity.ai?.agentId || entity.ai?.memoryEnabled ? <span className="h-1.5 w-1.5 rounded-full bg-accent2" title="AI-enabled" /> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(entity.id);
          }}
          className="hidden text-muted hover:text-danger group-hover:block"
          aria-label={`Delete ${entity.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {isExpanded &&
        children.map((child) => (
          <SceneTreeNode
            key={child.id}
            entity={child}
            depth={depth + 1}
            childrenIndex={childrenIndex}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            selection={selection}
            onSelect={onSelect}
            onHover={onHover}
            onReparent={onReparent}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}
