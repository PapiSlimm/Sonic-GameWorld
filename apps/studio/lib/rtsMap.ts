import type { SystemRef } from '@sonic-gameworld/world-schema';
import type { Biome } from '@sonic-gameworld/rts-sim';
import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';

/**
 * RTS map-authoring data — biome + cover-cell grid (docs/RTS-CONTRACTS.md §6/§9) — persisted onto
 * the world document.
 *
 * Field/schema choice, matching `Inspector.tsx`'s `RTSFactionFields` convention from the earlier
 * pass (reuse an existing generic bag rather than extend a shared zod schema): `WorldDocument`
 * already carries `systems: SystemRef[]`, each a `{ id, name, kind, config: Record<string,
 * unknown> }` bag designed for exactly this — per-world, per-system config that doesn't warrant
 * its own top-level schema field. We store one well-known entry, id `RTS_MAP_SYSTEM_ID`
 * (`'rts-map-config'`), `kind: 'CUSTOM'`, whose `config` holds:
 *
 *   { biome: Biome; cellSizeM: number; coverCells: number[] }
 *
 * - `biome` is `packages/rts-sim`'s `Biome` (`'URBAN' | 'JUNGLE' | 'SEA'`) — read directly as
 *   `RTSMap.biome` by a future match-bootstrap step (`createMatch({ biome, ... })`).
 * - `coverCells` is a plain JSON `number[]` of 0/1 — **row-major (`z * gridWidth + x`), same
 *   order `RTSMap.coverCells` (a `Uint8Array`) uses** — a future match-bootstrap step needs only
 *   `Uint8Array.from(coverCells)` to hand it straight to `createMatch({ coverCells, ... })`
 *   (`RTSMap.coverCells` is optional and JSON has no typed-array literal, so a plain number array
 *   is what actually round-trips through `WorldVersion.document`).
 * - `gridWidth`/`gridDepth` are **not** stored — they're derived from `document.bounds` (the
 *   world's authored extent) and `cellSizeM` via `rtsMapGridForBounds`, using the exact same
 *   `Math.ceil(extentM / cellSizeM)` formula `createMatch` itself uses (see
 *   `packages/rts-sim/src/index.ts`), so a Studio-painted grid always matches the grid the sim
 *   will actually build. Deriving instead of storing also means resizing world bounds can't leave
 *   a stale grid-size field behind — `getRtsMapConfig` re-derives and safely truncates/zero-pads
 *   `coverCells` to the current grid size on every read.
 *
 * `cellSizeM` defaults to 40 — matching the `cellSizeM` used in `packages/rts-sim`'s own README
 * usage example (chosen there to match the reference prototype's original `CELL_SIZE` tuning).
 */
export const RTS_MAP_SYSTEM_ID = 'rts-map-config';
export const RTS_MAP_DEFAULT_CELL_SIZE_M = 40;
const VALID_BIOMES: readonly Biome[] = ['URBAN', 'JUNGLE', 'SEA'];

export interface RtsMapConfig {
  biome: Biome;
  cellSizeM: number;
  /** Row-major (`z * gridWidth + x`), 0|1 — see module doc. Always `gridWidth * gridDepth` long. */
  coverCells: number[];
}

export interface RtsMapGrid {
  gridWidth: number;
  gridDepth: number;
}

/** Config to fall back to when no document is loaded yet (e.g. before `loadWorld`). */
export function defaultRtsMapConfig(): RtsMapConfig {
  return { biome: 'URBAN', cellSizeM: RTS_MAP_DEFAULT_CELL_SIZE_M, coverCells: [] };
}

/** Same formula `createMatch` uses for `RTSMap.gridWidth`/`gridDepth` — keep these in lockstep. */
export function rtsMapGridForBounds(bounds: WorldDocument['bounds'], cellSizeM: number): RtsMapGrid {
  const widthM = Math.max(0, bounds.max.x - bounds.min.x);
  const depthM = Math.max(0, bounds.max.z - bounds.min.z);
  const safeCellSizeM = cellSizeM > 0 ? cellSizeM : RTS_MAP_DEFAULT_CELL_SIZE_M;
  return {
    gridWidth: Math.max(1, Math.ceil(widthM / safeCellSizeM)),
    gridDepth: Math.max(1, Math.ceil(depthM / safeCellSizeM)),
  };
}

function findRtsMapSystem(document: WorldDocument): SystemRef | undefined {
  return document.systems.find((s) => s.id === RTS_MAP_SYSTEM_ID);
}

/** Reads the current RTS map config, filling in defaults and normalizing `coverCells` to the
 * current bounds-derived grid size (see module doc) so callers never have to think about staleness. */
export function getRtsMapConfig(document: WorldDocument): RtsMapConfig {
  const raw = (findRtsMapSystem(document)?.config ?? {}) as Partial<RtsMapConfig>;
  const biome: Biome = VALID_BIOMES.includes(raw.biome as Biome) ? (raw.biome as Biome) : 'URBAN';
  const cellSizeM = typeof raw.cellSizeM === 'number' && raw.cellSizeM > 0 ? raw.cellSizeM : RTS_MAP_DEFAULT_CELL_SIZE_M;
  const { gridWidth, gridDepth } = rtsMapGridForBounds(document.bounds, cellSizeM);
  const size = gridWidth * gridDepth;
  const rawCells = Array.isArray(raw.coverCells) ? raw.coverCells : [];
  const coverCells = new Array<number>(size).fill(0);
  for (let i = 0; i < Math.min(size, rawCells.length); i += 1) coverCells[i] = rawCells[i] ? 1 : 0;
  return { biome, cellSizeM, coverCells };
}

/** Upserts the `rts-map-config` system entry with a shallow patch over the current (normalized) config. */
export function withRtsMapConfig(document: WorldDocument, patch: Partial<RtsMapConfig>): WorldDocument {
  const next: RtsMapConfig = { ...getRtsMapConfig(document), ...patch };
  const entry: SystemRef = {
    id: RTS_MAP_SYSTEM_ID,
    name: 'RTS Map Config',
    kind: 'CUSTOM',
    config: { biome: next.biome, cellSizeM: next.cellSizeM, coverCells: next.coverCells },
    enabled: true,
  };
  const existingIdx = document.systems.findIndex((s) => s.id === RTS_MAP_SYSTEM_ID);
  const systems = existingIdx >= 0 ? document.systems.map((s, i) => (i === existingIdx ? entry : s)) : [...document.systems, entry];
  return { ...document, systems };
}

/** Sets a batch of cells (from a paint-drag) to a single value in one document update. */
export function paintRtsCoverCells(document: WorldDocument, cells: { cellX: number; cellZ: number }[], value: 0 | 1): WorldDocument {
  const config = getRtsMapConfig(document);
  const { gridWidth, gridDepth } = rtsMapGridForBounds(document.bounds, config.cellSizeM);
  const coverCells = [...config.coverCells];
  let changed = false;
  for (const { cellX, cellZ } of cells) {
    if (cellX < 0 || cellX >= gridWidth || cellZ < 0 || cellZ >= gridDepth) continue;
    const idx = cellZ * gridWidth + cellX;
    if (coverCells[idx] !== value) {
      coverCells[idx] = value;
      changed = true;
    }
  }
  return changed ? withRtsMapConfig(document, { coverCells }) : document;
}
