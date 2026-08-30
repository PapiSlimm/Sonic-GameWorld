// Shared "which published products match these filters" query — used by both `GET /search`
// (search/index.ts) and `GET /marketplace/search` (marketplace/index.ts) so "how do q/category/
// genre/engine filters resolve to products" is defined exactly once. Per docs/CONTRACTS.md §2,
// `app.searchService` itself already picks OpenSearch vs. the Postgres ILIKE fallback — this file
// only decides *when* to go through it (a free-text `q`) vs. a plain DB scan (filters only).
import type { FastifyInstance } from 'fastify';
import type { EngineTarget, Genre, ProductCategory } from '@sonic-gameworld/world-schema';
import type { PaginationQuery } from '../../plugins/pagination.js';
import { isEngineCompatible } from '../products/engine.js';

export interface ProductSearchFilters {
  q?: string;
  category?: ProductCategory;
  genre?: Genre;
  engine?: EngineTarget;
}

export interface ScoredProduct {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any;
  /** Search-engine relevance score when `q` is set; a neutral `1` for plain filtering (there is
   * no relevance signal to rank by, so every match is equally "relevant"). */
  score: number;
}

/**
 * Resolve every currently-published, non-deleted product matching `filters`. Array-valued product
 * fields (`genre`, `engines`) are filtered in JS rather than via a Prisma `where` clause on
 * purpose: it keeps this one code path correct against both real Postgres and the in-memory
 * `fakePrisma` test double used across this package's test suite, instead of relying on an array
 * `where` operator (`has`) fakePrisma doesn't implement.
 */
export async function findMatchingProducts(app: FastifyInstance, filters: ProductSearchFilters): Promise<ScoredProduct[]> {
  let candidates: ScoredProduct[];

  if (filters.q && filters.q.trim().length > 0) {
    const hits = await app.searchService.search(filters.q, { kind: 'product', limit: 200 });
    const products = await Promise.all(hits.map((h) => app.db.product.findUnique({ where: { id: h.refId } })));
    candidates = hits
      .map((h, i) => ({ product: products[i], score: h.score }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((c): c is { product: any; score: number } => Boolean(c.product) && !c.product.deletedAt && c.product.status === 'PUBLISHED');
    if (filters.category) candidates = candidates.filter((c) => c.product.category === filters.category);
  } else {
    const rows = await app.db.product.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, ...(filters.category ? { category: filters.category } : {}) },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candidates = rows.map((p: any) => ({ product: p, score: 1 }));
  }

  if (filters.genre) candidates = candidates.filter((c) => (c.product.genre as string[]).includes(filters.genre as string));
  if (filters.engine) candidates = candidates.filter((c) => isEngineCompatible(c.product.engines as EngineTarget[], filters.engine as EngineTarget));

  return candidates;
}

export interface InMemoryPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Cursor-paginate an already-fetched, already-sorted, in-memory list. Distinct from
 * `toPrismaPageArgs`/`toPage` (src/plugins/pagination.ts), which assume the *database* does the
 * slicing — not applicable here since filtering/ranking happens in JS after the fetch (see
 * `findMatchingProducts` above).
 */
export function paginateInMemory<T extends { id: string }>(items: T[], query: PaginationQuery, defaultLimit = 20): InMemoryPage<T> {
  const limit = Math.min(query.limit ?? defaultLimit, 100);
  let startIndex = 0;
  if (query.cursor) {
    const idx = items.findIndex((i) => i.id === query.cursor);
    startIndex = idx === -1 ? items.length : idx + 1;
  }
  const sliced = items.slice(startIndex, startIndex + limit + 1);
  const hasMore = sliced.length > limit;
  const page = hasMore ? sliced.slice(0, limit) : sliced;
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? last.id : null };
}
