// The AI orchestrator pipeline (CONTRACTS.md §8): AI -> Tool -> Permission -> Validation ->
// Execution -> Event. `runCommand` is the engine behind `POST /ai/command`; `executeToolPlan` is
// the shared "run these tool calls against this world" primitive also used by `generate.ts` for
// `POST /ai/generate` (which synthesizes its own deterministic tool-call plan instead of asking a
// provider for one, but must go through the exact same permission/validation/execution/audit path
// — "AI never mutates state directly" applies to every entry point, not just /ai/command).
import { createEvent } from '@sonic-gameworld/events';
import {
  AI_TOOL_DEFINITIONS,
  AI_TOOL_SCHEMAS,
  validateToolCall,
  type AIAgentRole,
  type AIToolName,
  type ToolCall,
} from '@sonic-gameworld/ai-sdk';
import { createEmptyWorld, randomUuid, type WorldDocument } from '@sonic-gameworld/world-schema';
import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '../../types.js';
import { AppError } from '../../errors.js';
import { getAgent } from './agents/index.js';
import { buildCommandContext } from './context.js';
import { hasEffectiveAIPermission } from './permissions.js';
import { resolveProvider } from './providers/index.js';
import { selectAgentRole } from './providers/mock.js';
import { zodToJsonSchema } from './providers/jsonSchema.js';
import type { AIMessage, AIToolSpec } from './providers/types.js';
import { getTool, type ToolContext, type ToolDenialCode } from './tools/registry.js';
import { assertWorldAccess, getWorldDocument, saveWorldDocument, type WorldRecord } from './worldStore.js';

export interface DeniedToolCall {
  tool: AIToolName;
  args: Record<string, unknown>;
  code: ToolDenialCode;
  reason: string;
}

export interface ExecutedToolCall {
  tool: AIToolName;
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
  events: string[];
  durationMs: number;
}

export interface ToolPlanRun {
  doc: WorldDocument;
  versionId?: string;
  executed: ExecutedToolCall[];
  denied: DeniedToolCall[];
}

/** Build the JSON-Schema tool spec for one tool from its zod args schema. Kept local (rather than
 * reusing `anthropic.ts`/`gemini.ts`'s identical `toolSpecFromSchema` helpers) so this module
 * doesn't need to import a specific provider adapter just to build a provider-agnostic value. */
function buildToolSpec(name: AIToolName): AIToolSpec {
  return { name, description: AI_TOOL_DEFINITIONS[name].description, parameters: zodToJsonSchema(AI_TOOL_SCHEMAS[name]) };
}

/** Tools an agent may propose for this command: its full allowed subset for `role`, regardless of
 * the caller's own AIPermissions. Deliberately NOT narrowed by permission here: a lacked
 * permission needs to come back as an explicit, auditable `denied` entry (code `PERMISSION`, with
 * a reason) from `executeToolPlan`'s own check below — not a tool call that silently never gets
 * proposed in the first place, which for the deterministic `mock` provider (whose parser doesn't
 * know or care what's in `request.tools`) would otherwise make a denial indistinguishable from
 * "the command didn't match any action". */
function availableTools(role: AIAgentRole): AIToolSpec[] {
  return getAgent(role).allowedTools.map(buildToolSpec);
}

async function recordExecution(
  app: FastifyInstance,
  opts: {
    id: string;
    worldId: string | undefined;
    actorId: string;
    role: AIAgentRole;
    tool: AIToolName;
    args: Record<string, unknown>;
    ok: boolean;
    result?: unknown;
    error?: string;
    events: string[];
    durationMs: number;
  },
): Promise<void> {
  await app.db.aIExecution.create({
    data: {
      id: opts.id,
      worldId: opts.worldId ?? null,
      actorId: opts.actorId,
      tool: opts.tool,
      args: opts.args,
      role: opts.role,
      ok: opts.ok,
      result: opts.result ?? null,
      error: opts.error ?? null,
      durationMs: opts.durationMs,
      events: opts.events,
    },
  });
}

// The bus's `AI_TOOL_REQUESTED`/`AI_TOOL_EXECUTED`/`AI_TOOL_DENIED` payload shapes are fixed by
// @sonic-gameworld/events' `EventPayloads` — narrower than this module's own `ExecutedToolCall`/
// `DeniedToolCall` (which also carry `ok`/`error`/`events`/`code` for the HTTP response and the
// `AIExecution` row above). Each attempt gets one `executionId`, shared by its `AIExecution` row
// and every event published about it, so a subscriber can correlate the two.
async function publishRequested(app: FastifyInstance, executionId: string, worldId: string | undefined, actorId: string, role: AIAgentRole, tool: AIToolName, args: Record<string, unknown>): Promise<void> {
  await app.bus.publish(createEvent({ type: 'AI_TOOL_REQUESTED', actorId, payload: { executionId, worldId, tool, role, args } }));
}

async function publishDenied(app: FastifyInstance, executionId: string, worldId: string | undefined, actorId: string, tool: AIToolName, reason: string): Promise<void> {
  await app.bus.publish(createEvent({ type: 'AI_TOOL_DENIED', actorId, payload: { executionId, worldId, tool, reason } }));
}

async function publishExecuted(app: FastifyInstance, executionId: string, worldId: string | undefined, actorId: string, role: AIAgentRole, tool: AIToolName, result: unknown, durationMs: number): Promise<void> {
  await app.bus.publish(createEvent({ type: 'AI_TOOL_EXECUTED', actorId, payload: { executionId, worldId, tool, role, result, durationMs } }));
}

/** A throwaway world/doc pair for the one tool that doesn't touch either (`create_world`, which
 * creates a *new* world independent of whatever `worldId` a command happens to be scoped to — see
 * `tools/registry.ts`'s `create_world.execute`). Never persisted, never referenced by an
 * `AIExecution.worldId` (see the `world === null` handling in `executeToolPlan` below) — this only
 * exists so `create_world` can be run through the exact same permission/validate/execute/audit
 * path as every other tool, from `generate.ts`'s world-generation flow, without a real world yet
 * existing to scope it to. */
const WORLDLESS_DOC: WorldDocument = createEmptyWorld({ id: 'worldless', name: '(none)', ownerId: 'system' });
const WORLDLESS_RECORD: WorldRecord = { id: 'worldless', ownerId: 'system', orgId: null, name: '(none)', slug: 'worldless', status: 'DRAFT' };

/**
 * Run a batch of already-decided tool calls: permission check -> validate() -> execute(), in
 * order, threading the same mutable `ctx.doc` through every call (so call N sees call N-1's
 * mutations, matching `tools/registry.ts`'s documented contract). Persists a new WorldVersion at
 * the end if anything mutated the document, and writes one `AIExecution` row + one bus event per
 * attempted call (denied or executed) for a complete audit trail.
 *
 * `world`/`doc` may be omitted only when every call in `toolCalls` is `create_world` (the sole
 * tool that ignores both) — used by `generate.ts` to run `create_world` through this same path
 * before a real world exists. Every other tool requires a real `world`/`doc`.
 */
export async function executeToolPlan(
  app: FastifyInstance,
  user: AuthContext,
  world: WorldRecord | null,
  doc: WorldDocument | null,
  role: AIAgentRole,
  toolCalls: ToolCall[],
): Promise<ToolPlanRun> {
  const recordWorldId = world?.id;
  const ctx: ToolContext = { app, user, world: world ?? WORLDLESS_RECORD, doc: doc ?? WORLDLESS_DOC, role };
  const executed: ExecutedToolCall[] = [];
  const denied: DeniedToolCall[] = [];
  let docChanged = false;

  for (const call of toolCalls) {
    const executionId = randomUuid();

    const parsed = validateToolCall(call);
    if (!parsed.ok) {
      const denial: DeniedToolCall = { tool: call.tool, args: call.args, code: 'VALIDATION', reason: parsed.issues.join('; ') };
      denied.push(denial);
      await publishRequested(app, executionId, recordWorldId, user.userId, role, call.tool, call.args);
      await recordExecution(app, { id: executionId, worldId: recordWorldId, actorId: user.userId, role, tool: call.tool, args: call.args, ok: false, error: denial.reason, events: [], durationMs: 0 });
      await publishDenied(app, executionId, recordWorldId, user.userId, call.tool, denial.reason);
      continue;
    }

    await publishRequested(app, executionId, recordWorldId, user.userId, role, call.tool, parsed.args);

    const def = getTool(call.tool);
    if (!def.roles.includes(role)) {
      const denial: DeniedToolCall = { tool: call.tool, args: parsed.args, code: 'PERMISSION', reason: `The ${role} agent is not permitted to call "${call.tool}".` };
      denied.push(denial);
      await recordExecution(app, { id: executionId, worldId: recordWorldId, actorId: user.userId, role, tool: call.tool, args: parsed.args, ok: false, error: denial.reason, events: [], durationMs: 0 });
      await publishDenied(app, executionId, recordWorldId, user.userId, call.tool, denial.reason);
      continue;
    }
    if (!hasEffectiveAIPermission(user, world, def.permission)) {
      const denial: DeniedToolCall = { tool: call.tool, args: parsed.args, code: 'PERMISSION', reason: `Missing required permission "${def.permission}" for "${call.tool}".` };
      denied.push(denial);
      await recordExecution(app, { id: executionId, worldId: recordWorldId, actorId: user.userId, role, tool: call.tool, args: parsed.args, ok: false, error: denial.reason, events: [], durationMs: 0 });
      await publishDenied(app, executionId, recordWorldId, user.userId, call.tool, denial.reason);
      continue;
    }

    const startedAt = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- args are validated against
    // AI_TOOL_SCHEMAS[call.tool] above; the per-tool arg type is only known statically at the
    // ToolDefinition<K> declaration site in tools/registry.ts.
    const validation = await def.validate(ctx, parsed.args as any);
    if (!validation.ok) {
      const denial: DeniedToolCall = { tool: call.tool, args: parsed.args, code: validation.code ?? 'VALIDATION', reason: validation.reason ?? 'Validation failed' };
      denied.push(denial);
      await recordExecution(app, {
        id: executionId,
        worldId: recordWorldId,
        actorId: user.userId,
        role,
        tool: call.tool,
        args: parsed.args,
        ok: false,
        error: denial.reason,
        events: [],
        durationMs: Date.now() - startedAt,
      });
      await publishDenied(app, executionId, recordWorldId, user.userId, call.tool, denial.reason);
      continue;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see note above
      const outcome = await def.execute(ctx, parsed.args as any);
      if (outcome.docChanged) docChanged = true;
      const exec: ExecutedToolCall = {
        tool: call.tool,
        args: parsed.args,
        ok: outcome.ok,
        result: outcome.result,
        error: outcome.error,
        events: outcome.events,
        durationMs: Date.now() - startedAt,
      };
      executed.push(exec);
      await recordExecution(app, { id: executionId, worldId: recordWorldId, actorId: user.userId, role, tool: call.tool, args: parsed.args, ok: exec.ok, result: exec.result, error: exec.error, events: exec.events, durationMs: exec.durationMs });
      await publishExecuted(app, executionId, recordWorldId, user.userId, role, call.tool, exec.result, exec.durationMs);
    } catch (err) {
      const message = err instanceof AppError ? err.message : err instanceof Error ? err.message : String(err);
      const exec: ExecutedToolCall = { tool: call.tool, args: parsed.args, ok: false, error: message, events: [], durationMs: Date.now() - startedAt };
      executed.push(exec);
      await recordExecution(app, { id: executionId, worldId: recordWorldId, actorId: user.userId, role, tool: call.tool, args: parsed.args, ok: false, error: message, events: [], durationMs: exec.durationMs });
      await publishExecuted(app, executionId, recordWorldId, user.userId, role, call.tool, null, exec.durationMs);
    }
  }

  let versionId: string | undefined;
  let finalDoc = ctx.doc;
  if (docChanged && world) {
    const summary = `AI command: ${toolCalls.map((c) => c.tool).join(', ')}`;
    const saved = await saveWorldDocument(app, world.id, ctx.doc, user.userId, summary);
    versionId = saved.versionId;
    finalDoc = saved.doc;
  }

  return { doc: finalDoc, versionId, executed, denied };
}

export interface CommandInput {
  worldId: string;
  text?: string;
  transcript?: string;
  voice?: boolean;
  mode?: AIAgentRole;
}

export interface CommandResult {
  worldId: string;
  role: AIAgentRole;
  provider: string;
  model: string;
  plan: ToolCall[];
  executed: ExecutedToolCall[];
  denied: DeniedToolCall[];
  narration: string;
  versionId?: string;
}

function summarize(executed: ExecutedToolCall[], denied: DeniedToolCall[]): string {
  const parts: string[] = [];
  const okCount = executed.filter((e) => e.ok).length;
  if (okCount > 0) parts.push(`Executed ${okCount} action${okCount === 1 ? '' : 's'}.`);
  const failCount = executed.length - okCount;
  if (failCount > 0) parts.push(`${failCount} action${failCount === 1 ? '' : 's'} failed during execution.`);
  if (denied.length > 0) parts.push(`${denied.length} action${denied.length === 1 ? '' : 's'} were denied (${denied.map((d) => `${d.tool}: ${d.reason}`).join('; ')}).`);
  if (parts.length === 0) parts.push('No world-editing action was found in that command.');
  return parts.join(' ');
}

/** `POST /ai/command`'s engine: build context -> pick an agent -> ask the provider for tool calls
 * -> run them through `executeToolPlan`. Voice input (`{voice:true, transcript}`) is normalized to
 * `text` before anything else runs, so the rest of the pipeline never branches on voice vs text. */
export async function runCommand(app: FastifyInstance, user: AuthContext, input: CommandInput): Promise<CommandResult> {
  const text = (input.voice ? input.transcript : input.text) ?? input.text ?? input.transcript;
  if (!text || !text.trim()) throw AppError.badRequest('A non-empty "text" (or "transcript" when voice:true) is required');

  const { world, doc } = await getWorldDocument(app, input.worldId);
  assertWorldAccess(world, user);

  const role: AIAgentRole = input.mode ?? selectAgentRole(text);
  const agent = getAgent(role);
  const semanticContext = await buildCommandContext(app, world.id, doc, text);
  const system = agent.systemPrompt({ worldName: doc.name, semanticContext, userText: text });
  const messages: AIMessage[] = [{ role: 'user', content: text }];
  const tools = availableTools(role);

  const provider = resolveProvider();
  const result = await provider.complete({ system, messages, tools, hints: { worldName: doc.name } });

  const run = await executeToolPlan(app, user, world, doc, role, result.toolCalls);

  // periodStart/costCents both carry a schema-level @default(...) that only the real generated
  // Prisma client applies -- passed explicitly so this also behaves correctly against
  // src/test/fakePrisma.ts (which only auto-fills id/createdAt/updatedAt on create).
  await app.db.aIUsage.create({
    data: {
      userId: user.userId,
      orgId: user.orgId ?? null,
      model: provider.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costCents: 0,
      periodStart: new Date(),
    },
  });

  const narration = result.text?.trim() ? result.text.trim() : summarize(run.executed, run.denied);

  return {
    worldId: world.id,
    role,
    provider: provider.name,
    model: provider.model,
    plan: result.toolCalls,
    executed: run.executed,
    denied: run.denied,
    narration,
    versionId: run.versionId,
  };
}
