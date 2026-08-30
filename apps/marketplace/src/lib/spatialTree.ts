import type { SpatialMapNode } from '@sonic-gameworld/gameworld-sdk';
import type { DemoProduct, DiscoveryCluster } from './types.js';
import { CATEGORY_LABEL, CLUSTER_BY_CATEGORY, CLUSTER_LABEL, GENRE_LABEL } from './types.js';

/**
 * Builds the full spatial discovery tree used by the left-hand breadcrumb
 * tree on `/`. Six levels deep, matching the CONTRACTS §5 hierarchy metaphor:
 *
 *   ROOT → WORLD (cluster) → CITY (genre) → DISTRICT (category)
 *        → BUILDING (product) → ROOM (showroom) → ASSET (the listing)
 *
 * `@sonic-gameworld/spatial-engine` doesn't yet ship a `DiscoveryGlobe` (see
 * the app README), so this same tree also feeds the 2D radial SVG that
 * stands in for it — one source of truth for both views.
 */
export function buildDiscoveryTree(products: DemoProduct[]): SpatialMapNode {
  const clusters: DiscoveryCluster[] = ['WORLDS', 'GAMES', 'ASSETS'];

  const clusterNodes: SpatialMapNode[] = clusters.map((cluster) => {
    const clusterProducts = products.filter((p) => CLUSTER_BY_CATEGORY[p.category] === cluster);
    const genres = Array.from(new Set(clusterProducts.map((p) => p.genre[0]).filter((g): g is NonNullable<typeof g> => Boolean(g))));

    const genreNodes: SpatialMapNode[] = genres.map((genre) => {
      const genreProducts = clusterProducts.filter((p) => p.genre[0] === genre);
      const categories = Array.from(new Set(genreProducts.map((p) => p.category)));

      const categoryNodes: SpatialMapNode[] = categories.map((category) => {
        const categoryProducts = genreProducts.filter((p) => p.category === category);
        const buildingNodes: SpatialMapNode[] = categoryProducts.map((product) => ({
          id: `building:${product.id}`,
          level: 'BUILDING',
          name: product.name,
          count: 1,
          thumbnailUrl: product.thumbnailUrl ?? null,
          children: [
            {
              id: `room:${product.id}`,
              level: 'ROOM',
              name: 'Showroom',
              count: 1,
              children: [
                {
                  id: `asset:${product.id}`,
                  level: 'ASSET',
                  name: product.name,
                  slug: product.slug,
                  productId: product.id,
                  count: 1,
                  thumbnailUrl: product.thumbnailUrl ?? null,
                  children: [],
                },
              ],
            },
          ],
        }));

        return {
          id: `district:${cluster}:${genre}:${category}`,
          level: 'DISTRICT',
          name: CATEGORY_LABEL[category],
          count: categoryProducts.length,
          children: buildingNodes,
        } satisfies SpatialMapNode;
      });

      return {
        id: `city:${cluster}:${genre}`,
        level: 'CITY',
        name: GENRE_LABEL[genre],
        count: genreProducts.length,
        children: categoryNodes,
      } satisfies SpatialMapNode;
    });

    return {
      id: `world:${cluster}`,
      level: 'WORLD',
      name: CLUSTER_LABEL[cluster],
      count: clusterProducts.length,
      children: genreNodes,
    } satisfies SpatialMapNode;
  });

  return {
    id: 'root',
    level: 'ROOT',
    name: 'GameWorld Market',
    count: products.length,
    children: clusterNodes,
  };
}

/** Flat path from root to a given asset node id, for breadcrumb rendering. */
export function findPath(root: SpatialMapNode, targetId: string): SpatialMapNode[] | undefined {
  if (root.id === targetId) return [root];
  for (const child of root.children) {
    const rest = findPath(child, targetId);
    if (rest) return [root, ...rest];
  }
  return undefined;
}

export interface GlobeItem {
  productId: string;
  name: string;
  cluster: DiscoveryCluster;
  genre: string;
}

export interface GlobeGenre {
  key: string;
  label: string;
  cluster: DiscoveryCluster;
  items: GlobeItem[];
}

export interface GlobeCluster {
  key: DiscoveryCluster;
  label: string;
  genres: GlobeGenre[];
  itemCount: number;
}

/** Three-ring cluster → genre → item summary that drives the radial globe view. */
export function buildGlobeClusters(products: DemoProduct[]): GlobeCluster[] {
  const clusters: DiscoveryCluster[] = ['WORLDS', 'GAMES', 'ASSETS'];
  return clusters.map((cluster) => {
    const clusterProducts = products.filter((p) => CLUSTER_BY_CATEGORY[p.category] === cluster);
    const genreKeys = Array.from(new Set(clusterProducts.map((p) => p.genre[0]).filter((g): g is NonNullable<typeof g> => Boolean(g))));
    const genres: GlobeGenre[] = genreKeys.map((genre) => ({
      key: `${cluster}:${genre}`,
      label: GENRE_LABEL[genre],
      cluster,
      items: clusterProducts
        .filter((p) => p.genre[0] === genre)
        .map((p) => ({ productId: p.id, name: p.name, cluster, genre: GENRE_LABEL[genre] })),
    }));
    return { key: cluster, label: CLUSTER_LABEL[cluster], genres, itemCount: clusterProducts.length };
  });
}
