export class SpatialGrid {
  private cellSize = 100;
  private grid: Record<string, string[]> = {};

  clear() {
    this.grid = {};
  }

  insert(id: string, x: number, y: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = `${cx},${cy}`;
    if (!this.grid[key]) this.grid[key] = [];
    this.grid[key].push(id);
  }

  getNearby(x: number, y: number, radius: number): string[] {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);
    const ids: string[] = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const cells = this.grid[key];
        if (cells) {
          ids.push(...cells);
        }
      }
    }
    return ids;
  }
}

export const spatialGrid = new SpatialGrid();
