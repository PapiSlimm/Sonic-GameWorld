type Point = { x: number; y: number };

export class Pathfinding {
  private static heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  static findPath(
    start: Point, 
    target: Point, 
    occupancy: Uint8Array,
    gridWidth: number,
    gridHeight: number,
    cellSize: number
  ): Point[] | null {
    const startGrid = {
      x: Math.floor(start.x / cellSize),
      y: Math.floor(start.y / cellSize)
    };
    const targetGrid = {
      x: Math.floor(target.x / cellSize),
      y: Math.floor(target.y / cellSize)
    };

    // Bounds checking
    if (startGrid.x < 0 || startGrid.x >= gridWidth || startGrid.y < 0 || startGrid.y >= gridHeight) return null;
    if (targetGrid.x < 0 || targetGrid.x >= gridWidth || targetGrid.y < 0 || targetGrid.y >= gridHeight) return null;

    if (startGrid.x === targetGrid.x && startGrid.y === targetGrid.y) return null;

    const openSet: Point[] = [startGrid];
    const cameFrom = new Map<string, Point>();
    
    const gScore = new Map<string, number>();
    gScore.set(`${startGrid.x},${startGrid.y}`, 0);

    const fScore = new Map<string, number>();
    fScore.set(`${startGrid.x},${startGrid.y}`, this.heuristic(startGrid, targetGrid));

    let nodesSearched = 0;
    while (openSet.length > 0 && nodesSearched < 1500) {
      nodesSearched++;
      
      openSet.sort((a, b) => 
        (fScore.get(`${a.x},${a.y}`) ?? Infinity) - (fScore.get(`${b.x},${b.y}`) ?? Infinity)
      );
      const current = openSet.shift()!;

      if (current.x === targetGrid.x && current.y === targetGrid.y) {
        return this.reconstructPath(cameFrom, current, cellSize);
      }

      const neighbors = [
        { x: current.x + 1, y: current.y }, 
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 }, 
        { x: current.x, y: current.y - 1 }
      ];

      for (const neighbor of neighbors) {
        if (neighbor.x < 0 || neighbor.x >= gridWidth || neighbor.y < 0 || neighbor.y >= gridHeight) continue;
        
        const idx = neighbor.y * gridWidth + neighbor.x;
        if (occupancy[idx] === 1) continue;

        const tentativeGScore = (gScore.get(`${current.x},${current.y}`) ?? Infinity) + 1;
        const key = `${neighbor.x},${neighbor.y}`;

        if (tentativeGScore < (gScore.get(key) ?? Infinity)) {
          cameFrom.set(key, current);
          gScore.set(key, tentativeGScore);
          fScore.set(key, tentativeGScore + this.heuristic(neighbor, targetGrid));
          
          if (!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    
    const targetIdx = targetGrid.y * gridWidth + targetGrid.x;
    if (occupancy[targetIdx] !== 1) {
      return [target];
    }
    return null;
  }

  private static reconstructPath(cameFrom: Map<string, Point>, current: Point, cellSize: number): Point[] {
    const path = [this.gridToWorld(current, cellSize)];
    while (cameFrom.has(`${current.x},${current.y}`)) {
      current = cameFrom.get(`${current.x},${current.y}`)!;
      path.unshift(this.gridToWorld(current, cellSize));
    }
    return path;
  }

  private static gridToWorld(p: Point, cellSize: number): Point {
    return {
      x: p.x * cellSize + cellSize / 2,
      y: p.y * cellSize + cellSize / 2
    };
  }
}
