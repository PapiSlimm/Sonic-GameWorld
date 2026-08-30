'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { randomUuid } from '@sonic-gameworld/world-schema';
import type { MissionDefinition } from '@sonic-gameworld/gameworld-sdk';
import { Button, Dialog, EmptyState, Input, Panel, Slider, useToast } from '@sonic-gameworld/ui';
import { Plus, Sparkles } from 'lucide-react';
import { MissionEditorPanel } from '../../../../components/missions/MissionEditorPanel';
import { MissionListPanel } from '../../../../components/missions/MissionListPanel';
import { getClient } from '../../../../lib/client';
import { generateMissionsLocal } from '../../../../lib/localGenerate';
import { useStudioStore } from '../../../../lib/store';

export default function MissionsPage() {
  const params = useParams<{ id: string }>();
  const document = useStudioStore((s) => s.document);
  const offline = useStudioStore((s) => s.offline);
  const addMission = useStudioStore((s) => s.addMission);
  const updateMission = useStudioStore((s) => s.updateMission);
  const removeMission = useStudioStore((s) => s.removeMission);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('Escort the transport convoy through the flooded district');
  const [genCount, setGenCount] = useState(1);
  const [genDifficulty, setGenDifficulty] = useState(4);
  const [generating, setGenerating] = useState(false);
  const { push } = useToast();

  const selected = useMemo(() => document?.missions.find((m) => m.id === selectedId), [document, selectedId]);

  if (!document) return null;

  const handleCreate = () => {
    const mission: MissionDefinition = {
      id: randomUuid(),
      name: `Mission ${document.missions.length + 1}`,
      description: '',
      order: document.missions.length,
      objectives: [],
      triggers: [],
      rewards: [],
      difficulty: 3,
      state: 'DRAFT',
    };
    addMission(mission);
    setSelectedId(mission.id);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      if (!offline) {
        try {
          const results = await getClient().missions.generate({ worldId: params.id, prompt: genPrompt, difficulty: genDifficulty, count: genCount });
          for (const r of results) addMission(r.definition);
          setSelectedId(results[0]?.definition.id ?? null);
          push({ title: `Generated ${results.length} mission(s)`, tone: 'success' });
          setGenOpen(false);
          return;
        } catch {
          // fall through to the offline generator
        }
      }
      const generated = generateMissionsLocal(genPrompt, { count: genCount, difficulty: genDifficulty });
      for (const m of generated) addMission(m);
      setSelectedId(generated[0]?.id ?? null);
      push({ title: `Generated ${generated.length} mission(s) offline`, tone: 'success' });
      setGenOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
      <Panel
        title="Missions"
        padded={false}
        className="flex flex-col overflow-hidden rounded-none border-y-0 border-l-0"
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setGenOpen(true)} leftIcon={<Sparkles className="h-3.5 w-3.5" />}>
              Generate
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCreate} leftIcon={<Plus className="h-3.5 w-3.5" />}>
              New
            </Button>
          </div>
        }
      >
        <MissionListPanel missions={document.missions} selectedId={selectedId} onSelect={setSelectedId} />
      </Panel>

      {selected ? (
        <MissionEditorPanel
          mission={selected}
          document={document}
          onChange={(patch) => updateMission(selected.id, patch)}
          onDelete={() => {
            removeMission(selected.id);
            setSelectedId(null);
          }}
        />
      ) : (
        <div className="flex items-center justify-center p-6">
          <EmptyState title="No mission selected" description="Pick a mission from the list, create a new one, or generate one with AI." />
        </div>
      )}

      <Dialog open={genOpen} onClose={() => setGenOpen(false)} title="Generate missions with AI" size="md">
        <div className="flex flex-col gap-4">
          <Input label="Prompt" value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Count" value={genCount} min={1} max={5} step={1} onChange={setGenCount} />
            <Slider label="Difficulty" value={genDifficulty} min={1} max={10} step={1} onChange={setGenDifficulty} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setGenOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={generating} onClick={handleGenerate} leftIcon={<Sparkles className="h-4 w-4" />}>
            Generate
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
