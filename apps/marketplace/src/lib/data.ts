import { checkLicenseCompatibility } from '@sonic-gameworld/world-schema';
import type {
  CreatorPassport,
  FeaturedResponse,
  LicenseCheckInput,
  LicenseCheckResult,
  MarketplaceMap,
  MarketplaceSearchQuery,
  Product,
  ProductCategory,
  Review,
  SearchResult,
} from '@sonic-gameworld/gameworld-sdk';
import { getGameWorldClient } from './client.js';
import { DEMO_PRODUCTS, DEMO_REVIEWS, getDemoCreatorPassport, getDemoProductBySlug } from './demo.js';
import { applyProductFilters, INITIAL_SEARCH_FILTERS, type SearchFilters } from './searchFilters.js';
import { buildDiscoveryTree } from './spatialTree.js';
import type { DemoProduct } from './types.js';

const LIVE_API_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_API_URL);
const LIVE_CALL_TIMEOUT_MS = 1500;

/**
 * Calls the live GameWorld API when `NEXT_PUBLIC_API_URL` is configured,
 * falling back to `fallback()` on any error, timeout, or when no API URL is
 * set at all (the default for this offline demo build). This is the single
 * seam every page/component goes through, so the app degrades gracefully
 * with zero backend and picks up the real API transparently once deployed.
 */
async function withApiFallback<T>(liveCall: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!LIVE_API_CONFIGURED) return fallback();
  try {
    return await Promise.race([
      liveCall(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gameworld-api: timed out')), LIVE_CALL_TIMEOUT_MS)),
    ]);
  } catch {
    return fallback();
  }
}

export const CATEGORY_SLUGS: Record<ProductCategory, string> = {
  WORLD: 'world',
  GAME_KIT: 'game-kit',
  SYSTEM: 'system',
  AI_AGENT: 'ai-agent',
  CHARACTER: 'character',
  VEHICLE: 'vehicle',
  ENVIRONMENT: 'environment',
  CINEMATIC: 'cinematic',
  MISSION: 'mission',
  EXPERIENCE: 'experience',
};

const SLUG_TO_CATEGORY: Record<string, ProductCategory> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([category, slug]) => [slug, category as ProductCategory]),
);

export function categoryFromSlug(slug: string): ProductCategory | undefined {
  return SLUG_TO_CATEGORY[slug];
}

export function demoFeatured(): FeaturedResponse {
  const featured = DEMO_PRODUCTS.filter((p) => p.featured);
  const byNew = [...DEMO_PRODUCTS].sort((a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''));
  const byTrending = [...DEMO_PRODUCTS].sort((a, b) => b.sales - a.sales);
  const collections = [
    { id: 'col_cyberpunk', name: 'Cyberpunk Nights', slug: 'cyberpunk-nights', products: DEMO_PRODUCTS.filter((p) => p.genre.includes('CYBERPUNK')) },
    { id: 'col_free', name: 'Free This Week', slug: 'free-this-week', products: DEMO_PRODUCTS.filter((p) => p.priceCents === 0) },
    { id: 'col_ai', name: 'AI-Native Toolkit', slug: 'ai-native-toolkit', products: DEMO_PRODUCTS.filter((p) => p.category === 'AI_AGENT' || p.passport?.aiAssisted) },
  ];
  return {
    hero: featured.slice(0, 5),
    collections,
    trending: byTrending.slice(0, 8),
    newReleases: byNew.slice(0, 8),
    creators: [],
  };
}

export async function getFeatured(): Promise<FeaturedResponse> {
  return withApiFallback(async () => getGameWorldClient().marketplace.featured(), demoFeatured);
}

export async function getMarketplaceMap(): Promise<MarketplaceMap> {
  return withApiFallback(
    async () => getGameWorldClient().marketplace.map(),
    () => ({ root: buildDiscoveryTree(DEMO_PRODUCTS), generatedAt: new Date().toISOString() }),
  );
}

export function demoSearch(query: MarketplaceSearchQuery): SearchResult<DemoProduct> {
  const filters: SearchFilters = {
    ...INITIAL_SEARCH_FILTERS,
    q: query.q ?? '',
    category: query.category,
    genre: query.genre,
    engine: query.engine,
    minPriceCents: query.minPriceCents,
    maxPriceCents: query.maxPriceCents,
    free: query.free ?? false,
    sort: query.sort ?? 'RELEVANCE',
  };
  let items = applyProductFilters(DEMO_PRODUCTS, filters);
  if (query.creatorId) items = items.filter((p) => p.creator.id === query.creatorId);
  if (query.tag) items = items.filter((p) => p.tags.includes(query.tag!));
  const limit = query.limit ?? 24;
  return { items: items.slice(0, limit), nextCursor: null, total: items.length, tookMs: 1 };
}

export async function searchProducts(query: MarketplaceSearchQuery): Promise<SearchResult<DemoProduct>> {
  return withApiFallback(
    async () => (await getGameWorldClient().marketplace.search(query)) as SearchResult<DemoProduct>,
    () => demoSearch(query),
  );
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return withApiFallback(
    async () => getGameWorldClient().products.get(slug),
    () => getDemoProductBySlug(slug),
  );
}

export async function getReviews(productId: string): Promise<Review[]> {
  return withApiFallback(
    async () => (await getGameWorldClient().products.listReviews(productId)).items,
    () => DEMO_REVIEWS[productId] ?? [],
  );
}

export async function getCreatorPassport(handle: string): Promise<CreatorPassport | undefined> {
  return withApiFallback(
    async () => getGameWorldClient().creators.get(handle),
    () => getDemoCreatorPassport(handle),
  );
}

/**
 * License compatibility check for "Check compatibility with my project".
 * Falls back to `@sonic-gameworld/world-schema`'s `checkLicenseCompatibility`
 * — the exact same deterministic engine the live API runs — so results are
 * identical whether or not `services/api` is reachable.
 */
export async function checkCompatibility(input: LicenseCheckInput): Promise<LicenseCheckResult> {
  return withApiFallback(
    async () => getGameWorldClient().licenses.check(input),
    () => checkLicenseCompatibility(input.licenses ?? [], input.intent),
  );
}

export function relatedProducts(product: DemoProduct, limit = 4): DemoProduct[] {
  return DEMO_PRODUCTS.filter(
    (p) => p.id !== product.id && (p.category === product.category || p.genre.some((g) => product.genre.includes(g))),
  )
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
}

export function productsByCategory(category: ProductCategory): DemoProduct[] {
  return DEMO_PRODUCTS.filter((p) => p.category === category);
}

export function productsByCreator(creatorId: string): DemoProduct[] {
  return DEMO_PRODUCTS.filter((p) => p.creator.id === creatorId);
}

export function findProductById(id: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.id === id);
}
