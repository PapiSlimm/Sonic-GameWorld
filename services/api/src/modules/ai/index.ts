// ai module (CONTRACTS.md §8/§9): GameWorld AI orchestrator. Routes are thin wrappers around
// `pipeline.ts` (POST /ai/command), `generate.ts` (POST /ai/generate), and `tools/registry.ts`
// (GET /ai/tools) + `AIExecution`/`AIUsage` reads (GET /ai/executions, GET /ai/usage).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AI_TOOL_DEFINITIONS, AI_TOOL_NAMES, AI_TOOL_SCHEMAS, AIAgentRoleSchema } from '@sonic-gameworld/ai-sdk';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { AppError } from '../../errors.js';
import { generateCinematic, generateMission, generateNpc, generateWorld } from './generate.js';
import { runCommand } from './pipeline.js';
import { zodToJsonSchema } from './providers/jsonSchema.js';
import { assertWorldAccess, getWorldDocument } from './worldStore.js';

// ---- Request schemas ----

const CommandRequestSchema = z
  .object({
    worldId: z.string().min(1),
    text: z.string().min(1).max(4000).optional(),
    transcript: z.string().min(1).max(4000).optional(),
    voice: z.boolean().default(false),
    mode: AIAgentRoleSchema.optional(),
  })
  .refine((v) => Boolean(v.text ?? v.transcript), { message: 'Either "text" or "transcript" is required' });

const GenerateRequestSchema = z.object({
  kind: z.enum(['WORLD', 'NPC', 'MISSION', 'CINEMATIC']),
  prompt: z.string().min(1).max(2000),
  worldId: z.string().optional(),
});

const ExecutionsQuerySchema = PaginationQuerySchema.extend({
  worldId: z.string().optional(),
});

// ---- Serialization ----

interface AIExecutionRow {
  id: string;
  worldId: string | null;
  actorId: string | null;
  tool: string;
  args: unknown;
  role: string | null;
  ok: boolean;
  result: unknown;
  error: string | null;
  durationMs: number;
  events: string[];
  createdAt: Date;
}

function serializeExecution(row: AIExecutionRow) {
  return {
    id: row.id,
    worldId: row.worldId,
    actorId: row.actorId,
    tool: row.tool,
    args: row.args,
    role: row.role,
    ok: row.ok,
    result: row.result,
    error: row.error,
    durationMs: row.durationMs,
    events: row.events,
    createdAt: row.createdAt.toISOString(),
  };
}

interface AIUsageRow {
  id: string;
  userId: string | null;
  orgId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  periodStart: Date;
  periodEnd: Date | null;
  createdAt: Date;
}

function serializeUsage(row: AIUsageRow) {
  return {
    id: row.id,
    userId: row.userId,
    orgId: row.orgId,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costCents: row.costCents,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerAiModule(app: FastifyInstance): Promise<void> {
  // ---- POST /ai/command ----
  app.post('/ai/command', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const body = CommandRequestSchema.parse(request.body ?? {});
    return runCommand(app, user, body);
  });

  // ---- POST /ai/generate ----
  app.post('/ai/generate', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const body = GenerateRequestSchema.parse(request.body ?? {});
    // No blanket permission gate here: a draft-only NPC/mission/cinematic (no `worldId`) mutates
    // nothing, and every path that *does* mutate a world (WORLD generation, or NPC/MISSION/
    // CINEMATIC with a `worldId`) runs its tool calls through `executeToolPlan`, which enforces
    // the right per-tool AIPermission itself — see ./permissions.ts's ownership-aware fallback
    // for why that isn't simply `hasAIPermission(user.roles, 'ai:generate')`.
    switch (body.kind) {
      case 'WORLD':
        return generateWorld(app, user, body);
      case 'NPC':
        return generateNpc(app, user, body);
      case 'MISSION':
        return generateMission(app, user, body);
      case 'CINEMATIC':
        return generateCinematic(app, user, body);
      default:
        throw AppError.badRequest(`Unsupported generate kind`);
    }
  });

  // ---- GET /ai/tools ----
  app.get('/ai/tools', { preHandler: [app.authenticate] }, async () => {
    const tools = AI_TOOL_NAMES.map((name) => {
      const def = AI_TOOL_DEFINITIONS[name];
      return {
        name,
        description: def.description,
        permission: def.permission,
        roles: def.roles,
        mutates: def.mutates,
        argsSchema: zodToJsonSchema(AI_TOOL_SCHEMAS[name]),
      };
    });
    return { items: tools };
  });

  // ---- GET /ai/executions ----
  // Defaults to the caller's own AI activity; pass ?worldId= to see everyone's activity on a
  // world you have read access to (a shared world's edit history is useful to every collaborator,
  // not just whoever happened to trigger it).
  app.get('/ai/executions', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = ExecutionsQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = query.worldId ? { worldId: query.worldId } : { actorId: user.userId };
    if (query.worldId) {
      const { world } = await getWorldDocument(app, query.worldId);
      assertWorldAccess(world, user);
    }
    const rows = (await app.db.aIExecution.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) })) as AIExecutionRow[];
    return toPage(rows.map(serializeExecution), query);
  });

  // ---- GET /ai/executions/:id ----
  // Poll target for a queued `generate_asset` (or any other off-thread tool call): the worker
  // (workers/ai-generation) writes its own AIExecution row on completion, separate from the
  // immediate "request accepted" row `executeToolPlan` writes when the tool call itself ran.
  app.get('/ai/executions/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const row = (await app.db.aIExecution.findUnique({ where: { id } })) as AIExecutionRow | null;
    if (!row) throw AppError.notFound('AIExecution', id);
    if (row.worldId) {
      const { world } = await getWorldDocument(app, row.worldId);
      assertWorldAccess(world, user);
    } else if (row.actorId !== user.userId) {
      throw AppError.notFound('AIExecution', id);
    }
    return serializeExecution(row);
  });

  // ---- GET /ai/usage ----
  app.get('/ai/usage', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const where = user.orgId ? { OR: [{ userId: user.userId }, { orgId: user.orgId }] } : { userId: user.userId };
    const rows = (await app.db.aIUsage.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) })) as AIUsageRow[];
    const page = toPage(rows.map(serializeUsage), query);
    const totals = rows.reduce(
      (acc, r) => ({ inputTokens: acc.inputTokens + r.inputTokens, outputTokens: acc.outputTokens + r.outputTokens, costCents: acc.costCents + r.costCents }),
      { inputTokens: 0, outputTokens: 0, costCents: 0 },
    );
    return { ...page, totals };
  });
}
