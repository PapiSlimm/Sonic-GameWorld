'use client';

import { Coins } from 'lucide-react';
import { Button, Panel } from '@sonic-gameworld/ui';
import { RTS_UNIT_STATS, type BuildingClass, type RTSMatchState, type UnitClass } from '@sonic-gameworld/rts-sim';

export interface RtsProductionPanelProps {
  match: RTSMatchState;
  localFactionId: string;
  onEnqueue: (buildingId: string, unitClass: UnitClass) => void;
}

/** Which unit class a building class can produce — mirrors `productionSystem.ts`'s
 * `findSpawnBuilding` compatibility rule (BARRACKS -> INFANTRY, FACTORY/AIRFIELD -> ARMORED/AIR). */
const PRODUCIBLE: Partial<Record<BuildingClass, UnitClass>> = {
  BARRACKS: 'INFANTRY',
  FACTORY: 'ARMORED',
  AIRFIELD: 'AIR',
};

/** Production panel (docs/RTS-CONTRACTS.md §7): per-building build queue with progress bars +
 * credits display. One "produce" button per production-capable building the local faction owns —
 * v1 keeps this to the single unit class each building type is best-known for (Infantry/Armored/
 * Air), matching the reference; §9's expanded `unitType` roster is the final integration pass's
 * concern (§9 explicitly reconciles shared-surface HUD additions like this in pass #12). */
export function RtsProductionPanel({ match, localFactionId, onEnqueue }: RtsProductionPanelProps) {
  const credits = match.economy[localFactionId]?.credits ?? 0;
  const ownBuildings = match.entities.buildings.filter((b) => b.factionId === localFactionId && b.health > 0);

  return (
    <Panel
      title="Production"
      actions={
        <span className="flex items-center gap-1 font-hud text-xs tabular-nums text-warn">
          <Coins className="h-3.5 w-3.5" aria-hidden /> {Math.floor(credits)}
        </span>
      }
      className="w-72"
    >
      <div className="flex flex-col gap-3">
        {ownBuildings.length === 0 && <p className="text-xs text-muted">No production buildings remain.</p>}
        {ownBuildings.map((building) => {
          const unitClass = PRODUCIBLE[building.buildingClass];
          const queueForBuilding = match.productionQueue.filter((item) => item.buildingId === building.id);
          const cost = unitClass ? RTS_UNIT_STATS[unitClass].cost : 0;
          return (
            <div key={building.id} className="flex flex-col gap-1.5 rounded-control border border-border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text">{building.buildingClass}</span>
                {unitClass && (
                  <Button size="sm" variant="secondary" disabled={credits < cost} onClick={() => onEnqueue(building.id, unitClass)}>
                    Build {unitClass.toLowerCase()} · {cost}c
                  </Button>
                )}
              </div>
              {queueForBuilding.map((item) => {
                const elapsed = match.tick - item.startedAtTick;
                const pct = Math.max(0, Math.min(100, (elapsed / item.durationTicks) * 100));
                return (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
                      <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-hud text-[10px] tabular-nums text-muted">{item.unitClass}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
