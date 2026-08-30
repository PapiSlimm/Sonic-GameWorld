// npcs module (§9 of CONTRACTS.md): NPC CRUD, deterministic `generate`, and `chat` (dialogue with
// conversation/message history — the persistence layer for NPC "memory"). Generation logic lives
// in ./generator.ts, reply logic in ./dialogue.ts, both reusable outside HTTP handlers (e.g. by
// the `ai` module's `spawn_npc` tool executor, once it wants deterministic NPCs of its own).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NPCDefinitionSchema, type NPCDefinition, type NPCDefinitionInput } from '@sonic-gameworld/world-schema';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { assertCanReadWorld, getWorldOrThrow, type AccessSubject } from '../worlds/service.js';
import { generateNpcDefinition } from './generator.js';
import { generateNpcReply, type DialogueTurn } from './dialogue.js';

// ---------------------------------------------------------------------------------------------
// Row shapes (see the note in ../../types.ts on hand-declaring these against the sandbox's
// verification-only @prisma/client shim).
// ---------------------------------------------------------------------------------------------

interface NPCRow {
  id: string;
  worldId: string | null;
  ownerId: string;
  name: string;
  definition: unknown;
  agentId: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface NPCConversationRow {
  id: string;
  npcId: string;
  playerId: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

interface NPCMessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'npc';
  text: string;
  emotion: string | null;
  actions: unknown;
  createdAt: Date;
}

// ---------------------------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------------------------

const PersonalityInputSchema = z.object({
  traits: z.array(z.string()).optional(),
  backstory: z.string().optional(),
  goals: z.array(z.string()).optional(),
  tone: z.string().optional(),
});
const MemoryInputSchema = z.object({ enabled: z.boolean().optional(), capacity: z.number().int().nonnegative().optional() });
const KnowledgeInputSchema = z.object({ kbIds: z.array(z.string()).optional() });
const BehaviorInputSchema = z.object({
  treeId: z.string().optional(),
  states: z.array(z.string()).optional(),
  aggression: z.number().min(0).max(1).optional(),
  faction: z.string().optional(),
});
const DialogueInputSchema = z.object({ style: z.string().optional(), openingLines: z.array(z.string()).optional() });
const QuestLogicInputSchema = z.object({ missionIds: z.array(z.string()) });

const CreateNpcSchema = z.object({
  worldId: z.string().optional(),
  name: z.string().min(1).max(120),
  characterAssetId: z.string().optional(),
  voice: z.object({ provider: z.string(), voiceId: z.string() }).optional(),
  personality: PersonalityInputSchema.optional(),
  memory: MemoryInputSchema.optional(),
  knowledge: KnowledgeInputSchema.optional(),
  behavior: BehaviorInputSchema.optional(),
  dialogue: DialogueInputSchema.optional(),
  questLogic: QuestLogicInputSchema.optional(),
  agentId: z.string().optional(),
});

const PatchNpcSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  agentId: z.string().nullable().optional(),
  characterAssetId: z.string().optional(),
  voice: z.object({ provider: z.string(), voiceId: z.string() }).optional(),
  personality: PersonalityInputSchema.optional(),
  memory: MemoryInputSchema.optional(),
  knowledge: KnowledgeInputSchema.optional(),
  behavior: BehaviorInputSchema.optional(),
  dialogue: DialogueInputSchema.optional(),
  questLogic: QuestLogicInputSchema.optional(),
});

const GenerateNpcSchema = z.object({
  worldId: z.string().optional(),
  prompt: z.string().min(1).max(2000),
  name: z.string().min(1).max(120).optional(),
  faction: z.string().optional(),
  agentId: z.string().optional(),
});

const ChatSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

// ---------------------------------------------------------------------------------------------
// Access control + serialization
// ---------------------------------------------------------------------------------------------

function canAccessNpc(npc: Pick<NPCRow, 'ownerId'>, subject: AccessSubject): boolean {
  return npc.ownerId === subject.userId || subject.roles.includes('platform_admin');
}

function canReadNpc(npc: Pick<NPCRow, 'ownerId' | 'status'>, subject: AccessSubject): boolean {
  return npc.status === 'ACTIVE' || canAccessNpc(npc, subject);
}

function serializeNpc(npc: NPCRow) {
  return {
    id: npc.id,
    worldId: npc.worldId,
    ownerId: npc.ownerId,
    name: npc.name,
    definition: npc.definition,
    agentId: npc.agentId,
    status: npc.status,
    createdAt: npc.createdAt.toISOString(),
    updatedAt: npc.updatedAt.toISOString(),
  };
}

function serializeMessage(m: NPCMessageRow) {
  return { id: m.id, role: m.role, text: m.text, emotion: m.emotion, actions: m.actions ?? undefined, createdAt: m.createdAt.toISOString() };
}

/** Build a full NPCDefinitionInput from a (partial) request body, filling every required-but-
 * defaultable nested object so `NPCDefinitionSchema.parse` never rejects a minimal payload. */
function definitionInputFrom(id: string, name: string, body: {
  characterAssetId?: string;
  voice?: { provider: string; voiceId: string };
  personality?: z.infer<typeof PersonalityInputSchema>;
  memory?: z.infer<typeof MemoryInputSchema>;
  knowledge?: z.infer<typeof KnowledgeInputSchema>;
  behavior?: z.infer<typeof BehaviorInputSchema>;
  dialogue?: z.infer<typeof DialogueInputSchema>;
  questLogic?: z.infer<typeof QuestLogicInputSchema>;
}): NPCDefinitionInput {
  return {
    id,
    name,
    characterAssetId: body.characterAssetId,
    voice: body.voice,
    personality: body.personality ?? {},
    memory: body.memory ?? {},
    knowledge: body.knowledge ?? {},
    behavior: body.behavior ?? {},
    dialogue: body.dialogue ?? {},
    questLogic: body.questLogic,
    relationships: [],
  };
}

export async function registerNpcsModule(app: FastifyInstance): Promise<void> {
  async function getNpcOrThrow(id: string): Promise<NPCRow> {
    const npc = (await app.db.nPC.findUnique({ where: { id } })) as NPCRow | null;
    if (!npc || npc.deletedAt) throw AppError.notFound('NPC', id);
    return npc;
  }

  async function assertWorldReadableIfProvided(worldId: string | undefined, subject: AccessSubject): Promise<void> {
    if (!worldId) return;
    const world = await getWorldOrThrow(app.db, worldId);
    assertCanReadWorld(world, subject);
  }

  // ---- CRUD ----

  app.post('/npcs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateNpcSchema.parse(request.body ?? {});
    await assertWorldReadableIfProvided(body.worldId, user);

    const id = randomUUID();
    const definition = NPCDefinitionSchema.parse(definitionInputFrom(id, body.name, body));
    const npc = (await app.db.nPC.create({
      data: { id, worldId: body.worldId ?? null, ownerId: user.userId, name: body.name, definition, agentId: body.agentId ?? null, status: 'DRAFT' },
    })) as NPCRow;

    await app.bus.publish(createEvent({ type: 'NPC_CREATED', payload: { npcId: npc.id, worldId: npc.worldId ?? undefined, name: npc.name } }));
    reply.status(201);
    return serializeNpc(npc);
  });

  app.get('/npcs', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const filters = request.query as { worldId?: string };
    const where: Record<string, unknown> = { deletedAt: null, ownerId: user.userId };
    if (filters.worldId) where.worldId = filters.worldId;
    const rows = (await app.db.nPC.findMany({ where, orderBy: { updatedAt: 'desc' }, ...toPrismaPageArgs(query) })) as NPCRow[];
    return toPage(rows.map(serializeNpc), query);
  });

  app.get('/npcs/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const npc = await getNpcOrThrow(id);
    if (!canReadNpc(npc, request.user!)) throw AppError.forbidden('You do not have access to this NPC');
    return serializeNpc(npc);
  });

  app.patch('/npcs/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const npc = await getNpcOrThrow(id);
    if (!canAccessNpc(npc, request.user!)) throw AppError.forbidden('You do not have write access to this NPC');
    const body = PatchNpcSchema.parse(request.body ?? {});

    const currentDefinition = npc.definition as NPCDefinition;
    const nextDefinitionInput: NPCDefinitionInput = {
      ...currentDefinition,
      name: body.name ?? currentDefinition.name,
      characterAssetId: body.characterAssetId ?? currentDefinition.characterAssetId,
      voice: body.voice ?? currentDefinition.voice,
      personality: { ...currentDefinition.personality, ...(body.personality ?? {}) },
      memory: { ...currentDefinition.memory, ...(body.memory ?? {}) },
      knowledge: { ...currentDefinition.knowledge, ...(body.knowledge ?? {}) },
      behavior: { ...currentDefinition.behavior, ...(body.behavior ?? {}) },
      dialogue: { ...currentDefinition.dialogue, ...(body.dialogue ?? {}) },
      questLogic: body.questLogic ?? currentDefinition.questLogic,
    };
    const definition = NPCDefinitionSchema.parse(nextDefinitionInput);

    const updated = (await app.db.nPC.update({
      where: { id },
      data: {
        name: body.name ?? npc.name,
        status: body.status ?? npc.status,
        agentId: body.agentId === undefined ? npc.agentId : body.agentId,
        definition,
      },
    })) as NPCRow;
    return serializeNpc(updated);
  });

  // ---- Generate ----

  app.post('/npcs/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = GenerateNpcSchema.parse(request.body ?? {});
    await assertWorldReadableIfProvided(body.worldId, user);

    const definition = await generateNpcDefinition({ prompt: body.prompt, name: body.name, worldId: body.worldId, faction: body.faction });
    const npc = (await app.db.nPC.create({
      data: {
        id: definition.id,
        worldId: body.worldId ?? null,
        ownerId: user.userId,
        name: definition.name,
        definition,
        agentId: body.agentId ?? null,
        status: 'DRAFT',
      },
    })) as NPCRow;

    await app.bus.publish(createEvent({ type: 'NPC_CREATED', payload: { npcId: npc.id, worldId: npc.worldId ?? undefined, name: npc.name } }));
    reply.status(201);
    return serializeNpc(npc);
  });

  // ---- Chat ----

  app.post('/npcs/:id/chat', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const npc = await getNpcOrThrow(id);
    if (!canReadNpc(npc, user)) throw AppError.forbidden('You do not have access to chat with this NPC');
    const body = ChatSchema.parse(request.body ?? {});
    const definition = npc.definition as NPCDefinition;

    let conversation: NPCConversationRow;
    if (body.conversationId) {
      const existing = (await app.db.nPCConversation.findUnique({ where: { id: body.conversationId } })) as NPCConversationRow | null;
      if (!existing || existing.npcId !== npc.id) throw AppError.notFound('Conversation', body.conversationId);
      if (existing.endedAt) throw AppError.conflict('This conversation has already ended');
      conversation = existing;
    } else {
      conversation = (await app.db.nPCConversation.create({ data: { npcId: npc.id, playerId: user.userId } })) as NPCConversationRow;
    }

    const priorMessages = (await app.db.nPCMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    })) as NPCMessageRow[];

    await app.db.nPCMessage.create({ data: { conversationId: conversation.id, role: 'user', text: body.message } });

    const capacity = definition.memory.enabled ? Math.max(0, definition.memory.capacity) : 0;
    const history: DialogueTurn[] = definition.memory.enabled
      ? priorMessages.slice(-capacity).map((m) => ({ role: m.role, text: m.text }))
      : [];

    const reply_ = generateNpcReply(definition, history, body.message);
    const npcMessage = (await app.db.nPCMessage.create({
      data: { conversationId: conversation.id, role: 'npc', text: reply_.text, emotion: reply_.emotion ?? null, actions: reply_.actions ?? undefined },
    })) as NPCMessageRow;

    reply.status(201);
    return { conversationId: conversation.id, npcId: npc.id, reply: serializeMessage(npcMessage) };
  });
}
