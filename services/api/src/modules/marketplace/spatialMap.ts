// GET /marketplace/map: the spatial discovery tree — WORLDS/GAMES/ASSETS -> genre -> items, with
// counts at every level (§9, §5 spatial taxonomy). Pure tree-building over already-fetched
// products so it's trivially unit-testable without a database.
import type { Genre } from '@sonic-gameworld/world-schema';

export type MapBucketName = 'WORLDS' | 'GAMES' | 'ASSETS';

export interface MapProductInput {
  id: string;
  slug: string;
  name: string;
  refKind: string;
  genre: Genre[];
  priceCents: number;
  thumbnailUrl: string | null;
  rating: number;
  sales: number;
}

export interface MapItem {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  thumbnailUrl: string | null;
  rating: number;
  sales: number;
}

export interface MapGenreNode {
  genre: Genre | 'UNTAGGED';
  count: number;
  items: MapItem[];
}

export interface MapBucketNode {
  bucket: MapBucketName;
  count: number;
  genres: MapGenreNode[];
}

/** Which top-level bucket a product's refKind falls into — WORLD -> WORLDS, GAME -> GAMES,
 * everything else (ASSET/NPC/MISSION/SYSTEM) -> ASSETS. */
export function bucketForRefKind(refKind: string): MapBucketName {
  if (refKind === 'WORLD') return 'WORLDS';
  if (refKind === 'GAME') return 'GAMES';
  return 'ASSETS';
}

/** Build the WORLDS/GAMES/ASSETS -> genre -> items tree. `itemsPerGenre` caps the item list at
 * each genre leaf (the platform-wide counts are exact regardless of that cap). */
export function buildSpatialMap(products: MapProductInput[], itemsPerGenre = 12): MapBucketNode[] {
  const buckets: Record<MapBucketName, Map<string, MapProductInput[]>> = { WORLDS: new Map(), GAMES: new Map(), ASSETS: new Map() };

  for (const product of products) {
    const bucket = bucketForRefKind(product.refKind);
    const genres = product.genre.length > 0 ? product.genre : (['UNTAGGED'] as const);
    for (const genre of genres) {
      const map = buckets[bucket];
      const list = map.get(genre) ?? [];
      list.push(product);
      map.set(genre, list);
    }
  }

  const order: MapBucketName[] = ['WORLDS', 'GAMES', 'ASSETS'];
  return order.map((bucket) => {
    const genreMap = buckets[bucket];
    const genreNodes: MapGenreNode[] = [...genreMap.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([genre, items]) => ({
        genre: genre as Genre | 'UNTAGGED',
        count: items.length,
        items: [...items]
          .sort((a, b) => b.sales - a.sales || b.rating - a.rating)
          .slice(0, itemsPerGenre)
          .map((p) => ({ id: p.id, slug: p.slug, name: p.name, priceCents: p.priceCents, thumbnailUrl: p.thumbnailUrl, rating: p.rating, sales: p.sales })),
      }));
    // A product tagged with N genres counts once per genre for navigation purposes, but the
    // bucket-level count should reflect distinct products, not the sum across genres.
    const distinctCount = new Set(products.filter((p) => bucketForRefKind(p.refKind) === bucket).map((p) => p.id)).size;
    return { bucket, count: distinctCount, genres: genreNodes };
  });
}
