// Search service: indexes/queries the `SearchDocument` table. Uses OpenSearch when
// OPENSEARCH_URL is configured; otherwise falls back to a Postgres ILIKE scan over the same
// rows (see docs/CONTRACTS.md §2). Domain modules (marketplace, search, worlds, ...) call
// `index()` whenever a searchable entity changes, and `search()` to query it.
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import type { AppConfig } from './config.js';
import type { PrismaLike } from './db.js';

export interface SearchDoc {
  kind: string;
  refId: string;
  text: string;
}

export interface SearchHit {
  id: string;
  kind: string;
  refId: string;
  text: string;
  score: number;
}

export interface SearchOptions {
  kind?: string;
  limit?: number;
}

export interface SearchService {
  isOpenSearchEnabled(): boolean;
  index(doc: SearchDoc): Promise<void>;
  remove(kind: string, refId: string): Promise<void>;
  search(query: string, opts?: SearchOptions): Promise<SearchHit[]>;
}

function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export function createSearchService(config: AppConfig, prisma: PrismaLike): SearchService {
  const index = config.search.index;
  const opensearch = config.search.openSearchUrl
    ? new OpenSearchClient({
        node: config.search.openSearchUrl,
        auth: config.search.username && config.search.password ? { username: config.search.username, password: config.search.password } : undefined,
      })
    : undefined;

  function isOpenSearchEnabled(): boolean {
    return opensearch !== undefined;
  }

  async function indexDoc(doc: SearchDoc): Promise<void> {
    // Always mirror into Postgres so the ILIKE fallback stays correct even when OpenSearch is up
    // (and so a later OpenSearch outage degrades gracefully rather than losing data).
    await prisma.searchDocument.upsert({
      where: { kind_refId: { kind: doc.kind, refId: doc.refId } },
      create: { kind: doc.kind, refId: doc.refId, text: doc.text },
      update: { text: doc.text },
    });
    if (opensearch) {
      await opensearch.index({ index, id: `${doc.kind}:${doc.refId}`, body: doc, refresh: true }).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[search] opensearch index failed, relying on Postgres fallback:', err);
      });
    }
  }

  async function remove(kind: string, refId: string): Promise<void> {
    await prisma.searchDocument.deleteMany({ where: { kind, refId } });
    if (opensearch) {
      await opensearch.delete({ index, id: `${kind}:${refId}` }).catch(() => undefined);
    }
  }

  async function searchIlike(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const limit = opts.limit ?? 20;
    const where: Record<string, unknown> = { text: { contains: escapeIlike(query), mode: 'insensitive' } };
    if (opts.kind) where.kind = opts.kind;
    const rows = (await prisma.searchDocument.findMany({ where, take: limit })) as Array<{ id: string; kind: string; refId: string; text: string }>;
    const needle = query.toLowerCase();
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      refId: r.refId,
      text: r.text,
      // Cheap relevance proxy: earlier / more exact matches score higher. Real ranking (§14)
      // is layered on top by the marketplace module.
      score: r.text.toLowerCase() === needle ? 1 : 1 / (1 + r.text.toLowerCase().indexOf(needle) + 1e-6),
    }));
  }

  async function search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
    if (!query.trim()) return [];
    if (opensearch) {
      try {
        const must: unknown[] = [{ match: { text: { query, fuzziness: 'AUTO' } } }];
        if (opts.kind) must.push({ term: { kind: opts.kind } });
        const res = await opensearch.search({
          index,
          body: { size: opts.limit ?? 20, query: { bool: { must } } },
        });
        const hits = (res.body?.hits?.hits ?? []) as Array<{ _id: string; _score: number; _source: SearchDoc }>;
        if (hits.length > 0 || res.body?.hits?.total?.value === 0) {
          return hits.map((h) => ({ id: h._id, kind: h._source.kind, refId: h._source.refId, text: h._source.text, score: h._score }));
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[search] opensearch query failed, falling back to Postgres ILIKE:', err);
      }
    }
    return searchIlike(query, opts);
  }

  return { isOpenSearchEnabled, index: indexDoc, remove, search };
}
