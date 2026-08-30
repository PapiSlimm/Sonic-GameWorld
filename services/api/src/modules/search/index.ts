// search module (§9): `GET /search?q=&category=&genre=&engine=` — the platform-wide, non-spatial
// product search endpoint. `GET /marketplace/search` (marketplace/index.ts) shares the same
// candidate-resolution logic (`productSearch.ts`) but additionally applies the §14 ranking engine;
// this endpoint returns matches ordered by plain search relevance, which is what a simple
// "search box" integration (SDKs, the developer portal sandbox, `client.search.*`) expects.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ENGINE_TARGETS, GENRES, PRODUCT_CATEGORIES, type EngineTarget, type Genre, type ProductCategory } from '@sonic-gameworld/world-schema';
import { PaginationQuerySchema } from '../../plugins/pagination.js';
import { serializeProduct } from '../products/index.js';
import { findMatchingProducts, paginateInMemory } from './productSearch.js';

const SearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  category: z.enum(PRODUCT_CATEGORIES as [ProductCategory, ...ProductCategory[]]).optional(),
  genre: z.enum(GENRES as [Genre, ...Genre[]]).optional(),
  engine: z.enum(ENGINE_TARGETS as [EngineTarget, ...EngineTarget[]]).optional(),
});

export async function registerSearchModule(app: FastifyInstance): Promise<void> {
  app.get('/search', async (request) => {
    const query = SearchQuerySchema.parse(request.query ?? {});
    const matches = await findMatchingProducts(app, query);
    matches.sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id));

    const withId = matches.map((m) => ({ id: m.product.id as string, ...m }));
    const page = paginateInMemory(withId, query);
    return {
      items: page.items.map((m) => ({ ...serializeProduct(m.product), searchScore: m.score })),
      nextCursor: page.nextCursor,
    };
  });
}
