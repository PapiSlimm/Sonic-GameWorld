// missions module (§9 of CONTRACTS.md): Mission CRUD + deterministic `generate` (a questmaster
// that derives objectives/triggers/rewards from a world's current entities). Generation logic
// lives in ./generator.ts so it's reusable outside HTTP handlers (e.g. the `ai` module's
// `create_quest` tool executor).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ConditionSchema,
  MissionDefinitionSchema,
  ObjectiveTypeSchema,
  RewardSchema,
  ToolCallSchema,
  TriggerKindSchema,
  type MissionDefinition,
} from '@sonic-gameworld/world-schema';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { assertCanReadWorld, getDocument, getWorldOrThrow, type AccessSubject } from '../worlds/service.js';
import { generateMissionDefinition } from './generator.js';

// ---------------------------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------------------------

interface MissionRow {
  id: string;
  worldId: string;
  ownerId: string;
  name: string;
  definition: unknown;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ---------------------------------------------------------------------------------------------
// Request schemas — objective/trigger/reward shapes are reused straight from world-schema so a
// created Mission's `definition` always matches the `MissionDefinition` the rest of the platform
// expects (e.g. if it's later spliced into a `WorldDocument.missions` array).
// ---------------------------------------------------------------------------------------------

const ObjectiveInputSchema = z.object({
  type: ObjectiveTypeSchema,
  targetEntityId: z.string().optional(),
  count: z.number().int().positive().optional(),
  timeLimitS: z.number().positive().optional(),
  description: z.string().min(1),
  conditions: z.array(ConditionSchema).optional(),
});

const TriggerInputSchema = z.object({
  kind: TriggerKindSchema,
  entityId: z.string().optional(),
  event: z.string().optional(),
  params: z.record(z.unknown()).optional(),
  actions: z.array(ToolCallSchema).optional(),
});

const CreateMissionSchema = z.object({
  worldId: z.string().min(1),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  chainId: z.string().optional(),
  order: z.number().int().optional(),
  objectives: z.array(ObjectiveInputSchema).optional(),
  triggers: z.array(TriggerInputSchema).optional(),
  rewards: z.array(RewardSchema).optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  state: z.enum(['DRAFT', 'ACTIVE', 'COMPLETE', 'FAILED']).optional(),
});

const PatchMissionSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  order: z.number().int().optional(),
  objectives: z.array(ObjectiveInputSchema).optional(),
  triggers: z.array(TriggerInputSchema).optional(),
  rewards: z.array(RewardSchema).optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  state: z.enum(['DRAFT', 'ACTIVE', 'COMPLETE', 'FAILED']).optional(),
});

const GenerateMissionSchema = z.object({
  worldId: z.string().min(1),
  prompt: z.string().max(2000).optional(),
  name: z.string().min(1).max(160).optional(),
  difficulty: z.number().int().min(1).max(10).optional(),
  chainId: z.string().optional(),
  order: z.number().int().optional(),
});

// ---------------------------------------------------------------------------------------------
// Access control + serialization
// ---------------------------------------------------------------------------------------------

function canAccessMission(mission: Pick<MissionRow, 'ownerId'>, subject: AccessSubject): boolean {
  return mission.ownerId === subject.userId || subject.roles.includes('platform_admin');
}

function canReadMission(mission: Pick<MissionRow, 'ownerId' | 'status'>, subject: AccessSubject): boolean {
  return mission.status === 'ACTIVE' || canAccessMission(mission, subject);
}

/** `Objective`/`Trigger` both require a server-assigned `id` — clients never supply one, so every
 * request-body objective/trigger gets a fresh uuid here before it reaches `MissionDefinitionSchema`. */
function withGeneratedIds<T extends object>(items: T[] | undefined): (T & { id: string })[] | undefined {
  return items?.map((item) => ({ ...item, id: randomUUID() }));
}

function serializeMission(mission: MissionRow) {
  return {
    id: mission.id,
    worldId: mission.worldId,
    ownerId: mission.ownerId,
    name: mission.name,
    status: mission.status,
    definition: mission.definition,
    createdAt: mission.createdAt.toISOString(),
    updatedAt: mission.updatedAt.toISOString(),
  };
}

export async function registerMissionsModule(app: FastifyInstance): Promise<void> {
  async function getMissionOrThrow(id: string): Promise<MissionRow> {
    const mission = (await app.db.mission.findUnique({ where: { id } })) as MissionRow | null;
    if (!mission || mission.deletedAt) throw AppError.notFound('Mission', id);
    return mission;
  }

  // ---- CRUD ----

  app.post('/missions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateMissionSchema.parse(request.body ?? {});
    const world = await getWorldOrThrow(app.db, body.worldId);
    assertCanReadWorld(world, user);

    const id = randomUUID();
    const definition: MissionDefinition = MissionDefinitionSchema.parse({
      id,
      name: body.name,
      description: body.description ?? '',
      chainId: body.chainId,
      order: body.order ?? 0,
      objectives: withGeneratedIds(body.objectives) ?? [],
      triggers: withGeneratedIds(body.triggers) ?? [],
      rewards: body.rewards ?? [],
      difficulty: body.difficulty ?? 5,
      state: body.state ?? 'DRAFT',
    });

    const mission = (await app.db.mission.create({
      data: { id, worldId: body.worldId, ownerId: user.userId, name: definition.name, definition, status: 'DRAFT' },
    })) as MissionRow;

    await app.bus.publish(createEvent({ type: 'MISSION_CREATED', payload: { missionId: mission.id, worldId: mission.worldId, name: mission.name } }));
    reply.status(201);
    return serializeMission(mission);
  });

  app.get('/missions', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const filters = request.query as { worldId?: string };
    const where: Record<string, unknown> = { deletedAt: null, ownerId: user.userId };
    if (filters.worldId) where.worldId = filters.worldId;
    const rows = (await app.db.mission.findMany({ where, orderBy: { updatedAt: 'desc' }, ...toPrismaPageArgs(query) })) as MissionRow[];
    return toPage(rows.map(serializeMission), query);
  });

  app.get('/missions/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const mission = await getMissionOrThrow(id);
    if (!canReadMission(mission, request.user!)) throw AppError.forbidden('You do not have access to this mission');
    return serializeMission(mission);
  });

  app.patch('/missions/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const mission = await getMissionOrThrow(id);
    if (!canAccessMission(mission, request.user!)) throw AppError.forbidden('You do not have write access to this mission');
    const body = PatchMissionSchema.parse(request.body ?? {});

    const current = mission.definition as MissionDefinition;
    const nextDefinition = MissionDefinitionSchema.parse({
      ...current,
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      order: body.order ?? current.order,
      objectives: withGeneratedIds(body.objectives) ?? current.objectives,
      triggers: withGeneratedIds(body.triggers) ?? current.triggers,
      rewards: body.rewards ?? current.rewards,
      difficulty: body.difficulty ?? current.difficulty,
      state: body.state ?? current.state,
    });

    const updated = (await app.db.mission.update({
      where: { id },
      data: { name: nextDefinition.name, status: body.status ?? mission.status, definition: nextDefinition },
    })) as MissionRow;
    return serializeMission(updated);
  });

  // ---- Generate ----

  app.post('/missions/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = GenerateMissionSchema.parse(request.body ?? {});
    const world = await getWorldOrThrow(app.db, body.worldId);
    assertCanReadWorld(world, user);

    const { document } = await getDocument(app.db, body.worldId);
    const definition = generateMissionDefinition(document, {
      prompt: body.prompt,
      name: body.name,
      difficulty: body.difficulty,
      chainId: body.chainId,
      order: body.order,
    });

    const mission = (await app.db.mission.create({
      data: { id: definition.id, worldId: body.worldId, ownerId: user.userId, name: definition.name, definition, status: 'DRAFT' },
    })) as MissionRow;

    await app.bus.publish(createEvent({ type: 'MISSION_CREATED', payload: { missionId: mission.id, worldId: mission.worldId, name: mission.name } }));
    reply.status(201);
    return serializeMission(mission);
  });
}
