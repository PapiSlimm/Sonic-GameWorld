'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { randomUuid } from '@sonic-gameworld/world-schema';
import type { NPC } from '@sonic-gameworld/gameworld-sdk';
import { Button, Dialog, EmptyState, Input, Panel, Slider, useToast } from '@sonic-gameworld/ui';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { NPCCard } from '../../../../components/npcs/NPCCard';
import { NPCEditorPanel } from '../../../../components/npcs/NPCEditorPanel';
import { ChatPanel } from '../../../../components/npcs/ChatPanel';
import { createNpc, listNpcs, updateNpc } from '../../../../lib/npcs';
import { generateNPCsLocal } from '../../../../lib/localGenerate';
import { getClient } from '../../../../lib/client';
import { useStudioStore } from '../../../../lib/store';

export default function NPCsPage() {
  const params = useParams<{ id: string }>();
  const offline = useStudioStore((s) => s.offline);
  const [npcs, setNpcs] = useState<NPC[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('A wary fixer who trades in stolen tech');
  const [genCount, setGenCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;
    void listNpcs(params.id, offline).then((list) => {
      if (!cancelled) {
        setNpcs(list);
        setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params.id, offline]);

  const selected = npcs?.find((n) => n.id === selectedId);

  const applyPatch = async (patch: Parameters<typeof updateNpc>[2]) => {
    if (!selected) return;
    const updated = await updateNpc(params.id, selected.id, patch, offline);
    if (updated) setNpcs((list) => (list ?? []).map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleCreate = async () => {
    const npc = await createNpc(
      params.id,
      {
        id: randomUuid(),
        name: `New NPC ${(npcs?.length ?? 0) + 1}`,
        personality: { traits: [], backstory: '', goals: [], tone: 'neutral' },
        memory: { enabled: true, capacity: 50 },
        knowledge: { kbIds: [] },
        behavior: { states: ['idle'], aggression: 0.2 },
        dialogue: { style: 'neutral', openingLines: [] },
        relationships: [],
      },
      offline,
    );
    setNpcs((list) => [...(list ?? []), npc]);
    setSelectedId(npc.id);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let definitions;
      if (!offline) {
        try {
          const created = await getClient().npcs.generate({ worldId: params.id, prompt: genPrompt, count: genCount });
          setNpcs((list) => [...(list ?? []), ...created]);
          setSelectedId(created[0]?.id ?? null);
          push({ title: `Generated ${created.length} NPC(s)`, tone: 'success' });
          setGenOpen(false);
          return;
        } catch {
          definitions = generateNPCsLocal(genPrompt, { count: genCount });
        }
      } else {
        definitions = generateNPCsLocal(genPrompt, { count: genCount });
      }
      const created: NPC[] = [];
      for (const def of definitions) {
        created.push(await createNpc(params.id, def, offline));
      }
      setNpcs((list) => [...(list ?? []), ...created]);
      setSelectedId(created[0]?.id ?? null);
      push({ title: `Generated ${created.length} NPC(s) offline`, tone: 'success' });
      setGenOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  if (npcs === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_360px] overflow-hidden">
      <div className="flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">NPCs ({npcs.length})</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setGenOpen(true)} leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
              Generate
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleCreate()} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              New NPC
            </Button>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 lg:grid-cols-3">
          {npcs.length === 0 ? (
            <div className="col-span-full flex items-center justify-center py-10">
              <EmptyState title="No NPCs yet" description="Create one manually or generate a cast with AI." />
            </div>
          ) : (
            npcs.map((npc) => <NPCCard key={npc.id} npc={npc} active={npc.id === selectedId} onSelect={() => setSelectedId(npc.id)} />)
          )}
        </div>
      </div>

      {selected ? (
        <div className="grid grid-rows-[1fr_260px] overflow-hidden border-l border-border">
          <Panel title={selected.name} padded={false} className="flex flex-col overflow-hidden rounded-none border-0">
            <NPCEditorPanel definition={selected.definition} onChange={(patch) => void applyPatch({ definition: patch })} />
          </Panel>
          <ChatPanel npc={selected} offline={offline} />
        </div>
      ) : (
        <div className="flex items-center justify-center border-l border-border p-6">
          <EmptyState title="No NPC selected" description="Pick an NPC to edit its personality and test dialogue." />
        </div>
      )}

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title="Generate NPCs with AI" size="md">
        <div className="flex flex-col gap-4">
          <Input label="Prompt" value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
          <Slider label="Count" value={genCount} min={1} max={6} step={1} onChange={setGenCount} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setGenOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={generating} onClick={() => void handleGenerate()} leftIcon={<Sparkles className="h-4 w-4" />}>
            Generate
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
