// Cursor pagination helpers (§9: `?cursor=&limit=` → `{ items, nextCursor }`).
// Plain functions (no fastify state needed) plus a trivial fastify-plugin registration so it
// shows up in the app's plugin graph next to auth/rbac/quotas.
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Normalize a raw `{cursor, limit}` query into Prisma `findMany` args: fetch one extra row to
 * detect whether another page exists, using cursor-based (not offset) pagination. */
export function toPrismaPageArgs(query: PaginationQuery, defaultLimit = DEFAULT_PAGE_LIMIT): { take: number; skip?: number; cursor?: { id: string } } {
  const limit = Math.min(query.limit ?? defaultLimit, MAX_PAGE_LIMIT);
  if (query.cursor) {
    return { take: limit + 1, skip: 1, cursor: { id: query.cursor } };
  }
  return { take: limit + 1 };
}

/** Slice the (limit+1)-row result from `toPrismaPageArgs` back down to a `Page<T>`. */
export function toPage<T extends { id: string }>(rows: T[], query: PaginationQuery, defaultLimit = DEFAULT_PAGE_LIMIT): Page<T> {
  const limit = Math.min(query.limit ?? defaultLimit, MAX_PAGE_LIMIT);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? last.id : null };
}

async function paginationPlugin(_app: FastifyInstance): Promise<void> {
  // Stateless helpers only — registered for plugin-graph consistency and so future decorators
  // (e.g. a shared `fastify.paginate()` route helper) have an obvious home.
}

export default fp(paginationPlugin, { name: 'pagination' });
