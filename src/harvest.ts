import { Grid } from "./grid";
import { MaterialId } from "./materials";

/**
 * BFS to find all connected Flower cells and their connected Stem cells,
 * starting from any Flower or Stem cell. Returns the full cluster as a Set
 * of grid indices, or null if the start cell isn't a Flower or Stem.
 */
export function findFlowerCluster(grid: Grid, startX: number, startY: number): Set<number> | null {
  const startId = grid.get(startX, startY);
  if (startId !== MaterialId.Flower && startId !== MaterialId.Stem) return null;

  const cluster = new Set<number>();
  const queue: [number, number][] = [[startX, startY]];
  const key = (x: number, y: number) => y * grid.width + x;
  cluster.add(key(startX, startY));

  // First pass: find all connected Flower and Stem cells
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!grid.inBounds(nx, ny)) continue;
      const k = key(nx, ny);
      if (cluster.has(k)) continue;
      const id = grid.get(nx, ny);
      if (id === MaterialId.Flower || id === MaterialId.Stem) {
        cluster.add(k);
        queue.push([nx, ny]);
      }
    }
  }

  return cluster;
}

/**
 * Harvests a flower cluster: removes all Flower and Stem cells connected to
 * the clicked position. Returns true if something was harvested.
 */
export function harvestFlowerCluster(grid: Grid, startX: number, startY: number): boolean {
  const cluster = findFlowerCluster(grid, startX, startY);
  if (!cluster) return false;

  // Only harvest if the cluster contains at least one flower (don't harvest bare stems)
  let hasFlower = false;
  for (const idx of cluster) {
    if ((grid.ids[idx] as MaterialId) === MaterialId.Flower) {
      hasFlower = true;
      break;
    }
  }
  if (!hasFlower) return false;

  for (const idx of cluster) {
    const x = idx % grid.width;
    const y = Math.floor(idx / grid.width);
    grid.set(x, y, MaterialId.Empty);
  }

  return true;
}
