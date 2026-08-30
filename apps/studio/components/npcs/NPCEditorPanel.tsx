'use client';

import { useState } from 'react';
import type { NPCDefinition } from '@sonic-gameworld/gameworld-sdk';
import { Badge, Input, Select, Slider, Tabs, Toggle } from '@sonic-gameworld/ui';
import { X } from 'lucide-react';

export interface NPCEditorPanelProps {
  definition: NPCDefinition;
  onChange: (patch: Partial<NPCDefinition>) => void;
}

const STATE_BANK = ['idle', 'alert', 'patrol', 'engaged', 'fleeing', 'dead'];

export function NPCEditorPanel({ definition, onChange }: NPCEditorPanelProps) {
  const [traitDraft, setTraitDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState('');
  const [kbDraft, setKbDraft] = useState('');
  const [lineDraft, setLineDraft] = useState('');

  return (
    <Tabs defaultValue="personality" className="flex-1 overflow-hidden">
      <Tabs.List className="mx-4 mt-3 w-fit">
        <Tabs.Trigger value="personality">Personality</Tabs.Trigger>
        <Tabs.Trigger value="memory">Memory</Tabs.Trigger>
        <Tabs.Trigger value="knowledge">Knowledge</Tabs.Trigger>
        <Tabs.Trigger value="behavior">Behavior</Tabs.Trigger>
        <Tabs.Trigger value="dialogue">Dialogue</Tabs.Trigger>
      </Tabs.List>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Tabs.Content value="personality" className="flex flex-col gap-4 pt-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Backstory</span>
            <textarea
              value={definition.personality.backstory}
              onChange={(e) => onChange({ personality: { ...definition.personality, backstory: e.target.value } })}
              rows={3}
              className="w-full resize-none rounded-control border border-border bg-bg p-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </label>
          <Input
            label="Tone"
            value={definition.personality.tone}
            onChange={(e) => onChange({ personality: { ...definition.personality, tone: e.target.value } })}
          />
          <TagField
            label="Traits"
            items={definition.personality.traits}
            draft={traitDraft}
            setDraft={setTraitDraft}
            onAdd={(v) => onChange({ personality: { ...definition.personality, traits: [...definition.personality.traits, v] } })}
            onRemove={(v) => onChange({ personality: { ...definition.personality, traits: definition.personality.traits.filter((t) => t !== v) } })}
          />
          <TagField
            label="Goals"
            items={definition.personality.goals}
            draft={goalDraft}
            setDraft={setGoalDraft}
            onAdd={(v) => onChange({ personality: { ...definition.personality, goals: [...definition.personality.goals, v] } })}
            onRemove={(v) => onChange({ personality: { ...definition.personality, goals: definition.personality.goals.filter((g) => g !== v) } })}
          />
        </Tabs.Content>

        <Tabs.Content value="memory" className="flex flex-col gap-4 pt-3">
          <Toggle checked={definition.memory.enabled} onChange={(v) => onChange({ memory: { ...definition.memory, enabled: v } })} label="Memory enabled" />
          <Slider
            label="Memory capacity (entries)"
            value={definition.memory.capacity}
            min={0}
            max={500}
            step={10}
            onChange={(v) => onChange({ memory: { ...definition.memory, capacity: v } })}
          />
        </Tabs.Content>

        <Tabs.Content value="knowledge" className="flex flex-col gap-4 pt-3">
          <TagField
            label="Knowledge base IDs"
            items={definition.knowledge.kbIds}
            draft={kbDraft}
            setDraft={setKbDraft}
            onAdd={(v) => onChange({ knowledge: { kbIds: [...definition.knowledge.kbIds, v] } })}
            onRemove={(v) => onChange({ knowledge: { kbIds: definition.knowledge.kbIds.filter((k) => k !== v) } })}
          />
        </Tabs.Content>

        <Tabs.Content value="behavior" className="flex flex-col gap-4 pt-3">
          <Input label="Faction" value={definition.behavior.faction ?? ''} onChange={(e) => onChange({ behavior: { ...definition.behavior, faction: e.target.value || undefined } })} />
          <Slider
            label="Aggression"
            value={definition.behavior.aggression}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => onChange({ behavior: { ...definition.behavior, aggression: v } })}
          />
          <div className="flex flex-col gap-1.5">
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">States</span>
            <div className="flex flex-wrap gap-1.5">
              {STATE_BANK.map((s) => {
                const active = definition.behavior.states.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      onChange({
                        behavior: {
                          ...definition.behavior,
                          states: active ? definition.behavior.states.filter((x) => x !== s) : [...definition.behavior.states, s],
                        },
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-bg text-muted'}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="dialogue" className="flex flex-col gap-4 pt-3">
          <Select
            label="Style"
            value={definition.dialogue.style}
            options={['neutral', 'formal', 'casual', 'cryptic', 'aggressive'].map((v) => ({ value: v, label: v }))}
            onChange={(e) => onChange({ dialogue: { ...definition.dialogue, style: e.target.value } })}
          />
          <TagField
            label="Opening lines"
            items={definition.dialogue.openingLines}
            draft={lineDraft}
            setDraft={setLineDraft}
            onAdd={(v) => onChange({ dialogue: { ...definition.dialogue, openingLines: [...definition.dialogue.openingLines, v] } })}
            onRemove={(v) => onChange({ dialogue: { ...definition.dialogue, openingLines: definition.dialogue.openingLines.filter((l) => l !== v) } })}
          />
        </Tabs.Content>
      </div>
    </Tabs>
  );
}

function TagField({
  label,
  items,
  draft,
  setDraft,
  onAdd,
  onRemove,
}: {
  label: string;
  items: string[];
  draft: string;
  setDraft: (v: string) => void;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-hud text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <p className="text-xs text-muted">None yet.</p>}
        {items.map((item) => (
          <Badge key={item} tone="violet" className="gap-1">
            {item}
            <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item}`}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (v && !items.includes(v)) onAdd(v);
          setDraft('');
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add…"
          className="h-8 flex-1 rounded-control border border-border bg-bg px-2.5 text-xs text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </form>
    </div>
  );
}
