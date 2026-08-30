// Ported near-verbatim from docs/reference/global-dominance/src/utils/pathfinding.ts
// (docs/RTS-CONTRACTS.md §3 — "it already operates on an abstract grid, trivially reusable").
// Grid-space A* on a flat Uint8Array occupancy grid; XZ instead of XY, `RTSMap` instead of
// separate width/height/cellSize args, and no `static` class wrapper (this package has no need
// for the reference's namespacing-via-class style).
import { PATHFINDING_MAX_NODES_SEARCHED } from '../constants';
import type { RTSMap, Vec3 } from '../types';

interface GridPoint {
  x: number;
  z: number;
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function worldToGrid(p: Vec3, cellSizeM: number): GridPoint {
  return { x: Math.floor(p.x / cellSizeM), z: Math.floor(p.z / cellSizeM) };
}

function gridToWorld(p: GridPoint, cellSizeM: number): Vec3 {
  return { x: p.x * cellSizeM + cellSizeM / 2, y: 0, z: p.z * cellSizeM + cellSizeM / 2 };
}

function reconstructPath(cameFrom: Map<string, GridPoint>, current: GridPoint, cellSizeM: number): Vec3[] {
  const path = [gridToWorld(current, cellSizeM)];
  let cursor = current;
  while (cameFrom.has(`${cursor.x},${cursor.z}`)) {
    cursor = cameFrom.get(`${cursor.x},${cursor.z}`)!;
    path.unshift(gridToWorld(cursor, cellSizeM));
  }
  return path;
}

/**
 * Finds a walkable path from `start` to `target` in world-space (XZ) coordinates, using the
 * match's occupancy grid. Returns `null` when no path exists (out of bounds, or the target cell
 * is genuinely unreachable within the search budget) and `[target]` as a direct-line fallback
 * when the target cell itself is free but far outside the search budget — matching the
 * reference's exact fallback behavior.
 */
export function findPath(start: Vec3, target: Vec3, map: RTSMap): Vec3[] | null {
  const startGrid = worldToGrid(start, map.cellSizeM);
  const targetGrid = worldToGrid(target, map.cellSizeM);

  if (startGrid.x < 0 || startGrid.x >= map.gridWidth || startGrid.z < 0 || startGrid.z >= map.gridDepth) return null;
  if (targetGrid.x < 0 || targetGrid.x >= map.gridWidth || targetGrid.z < 0 || targetGrid.z >= map.gridDepth) return null;
  if (startGrid.x === targetGrid.x && startGrid.z === targetGrid.z) return null;

  const openSet: GridPoint[] = [startGrid];
  const cameFrom = new Map<string, GridPoint>();
  const gScore = new Map<string, number>();
  gScore.set(`${startGrid.x},${startGrid.z}`, 0);
  const fScore = new Map<string, number>();
  fScore.set(`${startGrid.x},${startGrid.z}`, heuristic(startGrid, targetGrid));

  let nodesSearched = 0;
  while (openSet.length > 0 && nodesSearched < PATHFINDING_MAX_NODES_SEARCHED) {
    nodesSearched++;

    openSet.sort((a, b) => (fScore.get(`${a.x},${a.z}`) ?? Infinity) - (fScore.get(`${b.x},${b.z}`) ?? Infinity));
    const current = openSet.shift()!;

    if (current.x === targetGrid.x && current.z === targetGrid.z) {
      return reconstructPath(cameFrom, current, map.cellSizeM);
    }

    const neighbors: GridPoint[] = [
      { x: current.x + 1, z: current.z },
      { x: current.x - 1, z: current.z },
      { x: current.x, z: current.z + 1 },
      { x: current.x, z: current.z - 1 },
    ];

    for (const neighbor of neighbors) {
      if (neighbor.x < 0 || neighbor.x >= map.gridWidth || neighbor.z < 0 || neighbor.z >= map.gridDepth) continue;

      const idx = neighbor.z * map.gridWidth + neighbor.x;
      if (map.occupancy[idx] === 1) continue;

      const tentativeGScore = (gScore.get(`${current.x},${current.z}`) ?? Infinity) + 1;
      const key = `${neighbor.x},${neighbor.z}`;

      if (tentativeGScore < (gScore.get(key) ?? Infinity)) {
        cameFrom.set(key, current);
        gScore.set(key, tentativeGScore);
        fScore.set(key, tentativeGScore + heuristic(neighbor, targetGrid));

        if (!openSet.some((p) => p.x === neighbor.x && p.z === neighbor.z)) {
          openSet.push(neighbor);
        }
      }
    }
  }

  const targetIdx = targetGrid.z * map.gridWidth + targetGrid.x;
  if (map.occupancy[targetIdx] !== 1) {
    return [{ ...target }];
  }
  return null;
}
