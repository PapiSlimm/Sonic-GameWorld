'use client';

import type { MissionDefinition } from '@sonic-gameworld/gameworld-sdk';
import { Badge, cn } from '@sonic-gameworld/ui';
import { ScrollText } from 'lucide-react';

const STATE_TONE: Record<MissionDefinition['state'], 'default' | 'accent' | 'success' | 'danger'> = {
  DRAFT: 'default',
  ACTIVE: 'accent',
  COMPLETE: 'success',
  FAILED: 'danger',
};

export interface MissionListPanelProps {
  missions: MissionDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MissionListPanel({ missions, selectedId, onSelect }: MissionListPanelProps) {
  if (missions.length === 0) {
    return <p className="p-4 text-center text-xs text-muted">No missions yet — create one or generate with AI.</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5 overflow-y-auto p-1.5">
      {missions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={cn(
                'flex w-full flex-col gap-1 rounded-control px-3 py-2 text-left transition-colors',
                selectedId === m.id ? 'bg-accent/10 text-accent' : 'text-text/85 hover:bg-bg',
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <ScrollText className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="truncate">{m.name}</span>
              </span>
              <span className="flex items-center gap-1.5 pl-5">
                <Badge tone={STATE_TONE[m.state]}>{m.state}</Badge>
                <span className="text-[10px] text-muted">Difficulty {m.difficulty}/10</span>
                <span className="text-[10px] text-muted">· {m.objectives.length} obj</span>
              </span>
            </button>
          </li>
        ))}
    </ul>
  );
}
