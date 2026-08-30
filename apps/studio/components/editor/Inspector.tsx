'use client';

import { useEffect, useState } from 'react';
import type { EntityPatch, WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
import { RTS_FACTIONS, type BuildingClass, type UnitClass } from '@sonic-gameworld/rts-sim';
import { Badge, Button, EmptyState, Input, Select, Tabs, Toggle, useToast } from '@sonic-gameworld/ui';
import { Trash2, X } from 'lucide-react';
import { entityKindIcon } from '../../lib/icons';
import { useStudioStore } from '../../lib/store';

const RTS_FACTION_OPTIONS = [
  { value: '', label: 'Unassigned' },
  ...RTS_FACTIONS.map((f) => ({ value: f.id, label: f.name })),
];

const RTS_UNIT_CLASS_OPTIONS: { value: UnitClass; label: string }[] = [
  { value: 'INFANTRY', label: 'Infantry' },
  { value: 'ARMORED', label: 'Armored' },
  { value: 'AIR', label: 'Air' },
];

const RTS_BUILDING_CLASS_OPTIONS: { value: BuildingClass; label: string }[] = [
  { value: 'REFINERY', label: 'Refinery' },
  { value: 'BARRACKS', label: 'Barracks' },
  { value: 'FACTORY', label: 'Factory' },
  { value: 'AIRFIELD', label: 'Airfield' },
  { value: 'RADAR', label: 'Radar' },
];

const VISIBILITY_OPTIONS = [
  { value: 'PRIVATE', label: 'Private' },
  { value: 'TEAM', label: 'Team' },
  { value: 'PUBLIC', label: 'Public' },
];

const SYSTEM_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'patrol_ai', label: 'Patrol AI' },
  { value: 'boss_encounter', label: 'Boss Encounter' },
  { value: 'vehicle_physics', label: 'Vehicle Physics' },
  { value: 'weather_zone', label: 'Weather Zone' },
  { value: 'trigger_volume', label: 'Trigger Volume' },
  { value: 'day_night_cycle', label: 'Day/Night Cycle' },
];

function NumberField({ label, value, onCommit, step = 0.1 }: { label: string; value: number; onCommit: (v: number) => void; step?: number }) {
  const [local, setLocal] = useState(String(Number.isFinite(value) ? value : 0));
  useEffect(() => setLocal(String(Number.isFinite(value) ? value : 0)), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="font-hud text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        step={step}
        value={local}
        onChange={(e) => {
          const raw = e.target.value;
          setLocal(raw);
          // Live update: commit every keystroke that already parses to a real number, so the
          // viewport and undo-diffable document track the field as you type (not just on blur).
          const n = Number(raw);
          if (raw.trim() !== '' && Number.isFinite(n)) onCommit(n);
        }}
        onBlur={() => {
          const n = Number(local);
          if (!Number.isFinite(n) || local.trim() === '') setLocal(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="h-8 w-full rounded-control border border-border bg-bg px-2 text-xs text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
      />
    </label>
  );
}

function Vec3Row({ label, value, onChange }: { label: string; value: { x: number; y: number; z: number }; onChange: (axis: 'x' | 'y' | 'z', v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-hud text-[10px] uppercase tracking-[0.15em] text-muted">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="X" value={value.x} onCommit={(v) => onChange('x', v)} />
        <NumberField label="Y" value={value.y} onCommit={(v) => onChange('y', v)} />
        <NumberField label="Z" value={value.z} onCommit={(v) => onChange('z', v)} />
      </div>
    </div>
  );
}

/**
 * Faction (and unit/building class) assignment for RTS_UNIT/RTS_BUILDING entities
 * (docs/RTS-CONTRACTS.md §6/§7 — the Studio half of laying out an RTS map).
 *
 * Field/schema choice: rather than a new dedicated `WorldEntity` field, this reuses the existing
 * generic `behavior.params: Record<string, unknown>` bag every other kind already stores
 * scripted-behavior config in (see `NPCDefinition.behavior.faction` for the analogous NPC-side
 * convention, and `semantic.ts`'s `describeEntity`, which already reads `behavior.params.faction`
 * for narration). Concretely: `behavior.params.factionId` (matches an `RTS_FACTIONS[].id`, or any
 * string for a future third faction — `FactionSetup.factionId` is intentionally open per
 * rts-sim's types), plus `behavior.params.unitClass`/`behavior.params.buildingClass` so the 3D
 * integration layer (`packages/spatial-engine/src/rts/syncEntities.ts`) and, later, the match-
 * bootstrap step that turns a placed `WorldEntity` into a real `RTSUnit`/`RTSBuilding` know which
 * archetype to spawn. No `WorldEntitySchema` change needed — `behavior.params` already accepts
 * arbitrary keys.
 */
function RTSFactionFields({ entity, onUpdate }: { entity: WorldEntity; onUpdate: (patch: EntityPatch) => void }) {
  const params = (entity.behavior?.params ?? {}) as Record<string, unknown>;
  const setParam = (key: string, value: string) => {
    const nextParams = { ...params };
    if (value) nextParams[key] = value;
    else delete nextParams[key];
    onUpdate({ behavior: { systemId: entity.behavior?.systemId, params: nextParams } });
  };

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border bg-bg/60 p-3">
      <span className="font-hud text-[10px] uppercase tracking-[0.15em] text-muted">RTS placement</span>
      <Select
        label="Faction"
        value={typeof params.factionId === 'string' ? params.factionId : ''}
        options={RTS_FACTION_OPTIONS}
        onChange={(e) => setParam('factionId', e.target.value)}
      />
      {entity.kind === 'RTS_UNIT' && (
        <Select
          label="Unit class"
          value={typeof params.unitClass === 'string' ? params.unitClass : 'INFANTRY'}
          options={RTS_UNIT_CLASS_OPTIONS}
          onChange={(e) => setParam('unitClass', e.target.value)}
        />
      )}
      {entity.kind === 'RTS_BUILDING' && (
        <Select
          label="Building class"
          value={typeof params.buildingClass === 'string' ? params.buildingClass : 'BARRACKS'}
          options={RTS_BUILDING_CLASS_OPTIONS}
          onChange={(e) => setParam('buildingClass', e.target.value)}
        />
      )}
      <p className="text-xs text-muted">
        Marks this {entity.kind === 'RTS_UNIT' ? 'unit' : 'building'} as part of a faction's starting layout when the map is played as an RTS match.
      </p>
    </div>
  );
}

export interface InspectorProps {
  document: WorldDocument;
  entity: WorldEntity | undefined;
}

export function Inspector({ document, entity }: InspectorProps) {
  const updateEntity = useStudioStore((s) => s.updateEntity);
  const removeEntity = useStudioStore((s) => s.removeEntity);
  const inspectorTab = useStudioStore((s) => s.inspectorTab);
  const setInspectorTab = useStudioStore((s) => s.setInspectorTab);
  const { push } = useToast();
  const [tagDraft, setTagDraft] = useState('');
  const [metadataDraft, setMetadataDraft] = useState('');
  const [metadataError, setMetadataError] = useState<string | null>(null);

  useEffect(() => {
    setMetadataDraft(entity ? JSON.stringify(entity.metadata, null, 2) : '');
    setMetadataError(null);
    setTagDraft('');
  }, [entity?.id]);

  if (!entity) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState title="No selection" description="Select an entity in the scene hierarchy or viewport to inspect it." />
      </div>
    );
  }

  const Icon = entityKindIcon(entity.kind);

  const applyMetadata = () => {
    try {
      const parsed = metadataDraft.trim() ? JSON.parse(metadataDraft) : {};
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Metadata must be a JSON object');
      updateEntity(entity.id, { metadata: parsed as Record<string, unknown> });
      setMetadataError(null);
      push({ title: 'Metadata updated', tone: 'success' });
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-border p-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-accent" />
          <Input
            value={entity.name}
            onChange={(e) => updateEntity(entity.id, { name: e.target.value })}
            className="h-8 text-sm font-medium"
          />
        </div>
        <Button variant="ghost" size="icon" title="Delete entity" onClick={() => removeEntity(entity.id)}>
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <Badge tone="default">{entity.kind}</Badge>
        <span className="truncate font-hud text-[10px]">{entity.id}</span>
      </div>

      <Tabs value={inspectorTab} onValueChange={setInspectorTab} className="flex-1 overflow-hidden">
        <Tabs.List className="mx-3 mt-2 w-fit">
          <Tabs.Trigger value="transform">Transform</Tabs.Trigger>
          <Tabs.Trigger value="behavior">Behavior</Tabs.Trigger>
          <Tabs.Trigger value="ai">AI</Tabs.Trigger>
          <Tabs.Trigger value="tags">Tags</Tabs.Trigger>
          <Tabs.Trigger value="permissions">Access</Tabs.Trigger>
          <Tabs.Trigger value="metadata">Metadata</Tabs.Trigger>
        </Tabs.List>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Tabs.Content value="transform" className="flex flex-col gap-4 pt-3">
            <Vec3Row
              label="Position (m)"
              value={entity.transform.position}
              onChange={(axis, v) => updateEntity(entity.id, { transform: { ...entity.transform, position: { ...entity.transform.position, [axis]: v } } })}
            />
            <Vec3Row
              label="Rotation (quat)"
              value={{ x: entity.transform.rotation.x, y: entity.transform.rotation.y, z: entity.transform.rotation.z }}
              onChange={(axis, v) => updateEntity(entity.id, { transform: { ...entity.transform, rotation: { ...entity.transform.rotation, [axis]: v } } })}
            />
            <Vec3Row
              label="Scale"
              value={entity.transform.scale}
              onChange={(axis, v) => updateEntity(entity.id, { transform: { ...entity.transform, scale: { ...entity.transform.scale, [axis]: v } } })}
            />
            {entity.parentId && (
              <p className="text-xs text-muted">
                Parented to <span className="font-hud text-text/80">{document.entities.find((e) => e.id === entity.parentId)?.name ?? entity.parentId}</span>
              </p>
            )}
          </Tabs.Content>

          <Tabs.Content value="behavior" className="flex flex-col gap-4 pt-3">
            {(entity.kind === 'RTS_UNIT' || entity.kind === 'RTS_BUILDING') && (
              <RTSFactionFields entity={entity} onUpdate={(patch) => updateEntity(entity.id, patch)} />
            )}
            <Select
              label="Behavior system"
              value={entity.behavior?.systemId ?? ''}
              options={SYSTEM_OPTIONS}
              onChange={(e) =>
                updateEntity(entity.id, {
                  behavior: { systemId: e.target.value || undefined, params: entity.behavior?.params ?? {} },
                })
              }
            />
            <p className="text-xs text-muted">Systems drive scripted behavior (patrol routes, boss phases, vehicle physics) for this entity.</p>
          </Tabs.Content>

          <Tabs.Content value="ai" className="flex flex-col gap-4 pt-3">
            <Toggle
              checked={Boolean(entity.ai)}
              onChange={(checked) =>
                updateEntity(entity.id, { ai: checked ? { memoryEnabled: true, agentId: entity.ai?.agentId } : undefined })
              }
              label="AI agent enabled"
            />
            {entity.ai && (
              <>
                <Input
                  label="Agent ID"
                  value={entity.ai.agentId ?? ''}
                  placeholder="agent_..."
                  onChange={(e) => updateEntity(entity.id, { ai: { ...entity.ai, agentId: e.target.value || undefined } })}
                />
                <Toggle
                  checked={entity.ai.memoryEnabled}
                  onChange={(checked) => updateEntity(entity.id, { ai: { ...entity.ai, memoryEnabled: checked } })}
                  label="Memory enabled"
                  size="sm"
                />
              </>
            )}
          </Tabs.Content>

          <Tabs.Content value="tags" className="flex flex-col gap-3 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {entity.tags.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
              {entity.tags.map((tag) => (
                <Badge key={tag} tone="accent" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => updateEntity(entity.id, { tags: entity.tags.filter((t) => t !== tag) })} aria-label={`Remove ${tag}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = tagDraft.trim();
                if (t && !entity.tags.includes(t)) updateEntity(entity.id, { tags: [...entity.tags, t] });
                setTagDraft('');
              }}
            >
              <Input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add a tag…" className="h-8 flex-1 text-xs" />
              <Button type="submit" size="sm" variant="secondary">
                Add
              </Button>
            </form>
          </Tabs.Content>

          <Tabs.Content value="permissions" className="flex flex-col gap-4 pt-3">
            <Select
              label="Visibility"
              value={entity.permissions.visibility}
              options={VISIBILITY_OPTIONS}
              onChange={(e) => updateEntity(entity.id, { permissions: { ...entity.permissions, visibility: e.target.value as WorldEntity['permissions']['visibility'] } })}
            />
            <Input label="Owner ID" value={entity.permissions.ownerId} disabled className="opacity-70" />
            <div>
              <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Editors</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {entity.permissions.editors.length === 0 && <p className="text-xs text-muted">Only the owner can edit.</p>}
                {entity.permissions.editors.map((editorId) => (
                  <Badge key={editorId} tone="violet">
                    {editorId}
                  </Badge>
                ))}
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="metadata" className="flex flex-col gap-2 pt-3">
            <textarea
              value={metadataDraft}
              onChange={(e) => setMetadataDraft(e.target.value)}
              spellCheck={false}
              rows={12}
              className="w-full flex-1 resize-none rounded-control border border-border bg-bg p-2.5 font-hud text-xs text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            {metadataError && <p className="text-xs text-danger">{metadataError}</p>}
            <Button size="sm" variant="secondary" onClick={applyMetadata} className="self-start">
              Apply JSON
            </Button>
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  );
}
