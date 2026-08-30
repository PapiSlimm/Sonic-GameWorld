import { describe, expect, it } from 'vitest';
import { bucketForRefKind, buildSpatialMap, type MapProductInput } from './spatialMap.js';

function product(overrides: Partial<MapProductInput>): MapProductInput {
  return { id: 'p1', slug: 'p1', name: 'P1', refKind: 'ASSET', genre: [], priceCents: 100, thumbnailUrl: null, rating: 4, sales: 10, ...overrides };
}

describe('bucketForRefKind', () => {
  it('maps WORLD/GAME to their named buckets and everything else to ASSETS', () => {
    expect(bucketForRefKind('WORLD')).toBe('WORLDS');
    expect(bucketForRefKind('GAME')).toBe('GAMES');
    expect(bucketForRefKind('ASSET')).toBe('ASSETS');
    expect(bucketForRefKind('NPC')).toBe('ASSETS');
    expect(bucketForRefKind('MISSION')).toBe('ASSETS');
  });
});

describe('buildSpatialMap', () => {
  it('always returns exactly the three buckets, in WORLDS/GAMES/ASSETS order', () => {
    const tree = buildSpatialMap([]);
    expect(tree.map((b) => b.bucket)).toEqual(['WORLDS', 'GAMES', 'ASSETS']);
    expect(tree.every((b) => b.count === 0)).toBe(true);
  });

  it('groups products into their bucket and genre, with an accurate distinct-product count', () => {
    const products = [
      product({ id: 'w1', refKind: 'WORLD', genre: ['FANTASY'] }),
      product({ id: 'w2', refKind: 'WORLD', genre: ['FANTASY', 'RPG'] }), // counts once for the bucket, twice across genre leaves
      product({ id: 'g1', refKind: 'GAME', genre: ['SCIFI'] }),
      product({ id: 'a1', refKind: 'ASSET', genre: [] }), // untagged
    ];
    const tree = buildSpatialMap(products);

    const worlds = tree.find((b) => b.bucket === 'WORLDS')!;
    expect(worlds.count).toBe(2); // distinct products, not genre-leaf occurrences
    const fantasy = worlds.genres.find((g) => g.genre === 'FANTASY')!;
    expect(fantasy.count).toBe(2);
    const rpg = worlds.genres.find((g) => g.genre === 'RPG')!;
    expect(rpg.count).toBe(1);

    const assets = tree.find((b) => b.bucket === 'ASSETS')!;
    expect(assets.genres.find((g) => g.genre === 'UNTAGGED')?.count).toBe(1);
  });

  it('sorts items within a genre by sales then rating, and caps at itemsPerGenre', () => {
    const products = [
      product({ id: 'p_low', refKind: 'ASSET', genre: ['HORROR'], sales: 1, rating: 3 }),
      product({ id: 'p_high', refKind: 'ASSET', genre: ['HORROR'], sales: 100, rating: 5 }),
      product({ id: 'p_mid', refKind: 'ASSET', genre: ['HORROR'], sales: 50, rating: 4 }),
    ];
    const tree = buildSpatialMap(products, 2);
    const horror = tree.find((b) => b.bucket === 'ASSETS')!.genres.find((g) => g.genre === 'HORROR')!;
    expect(horror.count).toBe(3); // exact count unaffected by the item cap
    expect(horror.items.map((i) => i.id)).toEqual(['p_high', 'p_mid']); // capped at 2, sales-desc
  });
});
