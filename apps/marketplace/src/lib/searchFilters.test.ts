import { describe, expect, it } from 'vitest';
import { DEMO_PRODUCTS } from './demo.js';
import {
  activeFilterCount,
  applyProductFilters,
  INITIAL_SEARCH_FILTERS,
  matchesFilters,
  rankProduct,
  searchReducer,
  type SearchFilters,
} from './searchFilters.js';

const NOW = Date.parse('2026-08-20T00:00:00.000Z');

describe('searchReducer', () => {
  it('starts from INITIAL_SEARCH_FILTERS', () => {
    expect(searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_QUERY', q: '' })).toEqual(INITIAL_SEARCH_FILTERS);
  });

  it('sets a text query', () => {
    const next = searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_QUERY', q: 'cyberpunk' });
    expect(next.q).toBe('cyberpunk');
  });

  it('sets category/genre/engine independently', () => {
    let state = searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_CATEGORY', category: 'WORLD' });
    state = searchReducer(state, { type: 'SET_GENRE', genre: 'CYBERPUNK' });
    state = searchReducer(state, { type: 'SET_ENGINE', engine: 'UNREAL' });
    expect(state).toMatchObject({ category: 'WORLD', genre: 'CYBERPUNK', engine: 'UNREAL' });
  });

  it('clearing free clears price range, but setting a price range does not touch free', () => {
    let state = searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_PRICE_RANGE', minPriceCents: 1000, maxPriceCents: 5000 });
    state = searchReducer(state, { type: 'SET_FREE', free: true });
    expect(state.free).toBe(true);
    expect(state.minPriceCents).toBeUndefined();
    expect(state.maxPriceCents).toBeUndefined();
  });

  it('sets and clears individual license flags without disturbing the others', () => {
    let state = searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_LICENSE_FLAG', flag: 'commercial', value: true });
    state = searchReducer(state, { type: 'SET_LICENSE_FLAG', flag: 'multiplayer', value: false });
    expect(state.licenseFlags).toEqual({ commercial: true, multiplayer: false });
    state = searchReducer(state, { type: 'SET_LICENSE_FLAG', flag: 'commercial', value: undefined });
    expect(state.licenseFlags).toEqual({ multiplayer: false });
  });

  it('sets minCreatorScore and sort', () => {
    let state = searchReducer(INITIAL_SEARCH_FILTERS, { type: 'SET_MIN_CREATOR_SCORE', value: 80 });
    state = searchReducer(state, { type: 'SET_SORT', sort: 'BEST_SELLING' });
    expect(state.minCreatorScore).toBe(80);
    expect(state.sort).toBe('BEST_SELLING');
  });

  it('RESET returns exactly the initial state, even from a fully populated one', () => {
    let state: SearchFilters = { ...INITIAL_SEARCH_FILTERS };
    state = searchReducer(state, { type: 'SET_QUERY', q: 'x' });
    state = searchReducer(state, { type: 'SET_CATEGORY', category: 'VEHICLE' });
    state = searchReducer(state, { type: 'SET_LICENSE_FLAG', flag: 'aiTraining', value: true });
    state = searchReducer(state, { type: 'RESET' });
    expect(state).toEqual(INITIAL_SEARCH_FILTERS);
  });

  it('HYDRATE merges partial state (e.g. from a URL) including nested license flags', () => {
    const state = searchReducer(INITIAL_SEARCH_FILTERS, {
      type: 'HYDRATE',
      filters: { category: 'CHARACTER', licenseFlags: { commercial: true } },
    });
    expect(state.category).toBe('CHARACTER');
    expect(state.licenseFlags).toEqual({ commercial: true });
  });

  it('is pure: unknown actions return the same state', () => {
    const state = INITIAL_SEARCH_FILTERS;
    // @ts-expect-error deliberately invalid action to exercise the default branch
    expect(searchReducer(state, { type: 'NOPE' })).toBe(state);
  });
});

describe('activeFilterCount', () => {
  it('is zero for the initial state', () => {
    expect(activeFilterCount(INITIAL_SEARCH_FILTERS)).toBe(0);
  });

  it('counts each active facet once, including multiple license flags', () => {
    const filters: SearchFilters = {
      ...INITIAL_SEARCH_FILTERS,
      category: 'WORLD',
      genre: 'CYBERPUNK',
      minCreatorScore: 70,
      licenseFlags: { commercial: true, multiplayer: false },
    };
    expect(activeFilterCount(filters)).toBe(5);
  });
});

describe('matchesFilters', () => {
  it('matches category exactly', () => {
    const product = DEMO_PRODUCTS.find((p) => p.category === 'VEHICLE')!;
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, category: 'VEHICLE' })).toBe(true);
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, category: 'CHARACTER' })).toBe(false);
  });

  it('matches price range and free', () => {
    const free = DEMO_PRODUCTS.find((p) => p.priceCents === 0)!;
    const paid = DEMO_PRODUCTS.find((p) => p.priceCents > 5000)!;
    expect(matchesFilters(free, { ...INITIAL_SEARCH_FILTERS, free: true })).toBe(true);
    expect(matchesFilters(paid, { ...INITIAL_SEARCH_FILTERS, free: true })).toBe(false);
    expect(matchesFilters(paid, { ...INITIAL_SEARCH_FILTERS, minPriceCents: 5000, maxPriceCents: 20000 })).toBe(true);
    expect(matchesFilters(free, { ...INITIAL_SEARCH_FILTERS, minPriceCents: 1 })).toBe(false);
  });

  it('matches license flags (e.g. commercial-safe only)', () => {
    const enterpriseOnly = DEMO_PRODUCTS.find((p) => p.slug === 'faction-reputation-engine')!;
    expect(enterpriseOnly.license.personal).toBe(false);
    expect(matchesFilters(enterpriseOnly, { ...INITIAL_SEARCH_FILTERS, licenseFlags: { commercial: true } })).toBe(true);
    expect(matchesFilters(enterpriseOnly, { ...INITIAL_SEARCH_FILTERS, licenseFlags: { redistribution: false } })).toBe(false);
  });

  it('matches minCreatorScore against the creator behind the product', () => {
    const product = DEMO_PRODUCTS[0]!;
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, minCreatorScore: 0 })).toBe(true);
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, minCreatorScore: 101 })).toBe(false);
  });

  it('filters out non-matching free text queries', () => {
    const product = DEMO_PRODUCTS.find((p) => p.slug === 'neo-kyoto-2099')!;
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, q: 'kyoto' })).toBe(true);
    expect(matchesFilters(product, { ...INITIAL_SEARCH_FILTERS, q: 'zzz_no_match_zzz' })).toBe(false);
  });
});

describe('rankProduct', () => {
  it('is deterministic for a fixed instant', () => {
    const product = DEMO_PRODUCTS[0]!;
    const a = rankProduct(product, INITIAL_SEARCH_FILTERS, NOW);
    const b = rankProduct(product, INITIAL_SEARCH_FILTERS, NOW);
    expect(a).toBe(b);
  });

  it('produces a bounded score', () => {
    for (const product of DEMO_PRODUCTS) {
      const score = rankProduct(product, INITIAL_SEARCH_FILTERS, NOW);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('ranks an exact-name text match above an unrelated product', () => {
    const exact = DEMO_PRODUCTS.find((p) => p.slug === 'neo-kyoto-2099')!;
    const unrelated = DEMO_PRODUCTS.find((p) => p.slug === 'tower-defense-core')!;
    const filters: SearchFilters = { ...INITIAL_SEARCH_FILTERS, q: 'Neo Kyoto 2099' };
    expect(rankProduct(exact, filters, NOW)).toBeGreaterThan(rankProduct(unrelated, filters, NOW));
  });

  it('rewards engine compatibility when an engine filter is set', () => {
    const product = DEMO_PRODUCTS.find((p) => p.slug === 'hovercycle-vex-7')!;
    expect(product.engines).toContain('UNREAL');
    expect(product.engines).not.toContain('GODOT');
    const matching: SearchFilters = { ...INITIAL_SEARCH_FILTERS, engine: 'UNREAL' };
    const nonMatching: SearchFilters = { ...INITIAL_SEARCH_FILTERS, engine: 'GODOT' };
    expect(rankProduct(product, matching, NOW)).toBeGreaterThan(rankProduct(product, nonMatching, NOW));
  });
});

describe('applyProductFilters', () => {
  it('returns only products in the requested category', () => {
    const results = applyProductFilters(DEMO_PRODUCTS, { ...INITIAL_SEARCH_FILTERS, category: 'CHARACTER' }, NOW);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.category === 'CHARACTER')).toBe(true);
  });

  it('sorts PRICE_ASC ascending by price', () => {
    const results = applyProductFilters(DEMO_PRODUCTS, { ...INITIAL_SEARCH_FILTERS, sort: 'PRICE_ASC' }, NOW);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.priceCents).toBeGreaterThanOrEqual(results[i - 1]!.priceCents);
    }
  });

  it('sorts BEST_SELLING descending by sales', () => {
    const results = applyProductFilters(DEMO_PRODUCTS, { ...INITIAL_SEARCH_FILTERS, sort: 'BEST_SELLING' }, NOW);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.sales).toBeLessThanOrEqual(results[i - 1]!.sales);
    }
  });

  it('sorts TOP_RATED descending by rating', () => {
    const results = applyProductFilters(DEMO_PRODUCTS, { ...INITIAL_SEARCH_FILTERS, sort: 'TOP_RATED' }, NOW);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.rating).toBeLessThanOrEqual(results[i - 1]!.rating);
    }
  });

  it('combines multiple filters (category + engine + price range) correctly', () => {
    const results = applyProductFilters(
      DEMO_PRODUCTS,
      { ...INITIAL_SEARCH_FILTERS, category: 'GAME_KIT', engine: 'WEB', maxPriceCents: 5000 },
      NOW,
    );
    for (const p of results) {
      expect(p.category).toBe('GAME_KIT');
      expect(p.engines).toContain('WEB');
      expect(p.priceCents).toBeLessThanOrEqual(5000);
    }
  });

  it('returns an empty array when no product satisfies the filters', () => {
    const results = applyProductFilters(DEMO_PRODUCTS, { ...INITIAL_SEARCH_FILTERS, minCreatorScore: 999 }, NOW);
    expect(results).toEqual([]);
  });

  it('covers all 10 product categories across the demo catalog', () => {
    const categories = new Set(DEMO_PRODUCTS.map((p) => p.category));
    expect(categories.size).toBe(10);
  });

  it('ships exactly 24 demo products', () => {
    expect(DEMO_PRODUCTS).toHaveLength(24);
  });
});
