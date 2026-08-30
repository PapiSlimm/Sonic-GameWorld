// Ported near-verbatim from docs/reference/global-dominance/src/engine/SpatialGrid.ts
// (docs/RTS-CONTRACTS.md §3). Only change: keyed by XZ instead of XY, and instantiated fresh each
// tick by `tickMatch` rather than kept as a shared mutable module singleton (that singleton
// pattern doesn't fit a package with no owned store — see docs/RTS-CONTRACTS.md §3).
import { SPATIAL_GRID_CELL_SIZE } from '../constants';
import type { RTSUnit } from '../types';

export class SpatialGrid {
  private readonly cellSize: number;
  private grid: Record<string, string[]> = {};

  constructor(cellSize: number = SPATIAL_GRID_CELL_SIZE) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.grid = {};
  }

  insert(id: string, x: number, z: number): void {
    const key = this.cellKey(x, z);
    const bucket = this.grid[key];
    if (bucket) {
      bucket.push(id);
    } else {
      this.grid[key] = [id];
    }
  }

  getNearby(x: number, z: number, radius: number): string[] {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);
    const ids: string[] = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const bucket = this.grid[`${cx + dx},${cz + dz}`];
        if (bucket) ids.push(...bucket);
      }
    }
    return ids;
  }

  private cellKey(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }
}

/** Builds a fresh grid from every non-dead unit, keyed by XZ position. Called once per tick. */
export function buildSpatialGridForUnits(units: readonly RTSUnit[]): SpatialGrid {
  const grid = new SpatialGrid();
  for (const unit of units) {
    if (unit.state === 'DEAD') continue;
    grid.insert(unit.id, unit.transform.position.x, unit.transform.position.z);
  }
  return grid;
}
