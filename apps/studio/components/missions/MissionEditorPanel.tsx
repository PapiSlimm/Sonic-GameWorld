'use client';

import { randomUuid } from '@sonic-gameworld/world-schema';
import type { MissionDefinition, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { Badge, Button, Input, Select, Slider } from '@sonic-gameworld/ui';
import { Plus, Trash2 } from 'lucide-react';

const OBJECTIVE_TYPES: MissionDefinition['objectives'][number]['type'][] = ['REACH', 'KILL', 'COLLECT', 'ESCORT', 'DEFEND', 'INTERACT', 'SURVIVE', 'CUSTOM'];
const TRIGGER_KINDS: MissionDefinition['triggers'][number]['kind'][] = ['ENTER_VOLUME', 'EXIT_VOLUME', 'TIMER', 'EVENT', 'PLAYER_COUNT', 'CUSTOM'];
const REWARD_TYPES: MissionDefinition['rewards'][number]['type'][] = ['XP', 'CURRENCY', 'ITEM', 'UNLOCK'];
const STATE_OPTIONS = ['DRAFT', 'ACTIVE', 'COMPLETE', 'FAILED'].map((v) => ({ value: v, label: v }));

export interface MissionEditorPanelProps {
  mission: MissionDefinition;
  document: WorldDocument;
  onChange: (patch: Partial<MissionDefinition>) => void;
  onDelete: () => void;
}

export function MissionEditorPanel({ mission, document, onChange, onDelete }: MissionEditorPanelProps) {
  const entityOptions = [{ value: '', label: 'None' }, ...document.entities.map((e) => ({ value: e.id, label: `${e.name} (${e.kind})` }))];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <Input label="Mission name" value={mission.name} onChange={(e) => onChange({ name: e.target.value })} className="flex-1" />
        <Button variant="ghost" size="icon" title="Delete mission" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Description</span>
        <textarea
          value={mission.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="w-full resize-none rounded-control border border-border bg-bg p-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <Select label="State" value={mission.state} options={STATE_OPTIONS} onChange={(e) => onChange({ state: e.target.value as MissionDefinition['state'] })} />
        <Slider label="Difficulty" value={mission.difficulty} min={1} max={10} step={1} onChange={(v) => onChange({ difficulty: v })} />
      </div>

      <Section
        title="Objectives"
        onAdd={() =>
          onChange({
            objectives: [...mission.objectives, { id: randomUuid(), type: 'REACH', description: 'New objective', conditions: [] }],
          })
        }
      >
        {mission.objectives.map((obj, i) => (
          <div key={obj.id} className="flex flex-col gap-2 rounded-control border border-border bg-bg p-2.5">
            <div className="flex items-center gap-2">
              <select
                value={obj.type}
                onChange={(e) =>
                  onChange({ objectives: mission.objectives.map((o, idx) => (idx === i ? { ...o, type: e.target.value as typeof o.type } : o)) })
                }
                className="h-7 rounded-control border border-border bg-panel px-2 text-xs text-text"
              >
                {OBJECTIVE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={obj.description}
                onChange={(e) =>
                  onChange({ objectives: mission.objectives.map((o, idx) => (idx === i ? { ...o, description: e.target.value } : o)) })
                }
                className="h-7 flex-1 rounded-control border border-border bg-panel px-2 text-xs text-text"
              />
              <button
                type="button"
                onClick={() => onChange({ objectives: mission.objectives.filter((_, idx) => idx !== i) })}
                className="text-muted hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <select
              value={obj.targetEntityId ?? ''}
              onChange={(e) =>
                onChange({
                  objectives: mission.objectives.map((o, idx) => (idx === i ? { ...o, targetEntityId: e.target.value || undefined } : o)),
                })
              }
              className="h-7 w-full rounded-control border border-border bg-panel px-2 text-xs text-muted"
            >
              {entityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  Target: {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </Section>

      <Section
        title="Triggers"
        onAdd={() => onChange({ triggers: [...mission.triggers, { id: randomUuid(), kind: 'ENTER_VOLUME', params: {}, actions: [] }] })}
      >
        {mission.triggers.map((tr, i) => (
          <div key={tr.id} className="flex items-center gap-2 rounded-control border border-border bg-bg p-2.5">
            <select
              value={tr.kind}
              onChange={(e) => onChange({ triggers: mission.triggers.map((t, idx) => (idx === i ? { ...t, kind: e.target.value as typeof t.kind } : t)) })}
              className="h-7 rounded-control border border-border bg-panel px-2 text-xs text-text"
            >
              {TRIGGER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              value={tr.entityId ?? ''}
              onChange={(e) => onChange({ triggers: mission.triggers.map((t, idx) => (idx === i ? { ...t, entityId: e.target.value || undefined } : t)) })}
              className="h-7 flex-1 rounded-control border border-border bg-panel px-2 text-xs text-muted"
            >
              {entityOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Badge tone="default">{tr.actions.length} action(s)</Badge>
            <button type="button" onClick={() => onChange({ triggers: mission.triggers.filter((_, idx) => idx !== i) })} className="text-muted hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </Section>

      <Section title="Rewards" onAdd={() => onChange({ rewards: [...mission.rewards, { type: 'XP', amount: 100 }] })}>
        {mission.rewards.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-control border border-border bg-bg p-2.5">
            <select
              value={r.type}
              onChange={(e) => onChange({ rewards: mission.rewards.map((rw, idx) => (idx === i ? { ...rw, type: e.target.value as typeof rw.type } : rw)) })}
              className="h-7 rounded-control border border-border bg-panel px-2 text-xs text-text"
            >
              {REWARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {(r.type === 'XP' || r.type === 'CURRENCY') && (
              <input
                type="number"
                value={r.amount ?? 0}
                onChange={(e) => onChange({ rewards: mission.rewards.map((rw, idx) => (idx === i ? { ...rw, amount: Number(e.target.value) } : rw)) })}
                className="h-7 w-24 rounded-control border border-border bg-panel px-2 text-xs text-text"
              />
            )}
            {(r.type === 'ITEM' || r.type === 'UNLOCK') && (
              <input
                placeholder="itemId"
                value={r.itemId ?? ''}
                onChange={(e) => onChange({ rewards: mission.rewards.map((rw, idx) => (idx === i ? { ...rw, itemId: e.target.value } : rw)) })}
                className="h-7 flex-1 rounded-control border border-border bg-panel px-2 text-xs text-text"
              />
            )}
            <button type="button" onClick={() => onChange({ rewards: mission.rewards.filter((_, idx) => idx !== i) })} className="ml-auto text-muted hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">{title}</span>
        <Button size="sm" variant="secondary" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
          Add
        </Button>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
