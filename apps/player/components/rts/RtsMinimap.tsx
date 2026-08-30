'use client';

import { useEffect, useRef } from 'react';
import type { RTSMatchState } from '@sonic-gameworld/rts-sim';
import type { CameraViewportInfo } from '../../lib/rts/viewportRuntime';
import { factionColor } from './rtsTheme';

const SIZE = { width: 200, height: 200 };
const RESOURCE_COLOR = '#F4C542';

export interface RtsMinimapProps {
  match: RTSMatchState;
  camera: CameraViewportInfo | null;
  /** World-space click -> recenter the RTS camera there (§7: "minimap click-to-recenter camera"). */
  onJumpTo: (x: number, z: number) => void;
}

function toMinimap(x: number, z: number, widthM: number, depthM: number): { x: number; y: number } {
  return { x: (x / widthM) * SIZE.width, y: (z / depthM) * SIZE.height };
}

/** RTS minimap (docs/RTS-CONTRACTS.md §7): top-down projection of the live `RTSMatchState`, click
 * anywhere to recenter the RTS overview camera there via the RTS camera mode's `jumpTo()`. */
export function RtsMinimap({ match, camera, onJumpTo }: RtsMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { widthM, depthM } = match.map;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, SIZE.width, SIZE.height);
    ctx.fillStyle = 'rgba(11,15,23,0.9)';
    ctx.fillRect(0, 0, SIZE.width, SIZE.height);
    ctx.strokeStyle = '#1B2230';
    ctx.strokeRect(0.5, 0.5, SIZE.width - 1, SIZE.height - 1);

    for (const resource of match.entities.resources) {
      const p = toMinimap(resource.position.x, resource.position.z, widthM, depthM);
      ctx.fillStyle = RESOURCE_COLOR;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const building of match.entities.buildings) {
      const worldX = (building.cellX + building.sizeCells.w / 2) * match.map.cellSizeM;
      const worldZ = (building.cellZ + building.sizeCells.d / 2) * match.map.cellSizeM;
      const p = toMinimap(worldX, worldZ, widthM, depthM);
      ctx.fillStyle = factionColor(building.factionId);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }

    for (const unit of match.entities.units) {
      if (unit.state === 'DEAD') continue;
      const p = toMinimap(unit.transform.position.x, unit.transform.position.z, widthM, depthM);
      ctx.fillStyle = factionColor(unit.factionId);
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit.isSelected ? 2.6 : 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Approximate camera viewport rectangle — the RTS camera has a fixed pitch, so the exact
    // ground footprint is a trapezoid; a square scaled by zoom distance is a close-enough, cheap
    // stand-in for "roughly what's on screen right now".
    if (camera) {
      const half = camera.distanceM * 0.6;
      const topLeft = toMinimap(camera.anchor.x - half, camera.anchor.z - half, widthM, depthM);
      const bottomRight = toMinimap(camera.anchor.x + half, camera.anchor.z + half, widthM, depthM);
      ctx.strokeStyle = 'rgba(56,245,200,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    }
  }, [match, camera, widthM, depthM]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    onJumpTo(fracX * widthM, fracY * depthM);
  }

  return (
    <canvas
      ref={canvasRef}
      width={SIZE.width}
      height={SIZE.height}
      role="img"
      aria-label="RTS minimap — click to recenter the camera"
      onClick={handleClick}
      className="cursor-pointer rounded-control border border-border"
    />
  );
}
