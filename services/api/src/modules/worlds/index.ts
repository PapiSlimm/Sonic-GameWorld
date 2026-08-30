// worlds module (§9 of CONTRACTS.md): World CRUD, document GET/PUT, versions/snapshots, entity
// CRUD, publish (Product draft of category WORLD), WorldForge, and the semantic (AI context)
// endpoint. All mutation logic lives in ./service.ts so it's reusable outside HTTP handlers (the
// AI orchestrator module calls the same functions from its tool executors).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AssetRefSchema,
  EntityAISchema,
  EntityBehaviorSchema,
  EntityKindSchema,
  EntityScriptSchema,
  GenreSchema,
  GeoAnchorSchema,
  TransformSchema,
  VisibilitySchema,
} from '@sonic-gameworld/world-schema';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { FORGE_THEMES } from './forge.js';
import * as worldService from './service.js';
import type { WorldRow, WorldSnapshotRow, WorldVersionRow } from './service.js';

// ---- Request schemas ----

const CreateWorldSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  genre: z.array(GenreSchema).optional(),
  sizeKm2: z.number().positive().optional(),
  maxPlayers: z.number().int().positive().optional(),
  orgId: z.string().optional(),
});

const PatchWorldSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  genre: z.array(GenreSchema).optional(),
  maxPlayers: z.number().int().positive().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
});

const CreateEntitySchema = z.object({
  kind: EntityKindSchema,
  name: z.string().min(1),
  parentId: z.string().optional(),
  transform: TransformSchema.optional(),
  geo: GeoAnchorSchema.optional(),
  assetRef: AssetRefSchema.optional(),
  behavior: EntityBehaviorSchema.optional(),
  script: EntityScriptSchema.optional(),
  ai: EntityAISchema.optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  visibility: VisibilitySchema.optional(),
});

const UpdateEntitySchema = z
  .object({
    name: z.string().min(1),
    parentId: z.string().nullable(),
    transform: TransformSchema,
    geo: GeoAnchorSchema.nullable(),
    assetRef: AssetRefSchema.nullable(),
    behavior: EntityBehaviorSchema.nullable(),
    script: EntityScriptSchema.nullable(),
    ai: EntityAISchema.nullable(),
    tags: z.array(z.string()),
    metadata: z.record(z.unknown()),
  })
  .partial();

const CreateSnapshotSchema = z.object({ label: z.string().max(200).optional() });

const PublishWorldSchema = z.object({
  visibility: z.enum(['PRIVATE', 'TEAM', 'PUBLIC']).default('PUBLIC'),
  priceCents: z.number().int().nonnegative().optional(),
});

const ForgeWorldSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusKm: z.number().positive().max(50).default(2),
  theme: z.enum(FORGE_THEMES as [string, ...string[]]).optional(),
  provider: z.enum(['SYNTHETIC', 'OVERPASS']).default('SYNTHETIC'),
});

const SemanticQuerySchema = z.object({
  maxPerKind: z.coerce.number().int().positive().max(100).optional(),
  includeMissions: z.coerce.boolean().optional(),
  includeCameras: z.coerce.boolean().optional(),
});

// ---- Serialization ----

function serializeWorld(world: WorldRow) {
  return {
    id: world.id,
    ownerId: world.ownerId,
    orgId: world.orgId,
    name: world.name,
    slug: world.slug,
    description: world.description,
    genre: world.genre,
    status: world.status,
    sizeKm2: world.sizeKm2,
    maxPlayers: world.maxPlayers,
    thumbnailUrl: world.thumbnailUrl,
    currentVersionId: world.currentVersionId,
    entityCount: world.entityCount,
    createdAt: world.createdAt.toISOString(),
    updatedAt: world.updatedAt.toISOString(),
    publishedAt: world.publishedAt ? world.publishedAt.toISOString() : null,
  };
}

function serializeVersion(version: WorldVersionRow) {
  return { id: version.id, worldId: version.worldId, version: version.version, createdBy: version.createdBy, createdAt: version.createdAt.toISOString() };
}

function serializeSnapshot(snapshot: WorldSnapshotRow) {
  return {
    id: snapshot.id,
    worldId: snapshot.worldId,
    versionId: snapshot.versionId,
    label: snapshot.label,
    createdBy: snapshot.createdBy,
    entityCount: snapshot.entityCount,
    sizeBytes: snapshot.sizeBytes,
    createdAt: snapshot.createdAt.toISOString(),
  };
}

export async function registerWorldsModule(app: FastifyInstance): Promise<void> {
  async function loadWorldForRead(worldId: string, subject: worldService.AccessSubject): Promise<WorldRow> {
    const world = await worldService.getWorldOrThrow(app.db, worldId);
    worldService.assertCanReadWorld(world, subject);
    return world;
  }

  async function loadWorldForWrite(worldId: string, subject: worldService.AccessSubject): Promise<WorldRow> {
    const world = await worldService.getWorldOrThrow(app.db, worldId);
    worldService.assertCanWriteWorld(world, subject);
    return world;
  }

  // ---- World CRUD ----

  app.post('/worlds', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateWorldSchema.parse(request.body ?? {});
    await app.quotas.assertProjectQuota(user.userId, user.tier);
    const { world } = await worldService.createWorld(app.db, app.bus, user.userId, body);
    reply.status(201);
    return serializeWorld(world);
  });

  app.get('/worlds', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = {
      deletedAt: null,
      OR: user.orgId ? [{ ownerId: user.userId }, { orgId: user.orgId }] : [{ ownerId: user.userId }],
    };
    const rows = (await app.db.world.findMany({ where, orderBy: { updatedAt: 'desc' }, ...toPrismaPageArgs(query) })) as WorldRow[];
    return toPage(rows.map(serializeWorld), query);
  });

  app.get('/worlds/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const world = await loadWorldForRead(id, request.user!);
    return serializeWorld(world);
  });

  app.patch('/worlds/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const body = PatchWorldSchema.parse(request.body ?? {});
    const updated = (await app.db.world.update({ where: { id }, data: body })) as WorldRow;
    return serializeWorld(updated);
  });

  app.delete('/worlds/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    await app.db.world.update({ where: { id }, data: { deletedAt: new Date() } });
    reply.status(204);
    return null;
  });

  // ---- Document ----

  app.get('/worlds/:id/document', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForRead(id, request.user!);
    const { document } = await worldService.getDocument(app.db, id);
    return document;
  });

  app.put('/worlds/:id/document', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const { document } = await worldService.putDocument(app.db, app.bus, { worldId: id, document: request.body, userId: request.user!.userId });
    return document;
  });

  // ---- Versions & snapshots ----

  app.get('/worlds/:id/versions', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForRead(id, request.user!);
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = (await app.db.worldVersion.findMany({ where: { worldId: id }, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) })) as WorldVersionRow[];
    return toPage(rows.map(serializeVersion), query);
  });

  app.post('/worlds/:id/snapshots', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const body = CreateSnapshotSchema.parse(request.body ?? {});
    const snapshot = await worldService.createSnapshot(app.db, app.bus, id, request.user!.userId, body.label);
    reply.status(201);
    return serializeSnapshot(snapshot);
  });

  app.get('/worlds/:id/snapshots', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForRead(id, request.user!);
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = (await app.db.worldSnapshot.findMany({ where: { worldId: id }, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) })) as WorldSnapshotRow[];
    return toPage(rows.map(serializeSnapshot), query);
  });

  // ---- Entities ----

  app.post('/worlds/:id/entities', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const body = CreateEntitySchema.parse(request.body ?? {});
    const { entity } = await worldService.createEntity(app.db, app.bus, id, request.user!.userId, body);
    reply.status(201);
    return entity;
  });

  app.patch('/worlds/:id/entities/:eid', { preHandler: [app.authenticate] }, async (request) => {
    const { id, eid } = request.params as { id: string; eid: string };
    await loadWorldForWrite(id, request.user!);
    const patch = UpdateEntitySchema.parse(request.body ?? {});
    const { entity } = await worldService.updateEntity(app.db, app.bus, id, request.user!.userId, eid, patch);
    return entity;
  });

  app.delete('/worlds/:id/entities/:eid', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, eid } = request.params as { id: string; eid: string };
    await loadWorldForWrite(id, request.user!);
    const { removedIds } = await worldService.deleteEntity(app.db, app.bus, id, request.user!.userId, eid);
    reply.status(200);
    return { removedIds };
  });

  // ---- Publish ----

  app.post('/worlds/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const body = PublishWorldSchema.parse(request.body ?? {});
    const { product, world } = await worldService.publishWorld(app.db, app.bus, id, request.user!.userId, body);
    reply.status(201);
    return { product, world: serializeWorld(world) };
  });

  // ---- WorldForge ----

  app.post('/worlds/:id/forge', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadWorldForWrite(id, request.user!);
    const body = ForgeWorldSchema.parse(request.body ?? {});
    const result = await worldService.forgeWorld(app.db, app.bus, id, request.user!.userId, body as worldService.ForgeWorldInput);
    return result;
  });

  // ---- Semantic (AI context) ----

  app.get('/worlds/:id/semantic', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await loadWorldForRead(id, request.user!);
    const query = SemanticQuerySchema.parse(request.query ?? {});
    const text = await worldService.semanticText(app.db, id, query);
    reply.type('text/plain');
    return text;
  });
}
