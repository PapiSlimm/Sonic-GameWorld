import type { Genre, ProductCategory } from '@sonic-gameworld/world-schema';

/**
 * The minimal shape `buildDiscoveryGraph` needs from a marketplace product. Deliberately NOT imported
 * from `@sonic-gameworld/gameworld-sdk` (that would make this package depend on the SDK, which itself
 * depends on world-schema — an awkward direction for a rendering package to point in). `Product` and
 * `ProductSummary` from gameworld-sdk both satisfy this shape structurally, so callers can pass either
 * straight through with no adapter.
 */
export interface DiscoveryProduct {
  id: string;
  slug?: string;
  name: string;
  category: ProductCategory;
  genre?: Genre[];
  thumbnailUrl?: string | null;
  rating?: number;
  sales?: number;
  priceCents?: number;
}

export interface DiscoveryNode {
  id: string;
  productId: string;
  name: string;
  slug?: string;
  category: ProductCategory;
  genres: Genre[];
  thumbnailUrl: string | null;
  rating: number;
  sales: number;
  priceCents: number;
  position: { x: number; y: number; z: number };
  /** Visual radius multiplier — grows with rating and (log) sales so popular products read as bigger nodes. */
  size: number;
}

export type DiscoveryEdgeKind = 'CATEGORY_RING';

export interface DiscoveryEdge {
  id: string;
  from: string;
  to: string;
  kind: DiscoveryEdgeKind;
}

export interface DiscoveryGraph {
  nodes: DiscoveryNode[];
  edges: DiscoveryEdge[];
  radius: number;
}

export interface BuildDiscoveryGraphOptions {
  /** Sphere radius products are laid out on. Default 100. */
  radius?: number;
}

/**
 * Lays marketplace products out on a sphere for the GameWorld Market discovery globe: one latitude
 * "band" per category, products spaced evenly in longitude around their band, connected in a ring so
 * each category reads as a visible cluster. Deterministic for a given product list + order.
 */
export function buildDiscoveryGraph(products: DiscoveryProduct[], opts: BuildDiscoveryGraphOptions = {}): DiscoveryGraph {
  const radius = opts.radius ?? 100;
  const nodes: DiscoveryNode[] = [];
  const edges: DiscoveryEdge[] = [];
  if (products.length === 0) return { nodes, edges, radius };

  const categories: ProductCategory[] = [];
  const grouped = new Map<ProductCategory, DiscoveryProduct[]>();
  for (const p of products) {
    if (!grouped.has(p.category)) {
      grouped.set(p.category, []);
      categories.push(p.category);
    }
    grouped.get(p.category)!.push(p);
  }

  categories.forEach((category, ci) => {
    const items = grouped.get(category) ?? [];
    // Spread bands across [-55°, 55°] latitude so clusters stay away from the crowded poles.
    const latDeg = categories.length === 1 ? 0 : -55 + (110 * ci) / Math.max(categories.length - 1, 1);
    const lat = (latDeg * Math.PI) / 180;
    const longitudeOffset = ci * 0.35;
    let firstId: string | null = null;
    let prevId: string | null = null;

    items.forEach((p, pi) => {
      const lon = (2 * Math.PI * pi) / Math.max(items.length, 1) + longitudeOffset;
      const x = radius * Math.cos(lat) * Math.cos(lon);
      const y = radius * Math.sin(lat);
      const z = radius * Math.cos(lat) * Math.sin(lon);
      const id = `node_${p.id}`;
      const ratingBoost = Math.min(3, (p.rating ?? 0) / 1.7);
      const salesBoost = Math.log10((p.sales ?? 0) + 1) * 0.5;
      const size = 1 + ratingBoost + salesBoost;

      nodes.push({
        id,
        productId: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        genres: p.genre ?? [],
        thumbnailUrl: p.thumbnailUrl ?? null,
        rating: p.rating ?? 0,
        sales: p.sales ?? 0,
        priceCents: p.priceCents ?? 0,
        position: { x, y, z },
        size,
      });

      if (prevId) edges.push({ id: `edge_${prevId}_${id}`, from: prevId, to: id, kind: 'CATEGORY_RING' });
      firstId ??= id;
      prevId = id;
    });

    if (items.length > 2 && prevId && firstId && prevId !== firstId) {
      edges.push({ id: `edge_${prevId}_${firstId}_close`, from: prevId, to: firstId, kind: 'CATEGORY_RING' });
    }
  });

  return { nodes, edges, radius };
}
