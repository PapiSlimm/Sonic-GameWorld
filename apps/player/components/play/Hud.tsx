'use client';

import { Heart, Zap } from 'lucide-react';
import { Badge } from '@sonic-gameworld/ui';
import type { MissionDefinition } from '@sonic-gameworld/gameworld-sdk';

export interface HudProps {
  health: number;
  maxHealth: number;
  xp: number;
  mission?: MissionDefinition;
  completedObjectiveIds: string[];
}

export function Hud({ health, maxHealth, xp, mission, completedObjectiveIds }: HudProps) {
  const pct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  return (
    <div className="pointer-events-none flex flex-col gap-2">
      <div className="pointer-events-auto flex items-center gap-4 rounded-panel border border-border bg-panel/90 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-danger" aria-hidden />
          <div className="h-2 w-28 overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-danger transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-hud text-xs tabular-nums text-text/80">{Math.round(health)}/{maxHealth}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-warn" aria-hidden />
          <span className="font-hud text-xs tabular-nums text-warn">{xp} XP</span>
        </div>
      </div>

      {mission && (
        <div className="pointer-events-auto flex max-w-xs flex-col gap-1.5 rounded-panel border border-border bg-panel/90 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-accent">{mission.name}</span>
            <Badge tone="accent">{mission.state}</Badge>
          </div>
          <ul className="flex flex-col gap-1">
            {mission.objectives.map((o) => {
              const done = completedObjectiveIds.includes(o.id);
              return (
                <li key={o.id} className={`flex items-start gap-1.5 text-xs ${done ? 'text-muted line-through' : 'text-text/90'}`}>
                  <span className="mt-0.5">{done ? '✓' : '▸'}</span>
                  <span>{o.description}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
