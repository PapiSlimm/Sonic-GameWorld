'use client';

import type { NPC } from '@sonic-gameworld/gameworld-sdk';
import { Badge, cn } from '@sonic-gameworld/ui';
import { Bot } from 'lucide-react';

export interface NPCCardProps {
  npc: NPC;
  active: boolean;
  onSelect: () => void;
}

export function NPCCard({ npc, active, onSelect }: NPCCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-2 rounded-panel border p-3 text-left transition-colors',
        active ? 'border-accent2/60 bg-accent2/10' : 'border-border bg-panel hover:border-accent2/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-accent2/15 text-accent2">
          <Bot className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{npc.name}</p>
          <p className="truncate text-xs text-muted">{npc.definition.behavior.faction ?? 'Unaffiliated'}</p>
        </div>
        <Badge tone={npc.status === 'ACTIVE' ? 'accent' : npc.status === 'ARCHIVED' ? 'default' : 'warn'}>{npc.status}</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {npc.definition.personality.traits.slice(0, 3).map((t) => (
          <Badge key={t} tone="default">
            {t}
          </Badge>
        ))}
      </div>
    </button>
  );
}
