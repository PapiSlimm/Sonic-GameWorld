// AI context assembly (CONTRACTS.md §8): sceneGraphToSemantic + RAG over "AIKnowledgeBase".
//
// Cross-package note: prisma/schema.prisma has no dedicated `AIKnowledgeBase` model — the
// generic `SearchDocument { kind, refId, text, embedding vector(768)? }` table is what §10
// actually ships for pgvector-backed lookups, so knowledge snippets are stored there under
// `kind: 'ai_knowledge'` (see seedKnowledge()/ragSearch() below). Flagged in this agent's final
// report as a naming mismatch to reconcile with CONTRACTS.md §8's wording.
import type { FastifyInstance } from 'fastify';
import { sceneGraphToSemantic, type WorldDocument } from '@sonic-gameworld/world-schema';

export const KNOWLEDGE_KIND = 'ai_knowledge';

export interface KnowledgeSnippet {
  id: string;
  refId: string;
  text: string;
  score?: number;
}

/**
 * Deterministic, dependency-free pseudo-embedding: hashes lowercase word tokens into a fixed
 * 768-dim bag-of-words vector. Not a real semantic embedding — it exists purely so the pgvector
 * cosine-similarity SQL path below is exercisable end-to-end (INSERT + ORDER BY <=>) without a
 * network call to a real embeddings API. Swap for a real provider call once one is wired up
 * (flagged in this agent's report); the keyword fallback covers correctness until then.
 */
export function embedText(text: string, dims = 768): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h = Math.imul(h ^ token.charCodeAt(i), 16777619);
    }
    const idx = Math.abs(h) % dims;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

async function vectorSearch(app: FastifyInstance, worldId: string | undefined, query: string, limit: number): Promise<KnowledgeSnippet[] | null> {
  try {
    const embedding = toVectorLiteral(embedText(query));
    const rows = (await app.db.$queryRawUnsafe(
      `SELECT id, "refId", text, 1 - (embedding <=> $1::vector) AS score
       FROM "SearchDocument"
       WHERE kind = $2 AND embedding IS NOT NULL AND ($3::text IS NULL OR "refId" = $3 OR "refId" = 'global')
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      embedding,
      KNOWLEDGE_KIND,
      worldId ?? null,
      limit,
    )) as { id: string; refId: string; text: string; score: number }[];
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  } catch {
    // No pgvector extension, fakePrisma in tests ($queryRawUnsafe returns []), or a cold table —
    // any of these fall through to the keyword search below rather than failing the command.
    return null;
  }
}

async function keywordSearch(app: FastifyInstance, worldId: string | undefined, query: string, limit: number): Promise<KnowledgeSnippet[]> {
  const tokens = (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).slice(0, 8);
  if (tokens.length === 0) return [];
  const scoped = worldId ? [{ refId: worldId }, { refId: 'global' }] : [{ refId: 'global' }];
  const rows = (await app.db.searchDocument.findMany({
    where: {
      kind: KNOWLEDGE_KIND,
      OR: scoped,
      AND: [{ OR: tokens.map((t) => ({ text: { contains: t, mode: 'insensitive' } })) }],
    },
    take: limit,
  })) as { id: string; refId: string; text: string }[];
  return rows.map((r) => ({ id: r.id, refId: r.refId, text: r.text }));
}

/** RAG lookup over the AI knowledge base: pgvector cosine search when available, otherwise a
 * keyword `contains` fallback (CONTRACTS.md §8: "RAG over AIKnowledgeBase via pgvector when
 * available else keyword"). Always returns (never throws) — worst case, an empty array. */
export async function ragSearch(app: FastifyInstance, worldId: string | undefined, query: string, limit = 5): Promise<KnowledgeSnippet[]> {
  const vector = await vectorSearch(app, worldId, query, limit);
  if (vector) return vector;
  try {
    return await keywordSearch(app, worldId, query, limit);
  } catch {
    return [];
  }
}

/** Upsert a knowledge snippet (used by tests + future admin/ingestion tooling). */
export async function upsertKnowledge(app: FastifyInstance, opts: { refId: string; text: string }): Promise<void> {
  const id = `${KNOWLEDGE_KIND}:${opts.refId}:${Buffer.from(opts.text).toString('base64url').slice(0, 24)}`;
  await app.db.searchDocument.upsert({
    where: { kind_refId: { kind: KNOWLEDGE_KIND, refId: opts.refId } },
    create: { id, kind: KNOWLEDGE_KIND, refId: opts.refId, text: opts.text },
    update: { text: opts.text },
  });
}

/** Build the full context block handed to the AI provider as part of the system prompt: the
 * scene-graph narration (`sceneGraphToSemantic`) plus any relevant knowledge-base snippets. */
export async function buildCommandContext(app: FastifyInstance, worldId: string, doc: WorldDocument, query: string): Promise<string> {
  const semantic = sceneGraphToSemantic(doc);
  const snippets = await ragSearch(app, worldId, query);
  if (snippets.length === 0) return semantic;
  const knowledge = snippets.map((s, i) => `[${i + 1}] ${s.text}`).join('\n');
  return `${semantic}\n\nRelevant knowledge:\n${knowledge}`;
}
