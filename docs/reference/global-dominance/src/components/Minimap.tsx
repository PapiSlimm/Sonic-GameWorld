import React from 'react';
import { useGameStore } from '../store/gameStore';
import { CELL_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { Faction, UnitState } from '../types';

export const Minimap: React.FC = () => {
  const units = useGameStore(s => s.entities.units);
  const buildings = useGameStore(s => s.entities.buildings);
  const playerFaction = useGameStore(s => s.input.selectedFaction);

  const mapWidth = 150;
  const mapHeight = 150;
  const scaleX = mapWidth / (GRID_WIDTH * CELL_SIZE);
  const scaleY = mapHeight / (GRID_HEIGHT * CELL_SIZE);

  return (
    <div className="absolute bottom-6 right-72 w-[150px] h-[150px] bg-black/75 border border-white/15 backdrop-blur-md overflow-hidden rounded shadow-2xl z-40">
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <div className="w-full h-full bg-[radial-gradient(#ffffff08_1px,transparent_1px)] [background-size:10px_10px]" />
      </div>
      
      <svg width={mapWidth} height={mapHeight} className="relative">
        {buildings.map(b => {
          if (b.health <= 0) return null;
          return (
            <rect
              key={b.id}
              x={b.position.x * CELL_SIZE * scaleX}
              y={b.position.y * CELL_SIZE * scaleY}
              width={b.size.w * CELL_SIZE * scaleX}
              height={b.size.h * CELL_SIZE * scaleY}
              fill={b.faction === Faction.Raven ? '#1d4ed8' : '#b91c1c'}
              className="opacity-90"
            />
          );
        })}

        {units.filter(u => u.state !== UnitState.Dead && (u.faction === playerFaction || u.isDetected)).map(u => (
          <circle
            key={u.id}
            cx={u.transform.x * scaleX}
            cy={u.transform.y * scaleY}
            r={u.class === 'Armored' ? 2 : 1.5}
            fill={u.faction === Faction.Raven ? '#3b82f6' : '#ef4444'}
          />
        ))}
      </svg>
      
      <div className="absolute bottom-0 left-0 right-0 p-1 bg-black/60 border-t border-white/5 flex items-center justify-between">
        <span className="text-[7.5px] font-mono text-emerald-400 uppercase tracking-widest animate-pulse">● SATLINK ACTIVE</span>
      </div>
    </div>
  );
};
