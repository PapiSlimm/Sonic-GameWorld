'use client';

import { useEffect, useRef } from 'react';
import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import type { Biome } from '@sonic-gameworld/rts-sim';
import { Button, Dialog, Select } from '@sonic-gameworld/ui';
import { Grid3x3 } from 'lucide-react';
import { useStudioStore } from '../../lib/store';
import { rtsMapGridForBounds } from '../../lib/rtsMap';

const BIOME_OPTIONS: { value: Biome; label: string }[] = [
  { value: 'URBAN', label: 'Urban' },
  { value: 'JUNGLE', label: 'Jungle' },
  { value: 'SEA', label: 'Sea' },
];

/** Cell rendered edge length in px, clamped so very large or very small maps stay usable. */
function cellPx(gridWidth: number, gridDepth: number): number {
  const longest = Math.max(gridWidth, gridDepth, 1);
  return Math.max(3, Math.min(24, Math.floor(560 / longest)));
}

/**
 * Cover-cell paint tool (docs/RTS-CONTRACTS.md §9 — "cover cells come from the map's occupancy
 * grid, flagged at map-authoring time in Studio"). Rendered as a top-down 2D grid canvas rather
 * than a literal overlay on the 3D WebGL viewport: `@sonic-gameworld/spatial-engine`'s
 * `<SpatialViewport>` is a separate, already-shipped, dynamically-loaded package outside this
 * pass's scope (see `ViewportPane.tsx`), and this grid is exactly the same row-major cell space
 * (`lib/rtsMap.ts`'s `rtsMapGridForBounds`) the 3D layer and the eventual `rts-sim` match will
 * both use — a creator paints the same cells a WebGL overlay would highlight, just via a 2D
 * top-down proxy instead of a raycast against the live scene.
 *
 * Click-drag toggles cells: the value painted for an entire drag is decided once, from the first
 * cell's current state (0 -> paints cover on; 1 -> erases), so a single drag either only adds or
 * only removes cover, matching a standard paint-bucket/eraser brush feel.
 */
function CoverCellCanvas({ document }: { document: WorldDocument }) {
  const config = useStudioStore((s) => s.rtsMapConfig());
  const paintRtsCoverCells = useStudioStore((s) => s.paintRtsCoverCells);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef<{ value: 0 | 1; lastX: number; lastZ: number } | null>(null);

  const { gridWidth, gridDepth } = rtsMapGridForBounds(document.bounds, config.cellSizeM);
  const px = cellPx(gridWidth, gridDepth);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = gridWidth * px;
    canvas.height = gridDepth * px;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#38f5c8';
    for (let z = 0; z < gridDepth; z += 1) {
      for (let x = 0; x < gridWidth; x += 1) {
        if (config.coverCells[z * gridWidth + x]) ctx.fillRect(x * px, z * px, px, px);
      }
    }
    if (px >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= gridWidth; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x * px + 0.5, 0);
        ctx.lineTo(x * px + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let z = 0; z <= gridDepth; z += 1) {
        ctx.beginPath();
        ctx.moveTo(0, z * px + 0.5);
        ctx.lineTo(canvas.width, z * px + 0.5);
        ctx.stroke();
      }
    }
  }, [config.coverCells, gridWidth, gridDepth, px]);

  const cellAtEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cellX = Math.floor(((e.clientX - rect.left) / rect.width) * gridWidth);
    const cellZ = Math.floor(((e.clientY - rect.top) / rect.height) * gridDepth);
    if (cellX < 0 || cellX >= gridWidth || cellZ < 0 || cellZ >= gridDepth) return null;
    return { cellX, cellZ };
  };

  const stopPainting = () => {
    paintingRef.current = null;
  };

  useEffect(() => {
    window.addEventListener('pointerup', stopPainting);
    return () => window.removeEventListener('pointerup', stopPainting);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-[60vh] max-w-full overflow-auto rounded-control border border-border bg-bg p-2">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
          onPointerDown={(e) => {
            const cell = cellAtEvent(e);
            if (!cell) return;
            const current = config.coverCells[cell.cellZ * gridWidth + cell.cellX];
            const value: 0 | 1 = current ? 0 : 1;
            paintingRef.current = { value, lastX: -1, lastZ: -1 };
            paintRtsCoverCells([cell], value);
          }}
          onPointerMove={(e) => {
            const painting = paintingRef.current;
            if (!painting) return;
            const cell = cellAtEvent(e);
            if (!cell || (cell.cellX === painting.lastX && cell.cellZ === painting.lastZ)) return;
            painting.lastX = cell.cellX;
            painting.lastZ = cell.cellZ;
            paintRtsCoverCells([cell], painting.value);
          }}
        />
      </div>
      <p className="text-xs text-muted">
        {gridWidth}×{gridDepth} cells at {config.cellSizeM}m each. Click-drag to paint cover (halves stealth-detection
        range for units standing on it); drag again over painted cells to erase.
      </p>
    </div>
  );
}

/**
 * World/map-level RTS settings: biome + the button that opens the cover-cell paint tool. Lives in
 * `TopHud` alongside the existing Weather/Time popovers — the natural home for world-level (not
 * per-entity) settings in this editor, per docs/RTS-CONTRACTS.md §6's "faction-assignment UI...
 * your call, document it" latitude extended to this sibling piece of map authoring. See
 * `lib/rtsMap.ts` for the persisted data shape.
 *
 * The paint dialog itself (`CoverCellDialog`) is deliberately NOT rendered from here: this panel
 * is the content of a `TopHud` popover that closes on `onMouseLeave`, which would unmount (and so
 * silently discard) a dialog opened from inside it the moment the pointer travels from the
 * popover to the centered modal. `TopHud` renders `CoverCellDialog` itself, outside that
 * collapsing subtree, and passes down the open-setter.
 */
export function RtsMapPanel({ onOpenPaint }: { onOpenPaint: () => void }) {
  const config = useStudioStore((s) => s.rtsMapConfig());
  const setRtsBiome = useStudioStore((s) => s.setRtsBiome);

  return (
    <div className="flex w-64 flex-col gap-3 p-3">
      <Select
        label="Biome"
        value={config.biome}
        options={BIOME_OPTIONS}
        onChange={(e) => setRtsBiome(e.target.value as Biome)}
      />
      <p className="text-xs text-muted">
        Drives United Dragon Nations&apos; team color (Red on Urban/Sea, Green on Jungle) and whether naval units are
        placeable, once this map is played as an RTS match.
      </p>
      <Button size="sm" variant="secondary" onClick={onOpenPaint} className="justify-start gap-2">
        <Grid3x3 className="h-3.5 w-3.5" />
        Paint cover cells…
      </Button>
    </div>
  );
}

/** See `RtsMapPanel`'s doc comment for why this is rendered separately, by `TopHud`. */
export function CoverCellDialog({ document, open, onClose }: { document: WorldDocument; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Cover cells" size="lg">
      <CoverCellCanvas document={document} />
    </Dialog>
  );
}
