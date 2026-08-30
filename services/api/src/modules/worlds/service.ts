// Worlds domain service (§6, §9 of CONTRACTS.md): plain functions over `PrismaLike` + `EventBus`
// with NO Fastify dependency, so the AI orchestrator module (services/api/src/modules/ai) — and
// any other module — can call world mutations directly instead of re-implementing document
// versioning/validation. Route handlers in ./index.ts are thin wrappers around these.
//
// Versioning model (deliberate, see docs/CONTRACTS.md §9-10):
//  - `putDocument` (full replace, e.g. PUT /worlds/:id/document, or a WorldForge run) always
//    creates a NEW `WorldVersion` row — a full-document replace is a meaningful checkpoint.
//  - `patchCurrentDocument` (used by entity CRUD) mutates the CURRENT `WorldVersion.document`
//    in place — no new version row per entity edit. `POST /worlds/:id/snapshots` is the
//    user-labelled checkpoint mechanism for that in-place history.
// Every mutation publishes `WORLD_UPDATED`; `src/realtime/ws.ts` fans that out to the
// `world:<id>` topic automatically (it derives the topic from `payload.worldId`), so nothing
// here needs to know about WebSocket rooms directly.
import { randomUUID } from 'node:crypto';
import {
  identityTransform,
  sceneGraphToSemantic,
  touchWorld,
  validateWorld,
  vec3,
  type EntityKind,
  type SemanticOptions,
  type WorldDocument,
  type WorldEntity,
} from '@sonic-gameworld/world-schema';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import type { PrismaLike } from '../../db.js';
import type { EventBus } from '../../bus.js';
import type { PlanTier, Role } from '@prisma/client';
import { applyForgeTheme, createWorldForgeProvider, type ForgeProviderName, type ForgeResult, type ForgeTheme } from './forge.js';

// ---------------------------------------------------------------------------------------------
// Row shapes (see the note in ../../types.ts on why these are hand-declared rather than imported
// from a generated Prisma client type in this sandbox).
// ---------------------------------------------------------------------------------------------

export interface WorldRow {
  id: string;
  ownerId: string;
  orgId: string | null;
  name: string;
  slug: string;
  description: string;
  genre: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sizeKm2: number;
  maxPlayers: number;
  thumbnailUrl: string | null;
  currentVersionId: string | null;
  entityCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

export interface WorldVersionRow {
  id: string;
  worldId: string;
  version: string;
  document: unknown;
  createdBy: string;
  createdAt: Date;
}

export interface WorldSnapshotRow {
  id: string;
  worldId: string;
  versionId: string;
  label: string | null;
  createdBy: string;
  entityCount: number;
  sizeBytes: number;
  createdAt: Date;
}

/** Minimal identity shape needed for ownership/permission checks — matches `AuthContext`. */
export interface AccessSubject {
  userId: string;
  orgId?: string;
  roles: readonly Role[];
}

// ---------------------------------------------------------------------------------------------
// Access control (pure — reusable by route handlers and the AI tool executor alike)
// ---------------------------------------------------------------------------------------------

export function canAccessWorld(world: Pick<WorldRow, 'ownerId' | 'orgId' | 'status'>, subject: AccessSubject): boolean {
  if (world.ownerId === subject.userId) return true;
  if (world.orgId && subject.orgId && world.orgId === subject.orgId) return true;
  if (subject.roles.includes('platform_admin')) return true;
  return false;
}

export function canReadWorld(world: Pick<WorldRow, 'ownerId' | 'orgId' | 'status'>, subject: AccessSubject): boolean {
  if (world.status === 'PUBLISHED') return true;
  return canAccessWorld(world, subject);
}

/** Throws AppError.forbidden unless the subject owns the world, shares its org, or is a platform admin. */
export function assertCanWriteWorld(world: Pick<WorldRow, 'ownerId' | 'orgId' | 'status'>, subject: AccessSubject): void {
  if (!canAccessWorld(world, subject)) throw AppError.forbidden('You do not have write access to this world');
}

export function assertCanReadWorld(world: Pick<WorldRow, 'ownerId' | 'orgId' | 'status'>, subject: AccessSubject): void {
  if (!canReadWorld(world, subject)) throw AppError.forbidden('You do not have access to this world');
}

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------

export async function getWorldOrThrow(db: PrismaLike, worldId: string): Promise<WorldRow> {
  const world = (await db.world.findUnique({ where: { id: worldId } })) as WorldRow | null;
  if (!world || world.deletedAt) throw AppError.notFound('World', worldId);
  return world;
}

export async function getCurrentVersionOrThrow(db: PrismaLike, world: Pick<WorldRow, 'id' | 'currentVersionId'>): Promise<WorldVersionRow> {
  if (!world.currentVersionId) throw AppError.internal(`World ${world.id} has no current version`);
  const version = (await db.worldVersion.findUnique({ where: { id: world.currentVersionId } })) as WorldVersionRow | null;
  if (!version) throw AppError.internal(`World ${world.id} current version ${world.currentVersionId} is missing`);
  return version;
}

export interface DocumentBundle {
  world: WorldRow;
  version: WorldVersionRow;
  document: WorldDocument;
}

/** Load + validate the current document for a world. Throws AppError.internal if the stored
 * document is somehow malformed (should be unreachable — every write path validates first). */
export async function getDocument(db: PrismaLike, worldId: string): Promise<DocumentBundle> {
  const world = await getWorldOrThrow(db, worldId);
  const version = await getCurrentVersionOrThrow(db, world);
  const result = validateWorld(version.document);
  if (!result.ok || !result.document) {
    throw AppError.internal(`Stored world document for '${worldId}' failed validation`, result.issues);
  }
  return { world, version, document: result.document };
}

async function nextVersionLabel(db: PrismaLike, worldId: string): Promise<string> {
  const count = await db.worldVersion.count({ where: { worldId } });
  return String(count + 1);
}

async function publishWorldUpdated(bus: EventBus, worldId: string, changedBy: string, summary: string): Promise<void> {
  await bus.publish(createEvent({ type: 'WORLD_UPDATED', payload: { worldId, changedBy, summary } }));
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

export interface CreateWorldInput {
  name: string;
  description?: string;
  genre?: WorldDocument['genre'];
  sizeKm2?: number;
  maxPlayers?: number;
  orgId?: string;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `world-${randomUUID().slice(0, 8)}`;
}

async function uniqueSlug(db: PrismaLike, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop -- small, bounded by actual collisions
  while (await db.world.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

/** Import lazily to avoid a hard cycle: createEmptyWorld lives in the same package as WorldDocument. */
async function emptyWorldDocument(opts: {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  genre?: WorldDocument['genre'];
  sizeKm2?: number;
  maxPlayers?: number;
}): Promise<WorldDocument> {
  const { createEmptyWorld } = await import('@sonic-gameworld/world-schema');
  return createEmptyWorld(opts);
}

export async function createWorld(db: PrismaLike, bus: EventBus, ownerId: string, input: CreateWorldInput): Promise<DocumentBundle> {
  const id = randomUUID();
  const slug = await uniqueSlug(db, slugify(input.name));
  const document = await emptyWorldDocument({
    id,
    name: input.name,
    description: input.description,
    ownerId,
    genre: input.genre,
    sizeKm2: input.sizeKm2,
    maxPlayers: input.maxPlayers,
  });

  const world = (await db.world.create({
    data: {
      id,
      ownerId,
      orgId: input.orgId ?? null,
      name: input.name,
      slug,
      description: input.description ?? '',
      genre: input.genre ?? [],
      status: 'DRAFT',
      sizeKm2: document.sizeKm2,
      maxPlayers: document.maxPlayers,
      entityCount: 0,
    },
  })) as WorldRow;

  const version = (await db.worldVersion.create({
    data: { worldId: world.id, version: '1', document, createdBy: ownerId },
  })) as WorldVersionRow;

  const updated = (await db.world.update({ where: { id: world.id }, data: { currentVersionId: version.id } })) as WorldRow;

  await bus.publish(createEvent({ type: 'WORLD_CREATED', payload: { worldId: world.id, ownerId, name: world.name } }));

  return { world: updated, version, document };
}

// ---------------------------------------------------------------------------------------------
// Document replace (versioned) & in-place patch (entity CRUD, forge)
// ---------------------------------------------------------------------------------------------

export interface PutDocumentInput {
  worldId: string;
  document: unknown;
  userId: string;
  /** Skip re-stamping `updatedAt`/modificationHistory (used internally by createWorld-adjacent flows). */
  summary?: string;
}

export async function putDocument(db: PrismaLike, bus: EventBus, input: PutDocumentInput): Promise<DocumentBundle> {
  const world = await getWorldOrThrow(db, input.worldId);
  const result = validateWorld(input.document);
  const errors = result.issues.filter((i) => i.severity === 'error');
  if (!result.ok || errors.length > 0 || !result.document) {
    throw AppError.unprocessable('World document failed validation', errors);
  }

  let doc = result.document;
  if (doc.id !== world.id) doc = { ...doc, id: world.id };
  doc = touchWorld(doc, input.userId, input.summary ?? 'Document replaced');

  const versionLabel = await nextVersionLabel(db, world.id);
  const version = (await db.worldVersion.create({
    data: { worldId: world.id, version: versionLabel, document: doc, createdBy: input.userId },
  })) as WorldVersionRow;

  const updatedWorld = (await db.world.update({
    where: { id: world.id },
    data: {
      currentVersionId: version.id,
      entityCount: doc.entities.length,
      name: doc.name,
      description: doc.description,
      genre: doc.genre,
      sizeKm2: doc.sizeKm2,
      maxPlayers: doc.maxPlayers,
    },
  })) as WorldRow;

  await publishWorldUpdated(bus, world.id, input.userId, input.summary ?? `Document replaced (v${versionLabel})`);
  return { world: updatedWorld, version, document: doc };
}

export type DocumentMutator = (doc: WorldDocument) => WorldDocument;

/** Apply `mutate` to the CURRENT version's document in place (no new WorldVersion row), then
 * re-validate and persist. Used by entity CRUD and WorldForge's incremental helpers. */
export async function patchCurrentDocument(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  summary: string,
  mutate: DocumentMutator,
): Promise<DocumentBundle> {
  const { world, version, document } = await getDocument(db, worldId);
  const mutated = touchWorld(mutate(document), userId, summary);
  const result = validateWorld(mutated);
  const errors = result.issues.filter((i) => i.severity === 'error');
  if (!result.ok || errors.length > 0 || !result.document) {
    throw AppError.unprocessable('That change would produce an invalid world document', errors);
  }

  await db.worldVersion.update({ where: { id: version.id }, data: { document: result.document } });
  const updatedWorld = (await db.world.update({
    where: { id: worldId },
    data: { entityCount: result.document.entities.length },
  })) as WorldRow;

  await publishWorldUpdated(bus, worldId, userId, summary);
  return { world: updatedWorld, version: { ...version, document: result.document }, document: result.document };
}

// ---------------------------------------------------------------------------------------------
// Entity CRUD (§9: POST/PATCH/DELETE /worlds/:id/entities...)
// ---------------------------------------------------------------------------------------------

export interface CreateEntityInput {
  kind: EntityKind;
  name: string;
  parentId?: string;
  transform?: WorldEntity['transform'];
  geo?: WorldEntity['geo'];
  assetRef?: WorldEntity['assetRef'];
  behavior?: WorldEntity['behavior'];
  script?: WorldEntity['script'];
  ai?: WorldEntity['ai'];
  tags?: string[];
  metadata?: Record<string, unknown>;
  visibility?: WorldEntity['permissions']['visibility'];
}

export interface EntityMutationResult {
  document: WorldDocument;
  entity: WorldEntity;
}

export type EntityOp =
  | { type: 'CREATE'; input: CreateEntityInput }
  | { type: 'UPDATE'; entityId: string; patch: Record<string, unknown> }
  | { type: 'DELETE'; entityId: string };

/** Single entry point for entity mutations — convenient for the AI tool executor, which picks
 * the op shape from the incoming `create_entity`/`modify_entity`/`delete_entity` tool call. */
export function applyEntityPatch(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  op: { type: 'CREATE'; input: CreateEntityInput },
): Promise<EntityMutationResult>;
export function applyEntityPatch(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  op: { type: 'UPDATE'; entityId: string; patch: Record<string, unknown> },
): Promise<EntityMutationResult>;
export function applyEntityPatch(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  op: { type: 'DELETE'; entityId: string },
): Promise<{ document: WorldDocument; removedIds: string[] }>;
export function applyEntityPatch(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  op: EntityOp,
): Promise<EntityMutationResult | { document: WorldDocument; removedIds: string[] }> {
  if (op.type === 'CREATE') return createEntity(db, bus, worldId, userId, op.input);
  if (op.type === 'UPDATE') return updateEntity(db, bus, worldId, userId, op.entityId, op.patch);
  return deleteEntity(db, bus, worldId, userId, op.entityId);
}

export async function createEntity(db: PrismaLike, bus: EventBus, worldId: string, userId: string, input: CreateEntityInput): Promise<EntityMutationResult> {
  let created: WorldEntity | undefined;
  const { document } = await patchCurrentDocument(db, bus, worldId, userId, `Created entity "${input.name}"`, (doc) => {
    if (input.parentId && !doc.entities.some((e) => e.id === input.parentId)) {
      throw AppError.badRequest(`parentId '${input.parentId}' does not exist in this world`);
    }
    const entity: WorldEntity = {
      id: randomUUID(),
      kind: input.kind,
      name: input.name,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      transform: input.transform ?? identityTransform(),
      ...(input.geo ? { geo: input.geo } : {}),
      ...(input.assetRef ? { assetRef: input.assetRef } : {}),
      ...(input.behavior ? { behavior: input.behavior } : {}),
      ...(input.script ? { script: input.script } : {}),
      ...(input.ai ? { ai: input.ai } : {}),
      tags: input.tags ?? [],
      permissions: { ownerId: userId, editors: [], visibility: input.visibility ?? 'PRIVATE' },
      metadata: input.metadata ?? {},
    };
    created = entity;
    return { ...doc, entities: [...doc.entities, entity] };
  });
  return { document, entity: created as WorldEntity };
}

export async function updateEntity(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  entityId: string,
  patch: Record<string, unknown>,
): Promise<EntityMutationResult> {
  let updated: WorldEntity | undefined;
  const { document } = await patchCurrentDocument(db, bus, worldId, userId, `Updated entity ${entityId}`, (doc) => {
    const idx = doc.entities.findIndex((e) => e.id === entityId);
    if (idx === -1) throw AppError.notFound('Entity', entityId);
    const existing = doc.entities[idx] as WorldEntity;
    const merged: WorldEntity = { ...existing, ...patch, id: existing.id } as WorldEntity;
    updated = merged;
    const entities = [...doc.entities];
    entities[idx] = merged;
    return { ...doc, entities };
  });
  return { document, entity: updated as WorldEntity };
}

export async function deleteEntity(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  entityId: string,
): Promise<{ document: WorldDocument; removedIds: string[] }> {
  let removedIds: string[] = [];
  const { document } = await patchCurrentDocument(db, bus, worldId, userId, `Deleted entity ${entityId}`, (doc) => {
    if (!doc.entities.some((e) => e.id === entityId)) throw AppError.notFound('Entity', entityId);
    const toRemove = new Set<string>([entityId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of doc.entities) {
        if (e.parentId && toRemove.has(e.parentId) && !toRemove.has(e.id)) {
          toRemove.add(e.id);
          changed = true;
        }
      }
    }
    removedIds = [...toRemove];
    return { ...doc, entities: doc.entities.filter((e) => !toRemove.has(e.id)) };
  });
  return { document, removedIds };
}

// ---------------------------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------------------------

export async function createSnapshot(db: PrismaLike, bus: EventBus, worldId: string, userId: string, label?: string): Promise<WorldSnapshotRow> {
  const { version, document } = await getDocument(db, worldId);
  const snapshot = (await db.worldSnapshot.create({
    data: {
      worldId,
      versionId: version.id,
      label: label ?? null,
      createdBy: userId,
      entityCount: document.entities.length,
      sizeBytes: Buffer.byteLength(JSON.stringify(document)),
    },
  })) as WorldSnapshotRow;
  await bus.publish(createEvent({ type: 'WORLD_SNAPSHOT_CREATED', payload: { worldId, snapshotId: snapshot.id, ...(label ? { label } : {}) } }));
  return snapshot;
}

// ---------------------------------------------------------------------------------------------
// Publish (creates a marketplace Product draft of category WORLD)
// ---------------------------------------------------------------------------------------------

export interface CreatorProfileRow {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
}

/** Get-or-create the caller's CreatorProfile — small, self-contained duplicate of the same
 * bootstrap logic in modules/creator/index.ts (kept local so worlds/games do not reach into
 * another module's file across the module boundary). */
export async function getOrCreateCreatorProfile(db: PrismaLike, userId: string): Promise<CreatorProfileRow> {
  let profile = (await db.creatorProfile.findUnique({ where: { userId } })) as CreatorProfileRow | null;
  if (!profile) {
    const user = (await db.user.findUnique({ where: { id: userId } })) as { id: string; handle: string; displayName: string } | null;
    if (!user) throw AppError.notFound('User', userId);
    profile = (await db.creatorProfile.create({
      data: {
        userId,
        handle: user.handle,
        displayName: user.displayName,
        verified: false,
        followers: 0,
        repScore: 0,
        repQuality: 0,
        repReliability: 0,
        repSales: 0,
        repUpdates: 0,
        repReviews: 0,
        repSupport: 0,
        repOriginality: 0,
        repCompliance: 0,
        repComputedAt: new Date(),
      },
    })) as CreatorProfileRow;
  }
  return profile;
}

async function uniqueProductSlug(db: PrismaLike, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop -- small, bounded by actual collisions
  while (await db.product.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export interface PublishWorldInput {
  visibility?: 'PRIVATE' | 'TEAM' | 'PUBLIC';
  priceCents?: number;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: string;
  priceCents: number;
  creatorId: string;
  refKind: string;
  refId: string;
  publishedAt: Date | null;
}

export async function publishWorld(
  db: PrismaLike,
  bus: EventBus,
  worldId: string,
  userId: string,
  input: PublishWorldInput = {},
): Promise<{ product: ProductRow; world: WorldRow }> {
  const { world, version, document } = await getDocument(db, worldId);
  const profile = await getOrCreateCreatorProfile(db, userId);
  const slug = await uniqueProductSlug(db, slugify(`${document.name}-world`));

  const product = (await db.product.create({
    data: {
      slug,
      name: document.name,
      category: 'WORLD',
      genre: document.genre,
      engines: ['WEB'],
      priceCents: input.priceCents ?? 0,
      currency: 'USD',
      description: document.description || `A GameWorld: ${document.name}`,
      tags: [],
      previewUrls: [],
      license: document.passport.license,
      refKind: 'WORLD',
      refId: world.id,
      creatorId: profile.id,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })) as ProductRow;

  await db.productVersion.create({ data: { productId: product.id, version: '1', worldVersionId: version.id } });
  const updatedWorld = (await db.world.update({ where: { id: world.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } })) as WorldRow;

  await bus.publish(createEvent({ type: 'WORLD_PUBLISHED', payload: { worldId: world.id, productId: product.id, versionId: version.id } }));
  await bus.publish(createEvent({ type: 'PRODUCT_LISTED', payload: { productId: product.id, creatorId: profile.id, category: 'WORLD', priceCents: product.priceCents } }));

  return { product, world: updatedWorld };
}

// ---------------------------------------------------------------------------------------------
// Semantic (AI context) text
// ---------------------------------------------------------------------------------------------

export async function semanticText(db: PrismaLike, worldId: string, opts?: SemanticOptions): Promise<string> {
  const { document } = await getDocument(db, worldId);
  return sceneGraphToSemantic(document, opts);
}

// ---------------------------------------------------------------------------------------------
// WorldForge (§9: POST /worlds/:id/forge)
// ---------------------------------------------------------------------------------------------

export interface ForgeWorldInput {
  lat: number;
  lon: number;
  radiusKm: number;
  theme?: ForgeTheme;
  provider?: ForgeProviderName;
}

export interface ForgeWorldResult {
  document: WorldDocument;
  entitiesAdded: number;
  provider: string;
  license: ForgeResult['license'];
  theme: ForgeTheme | null;
}

/** Generate real-world or procedural content for a world and merge it into the current document
 * as a new WorldVersion (a forge run is a meaningful checkpoint, same as a full document PUT).
 * Falls back to the deterministic SyntheticProvider if an explicit OVERPASS run fails (network
 * unavailable, rate-limited, ...) so forge always succeeds. */
export async function forgeWorld(db: PrismaLike, bus: EventBus, worldId: string, userId: string, input: ForgeWorldInput): Promise<ForgeWorldResult> {
  const providerName: ForgeProviderName = input.provider ?? 'SYNTHETIC';
  const req = { lat: input.lat, lon: input.lon, radiusKm: input.radiusKm };

  let result: ForgeResult;
  try {
    result = await createWorldForgeProvider(providerName).generate(req);
  } catch (err) {
    if (providerName !== 'OVERPASS') throw err;
    const fallback = await createWorldForgeProvider('SYNTHETIC').generate(req);
    result = { ...fallback, sourceLabel: `SYNTHETIC (fallback: OVERPASS unavailable — ${err instanceof Error ? err.message : String(err)})` };
  }

  const themed = applyForgeTheme(result.entities, input.theme);
  const { world, document: currentDoc } = await getDocument(db, worldId);

  const newEntities: WorldEntity[] = themed.entities.map((e) => ({
    id: e.id ?? randomUUID(),
    kind: e.kind,
    name: e.name,
    ...(e.parentId ? { parentId: e.parentId } : {}),
    transform: e.transform,
    ...(e.geo ? { geo: e.geo } : {}),
    ...(e.assetRef ? { assetRef: e.assetRef } : {}),
    ...(e.behavior ? { behavior: e.behavior } : {}),
    ...(e.script ? { script: e.script } : {}),
    ...(e.ai ? { ai: e.ai } : {}),
    tags: e.tags ?? [],
    permissions: { ownerId: world.ownerId, editors: [], visibility: 'PRIVATE' },
    metadata: e.metadata ?? {},
  }));

  // Expand bounds so forged content (which can span kilometers) doesn't fail validateWorld's
  // "entity outside world bounds" check.
  const radiusM = Math.max(200, input.radiusKm * 1000);
  const neededHalf = radiusM * 1.15;
  const bounds = {
    min: vec3(Math.min(currentDoc.bounds.min.x, -neededHalf), Math.min(currentDoc.bounds.min.y, -50), Math.min(currentDoc.bounds.min.z, -neededHalf)),
    max: vec3(Math.max(currentDoc.bounds.max.x, neededHalf), Math.max(currentDoc.bounds.max.y, 500), Math.max(currentDoc.bounds.max.z, neededHalf)),
  };

  const mergedDoc: WorldDocument = {
    ...currentDoc,
    bounds,
    sizeKm2: Math.max(currentDoc.sizeKm2, Math.round((2 * input.radiusKm) ** 2 * 100) / 100),
    origin: { lat: input.lat, lon: input.lon, altM: 0 },
    environment: { ...currentDoc.environment, ...themed.environment },
    entities: [...currentDoc.entities, ...newEntities],
  };

  const { document } = await putDocument(db, bus, {
    worldId,
    document: mergedDoc,
    userId,
    summary: `WorldForge: ${result.sourceLabel}${input.theme ? ` (${input.theme})` : ''} at (${input.lat}, ${input.lon}), ${input.radiusKm}km`,
  });

  return { document, entitiesAdded: newEntities.length, provider: result.sourceLabel, license: result.license, theme: input.theme ?? null };
}

// ---------------------------------------------------------------------------------------------
// Quota helper re-exported for convenience at call sites
// ---------------------------------------------------------------------------------------------

export type { PlanTier };
