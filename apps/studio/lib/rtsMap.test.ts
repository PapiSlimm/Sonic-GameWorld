import { describe, expect, it } from 'vitest';
import { createSampleWorld } from '@sonic-gameworld/world-schema';
import { createMatch, isCoverCell } from '@sonic-gameworld/rts-sim';
import {
  defaultRtsMapConfig,
  getRtsMapConfig,
  paintRtsCoverCells,
  RTS_MAP_DEFAULT_CELL_SIZE_M,
  RTS_MAP_SYSTEM_ID,
  rtsMapGridForBounds,
  withRtsMapConfig,
} from './rtsMap';

function sampleDoc() {
  return createSampleWorld('NEON_TOKYO_2099');
}

describe('rtsMapGridForBounds', () => {
  it('matches the ceil(extentM / cellSizeM) formula createMatch itself uses', () => {
    const doc = sampleDoc();
    const widthM = doc.bounds.max.x - doc.bounds.min.x;
    const depthM = doc.bounds.max.z - doc.bounds.min.z;
    const grid = rtsMapGridForBounds(doc.bounds, RTS_MAP_DEFAULT_CELL_SIZE_M);
    expect(grid.gridWidth).toBe(Math.ceil(widthM / RTS_MAP_DEFAULT_CELL_SIZE_M));
    expect(grid.gridDepth).toBe(Math.ceil(depthM / RTS_MAP_DEFAULT_CELL_SIZE_M));

    const match = createMatch({
      seed: 1,
      mapWidthM: widthM,
      mapDepthM: depthM,
      cellSizeM: RTS_MAP_DEFAULT_CELL_SIZE_M,
      factions: [{ factionId: 'raven-alliance', isAIControlled: false }],
    });
    expect(match.map.gridWidth).toBe(grid.gridWidth);
    expect(match.map.gridDepth).toBe(grid.gridDepth);
  });

  it('never returns a zero-sized dimension, even for a degenerate/zero-extent bounds', () => {
    const grid = rtsMapGridForBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }, 40);
    expect(grid.gridWidth).toBeGreaterThanOrEqual(1);
    expect(grid.gridDepth).toBeGreaterThanOrEqual(1);
  });
});

describe('getRtsMapConfig', () => {
  it('defaults to URBAN biome, the standard cell size, and an all-zero cover grid when unset', () => {
    const doc = sampleDoc();
    const config = getRtsMapConfig(doc);
    expect(config.biome).toBe('URBAN');
    expect(config.cellSizeM).toBe(RTS_MAP_DEFAULT_CELL_SIZE_M);
    const { gridWidth, gridDepth } = rtsMapGridForBounds(doc.bounds, config.cellSizeM);
    expect(config.coverCells.length).toBe(gridWidth * gridDepth);
    expect(config.coverCells.every((c) => c === 0)).toBe(true);
  });

  it('matches defaultRtsMapConfig() when no document is available yet', () => {
    expect(defaultRtsMapConfig().biome).toBe('URBAN');
    expect(defaultRtsMapConfig().coverCells).toEqual([]);
  });
});

describe('withRtsMapConfig', () => {
  it('upserts a single rts-map-config system entry rather than duplicating it', () => {
    let doc = sampleDoc();
    doc = withRtsMapConfig(doc, { biome: 'JUNGLE' });
    doc = withRtsMapConfig(doc, { biome: 'SEA' });
    const entries = doc.systems.filter((s) => s.id === RTS_MAP_SYSTEM_ID);
    expect(entries.length).toBe(1);
    expect(getRtsMapConfig(doc).biome).toBe('SEA');
  });

  it('preserves coverCells already painted when only the biome changes', () => {
    let doc = sampleDoc();
    doc = paintRtsCoverCells(doc, [{ cellX: 2, cellZ: 3 }], 1);
    doc = withRtsMapConfig(doc, { biome: 'JUNGLE' });
    const config = getRtsMapConfig(doc);
    const { gridWidth } = rtsMapGridForBounds(doc.bounds, config.cellSizeM);
    expect(config.coverCells[3 * gridWidth + 2]).toBe(1);
  });
});

describe('paintRtsCoverCells', () => {
  it('toggles cells on, producing the exact row-major shape RTSMap.coverCells expects', () => {
    const doc = paintRtsCoverCells(sampleDoc(), [{ cellX: 5, cellZ: 7 }], 1);
    const config = getRtsMapConfig(doc);
    const { gridWidth, gridDepth } = rtsMapGridForBounds(doc.bounds, config.cellSizeM);

    // A future match-bootstrap step hands this straight to createMatch({ coverCells, ... }).
    const match = createMatch({
      seed: 1,
      mapWidthM: doc.bounds.max.x - doc.bounds.min.x,
      mapDepthM: doc.bounds.max.z - doc.bounds.min.z,
      cellSizeM: config.cellSizeM,
      coverCells: Uint8Array.from(config.coverCells),
      biome: config.biome,
      factions: [{ factionId: 'raven-alliance', isAIControlled: false }],
    });
    expect(match.map.gridWidth).toBe(gridWidth);
    expect(match.map.gridDepth).toBe(gridDepth);
    expect(isCoverCell(match.map, 5, 7)).toBe(true);
    expect(isCoverCell(match.map, 5, 8)).toBe(false);
  });

  it('erases a previously painted cell back to 0', () => {
    let doc = paintRtsCoverCells(sampleDoc(), [{ cellX: 1, cellZ: 1 }], 1);
    expect(getRtsMapConfig(doc).coverCells.some((c) => c === 1)).toBe(true);
    doc = paintRtsCoverCells(doc, [{ cellX: 1, cellZ: 1 }], 0);
    expect(getRtsMapConfig(doc).coverCells.every((c) => c === 0)).toBe(true);
  });

  it('paints a batch of cells from one drag in a single update', () => {
    const doc = paintRtsCoverCells(sampleDoc(), [
      { cellX: 0, cellZ: 0 },
      { cellX: 1, cellZ: 0 },
      { cellX: 2, cellZ: 0 },
    ], 1);
    const config = getRtsMapConfig(doc);
    const { gridWidth } = rtsMapGridForBounds(doc.bounds, config.cellSizeM);
    expect(config.coverCells[0]).toBe(1);
    expect(config.coverCells[1]).toBe(1);
    expect(config.coverCells[2]).toBe(1);
    expect(config.coverCells[gridWidth]).toBe(0); // next row untouched
  });

  it('ignores out-of-range cell coordinates instead of throwing or corrupting the grid', () => {
    const doc = sampleDoc();
    const painted = paintRtsCoverCells(doc, [{ cellX: -1, cellZ: 0 }, { cellX: 999999, cellZ: 0 }], 1);
    expect(getRtsMapConfig(painted).coverCells.every((c) => c === 0)).toBe(true);
  });

  it('is a no-op (returns the same document reference) when nothing actually changes', () => {
    const doc = sampleDoc();
    const painted = paintRtsCoverCells(doc, [{ cellX: 0, cellZ: 0 }], 0); // already 0
    expect(painted).toBe(doc);
  });
});
