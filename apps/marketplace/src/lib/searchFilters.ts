import type { EngineTarget, Genre, ProductCategory } from '@sonic-gameworld/gameworld-sdk';
import type { DemoProduct } from './types.js';
import { DEMO_REPUTATION } from './demo.js';

export type SortOption = 'RELEVANCE' | 'NEWEST' | 'TOP_RATED' | 'BEST_SELLING' | 'PRICE_ASC' | 'PRICE_DESC';

export interface LicenseFlagFilters {
  commercial?: boolean;
  multiplayer?: boolean;
  redistribution?: boolean;
  modification?: boolean;
  aiTraining?: boolean;
}

const LICENSE_FLAG_KEYS = ['commercial', 'multiplayer', 'redistribution', 'modification', 'aiTraining'] as const;

export interface SearchFilters {
  q: string;
  category?: ProductCategory;
  genre?: Genre;
  engine?: EngineTarget;
  minPriceCents?: number;
  maxPriceCents?: number;
  free: boolean;
  licenseFlags: LicenseFlagFilters;
  minCreatorScore?: number;
  sort: SortOption;
}

export const INITIAL_SEARCH_FILTERS: SearchFilters = {
  q: '',
  category: undefined,
  genre: undefined,
  engine: undefined,
  minPriceCents: undefined,
  maxPriceCents: undefined,
  free: false,
  licenseFlags: {},
  minCreatorScore: undefined,
  sort: 'RELEVANCE',
};

export type SearchAction =
  | { type: 'SET_QUERY'; q: string }
  | { type: 'SET_CATEGORY'; category?: ProductCategory }
  | { type: 'SET_GENRE'; genre?: Genre }
  | { type: 'SET_ENGINE'; engine?: EngineTarget }
  | { type: 'SET_PRICE_RANGE'; minPriceCents?: number; maxPriceCents?: number }
  | { type: 'SET_FREE'; free: boolean }
  | { type: 'SET_LICENSE_FLAG'; flag: keyof LicenseFlagFilters; value: boolean | undefined }
  | { type: 'SET_MIN_CREATOR_SCORE'; value?: number }
  | { type: 'SET_SORT'; sort: SortOption }
  | { type: 'RESET' }
  | { type: 'HYDRATE'; filters: Partial<SearchFilters> };

/**
 * Pure reducer driving the `/search` filter panel. Kept dependency-free from
 * React so it can be unit tested directly and reused by both the client
 * component and (if useful later) a server action.
 */
export function searchReducer(state: SearchFilters, action: SearchAction): SearchFilters {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, q: action.q };
    case 'SET_CATEGORY':
      return { ...state, category: action.category };
    case 'SET_GENRE':
      return { ...state, genre: action.genre };
    case 'SET_ENGINE':
      return { ...state, engine: action.engine };
    case 'SET_PRICE_RANGE':
      return { ...state, minPriceCents: action.minPriceCents, maxPriceCents: action.maxPriceCents };
    case 'SET_FREE':
      return { ...state, free: action.free, minPriceCents: action.free ? undefined : state.minPriceCents, maxPriceCents: action.free ? undefined : state.maxPriceCents };
    case 'SET_LICENSE_FLAG': {
      const next = { ...state.licenseFlags };
      if (action.value === undefined) delete next[action.flag];
      else next[action.flag] = action.value;
      return { ...state, licenseFlags: next };
    }
    case 'SET_MIN_CREATOR_SCORE':
      return { ...state, minCreatorScore: action.value };
    case 'SET_SORT':
      return { ...state, sort: action.sort };
    case 'RESET':
      return { ...INITIAL_SEARCH_FILTERS };
    case 'HYDRATE':
      return { ...state, ...action.filters, licenseFlags: { ...state.licenseFlags, ...action.filters.licenseFlags } };
    default:
      return state;
  }
}

export function activeFilterCount(filters: SearchFilters): number {
  let n = 0;
  if (filters.category) n += 1;
  if (filters.genre) n += 1;
  if (filters.engine) n += 1;
  if (filters.free) n += 1;
  if (filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined) n += 1;
  if (filters.minCreatorScore !== undefined) n += 1;
  n += Object.values(filters.licenseFlags).filter((v) => v !== undefined).length;
  return n;
}

// ---------------------------------------------------------------------------
// Ranking (CONTRACTS §14, simplified for a client-side demo dataset)
// ---------------------------------------------------------------------------

function textRelevance(product: DemoProduct, q: string): number {
  if (!q.trim()) return 0.5;
  const needle = q.trim().toLowerCase();
  const haystacks = [product.name, product.description, ...product.tags];
  let score = 0;
  for (const h of haystacks) {
    const hay = h.toLowerCase();
    if (hay === needle) score = Math.max(score, 1);
    else if (hay.includes(needle)) score = Math.max(score, 0.75);
    else if (needle.split(/\s+/).some((word) => word.length > 2 && hay.includes(word))) score = Math.max(score, 0.4);
  }
  return score;
}

function creatorScoreFor(product: DemoProduct): number {
  const handle = product.creator.handle;
  return DEMO_REPUTATION[handle]?.score ?? 50;
}

function daysSince(iso: string, nowMs: number): number {
  return Math.max(0, (nowMs - Date.parse(iso)) / 86_400_000);
}

const MAX_SALES_NORMALIZER = 15_000;
const RECENCY_HALF_LIFE_DAYS = 120;

/**
 * `rankProduct` per CONTRACTS §14:
 * `relevance*.25 + quality*.15 + creatorReputation*.15 + conversion*.1 +
 *  retention*.1 + recency*.1 + compatibility*.1 + userPref*.05`
 *
 * Deterministic given `(product, filters, nowMs)` — no randomness, no I/O —
 * so it is straightforward to unit test.
 */
export function rankProduct(product: DemoProduct, filters: SearchFilters, nowMs = Date.now()): number {
  const relevance = textRelevance(product, filters.q);
  const quality = product.rating / 5;
  const creatorReputation = creatorScoreFor(product) / 100;
  const conversion = Math.min(1, product.sales / MAX_SALES_NORMALIZER);
  const retention = quality; // no retention telemetry in the demo dataset; quality is the best proxy we have
  const recencyDays = product.publishedAt ? daysSince(product.publishedAt, nowMs) : RECENCY_HALF_LIFE_DAYS;
  const recency = Math.pow(0.5, recencyDays / RECENCY_HALF_LIFE_DAYS);
  const compatibility = filters.engine ? (product.engines.includes(filters.engine) ? 1 : 0) : 0.5;
  const userPref = product.featured ? 1 : 0;

  return (
    relevance * 0.25 +
    quality * 0.15 +
    creatorReputation * 0.15 +
    conversion * 0.1 +
    retention * 0.1 +
    recency * 0.1 +
    compatibility * 0.1 +
    userPref * 0.05
  );
}

function matchesLicenseFlags(product: DemoProduct, flags: LicenseFlagFilters): boolean {
  for (const key of LICENSE_FLAG_KEYS) {
    const wanted = flags[key];
    if (wanted === undefined) continue;
    if (product.license[key] !== wanted) return false;
  }
  return true;
}

export function matchesFilters(product: DemoProduct, filters: SearchFilters): boolean {
  if (filters.category && product.category !== filters.category) return false;
  if (filters.genre && !product.genre.includes(filters.genre)) return false;
  if (filters.engine && !product.engines.includes(filters.engine)) return false;
  if (filters.free && product.priceCents !== 0) return false;
  if (!filters.free) {
    if (filters.minPriceCents !== undefined && product.priceCents < filters.minPriceCents) return false;
    if (filters.maxPriceCents !== undefined && product.priceCents > filters.maxPriceCents) return false;
  }
  if (filters.minCreatorScore !== undefined && creatorScoreFor(product) < filters.minCreatorScore) return false;
  if (!matchesLicenseFlags(product, filters.licenseFlags)) return false;
  if (filters.q.trim() && textRelevance(product, filters.q) === 0) return false;
  return true;
}

const publishedAtMs = (p: DemoProduct): number => (p.publishedAt ? Date.parse(p.publishedAt) : 0);

const SORTERS: Record<SortOption, (a: DemoProduct, b: DemoProduct, filters: SearchFilters, nowMs: number) => number> = {
  RELEVANCE: (a, b, filters, nowMs) => rankProduct(b, filters, nowMs) - rankProduct(a, filters, nowMs),
  NEWEST: (a, b) => publishedAtMs(b) - publishedAtMs(a),
  TOP_RATED: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
  BEST_SELLING: (a, b) => b.sales - a.sales,
  PRICE_ASC: (a, b) => a.priceCents - b.priceCents,
  PRICE_DESC: (a, b) => b.priceCents - a.priceCents,
};

/**
 * Filters + ranks + sorts the demo catalog for `/search` and `/category/[slug]`.
 * This is the "search filter reducer['s companion filter function]" exercised
 * by `searchFilters.test.ts`; the real API path (`gameworld-sdk`'s
 * `marketplace.search`) performs the equivalent server-side when reachable.
 */
export function applyProductFilters(products: DemoProduct[], filters: SearchFilters, nowMs = Date.now()): DemoProduct[] {
  const filtered = products.filter((p) => matchesFilters(p, filters));
  return [...filtered].sort((a, b) => SORTERS[filters.sort](a, b, filters, nowMs));
}
