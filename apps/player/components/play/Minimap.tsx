'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { boundsFromWorldBounds, headingToMinimapAngle, projectAndClampToMinimap, type MinimapSize } from '../../lib/engine/projection';
import type { PlayerRuntime } from '../../lib/engine/playerRuntime';

const SIZE: MinimapSize = { width: 200, height: 200, padding: 10 };

const KIND_DOT: Partial<Record<string, string>> = {
  NPC: '#FF4D6D',
  VEHICLE: '#7C5CFF',
  ITEM: '#FFB020',
  TRIGGER: '#38F5C8',
  BUILDING: '#4CC2FF',
};

export interface MinimapProps {
  world: WorldDocument;
  runtime: PlayerRuntime;
}

/** 2D top-down projection of world entities + the live player position (Canvas 2D). */
export function Minimap({ world, runtime }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const bounds = boundsFromWorldBounds(world.bounds);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, SIZE.width, SIZE.height);
    ctx.fillStyle = 'rgba(11,15,23,0.85)';
    ctx.fillRect(0, 0, SIZE.width, SIZE.height);
    ctx.strokeStyle = '#1B2230';
    ctx.strokeRect(0.5, 0.5, SIZE.width - 1, SIZE.height - 1);

    for (const entity of world.entities) {
      const color = KIND_DOT[entity.kind];
      if (!color) continue;
      const p = projectAndClampToMinimap({ x: entity.transform.position.x, z: entity.transform.position.z }, bounds, SIZE);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, entity.kind === 'BUILDING' ? 2.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player marker: a filled triangle pointing in the current heading.
    const p = projectAndClampToMinimap({ x: player.x, z: player.z }, bounds, SIZE);
    const angle = headingToMinimapAngle(player.yaw);
    const r = 6;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-angle);
    ctx.fillStyle = '#38F5C8';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.65);
    ctx.lineTo(-r * 0.7, -r * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [world, bounds, player]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE.width}
      height={SIZE.height}
      role="img"
      aria-label="Minimap"
      className="rounded-control border border-border"
    />
  );
}
