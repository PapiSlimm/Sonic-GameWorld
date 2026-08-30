// World document access for the AI pipeline (CONTRACTS.md §8: "execute(ctx,args) mutating the
// WorldVersion.document through src/modules/worlds/service.ts functions if exported else via
// Prisma directly"). `src/modules/worlds/service.ts` has since landed and is used preferentially
// -- see `loadWorldsService()` below for the exact adapter shape: its real signature is
// `getDocument(db, worldId) => {world, version, document}` / `putDocument(db, bus, input) =>
// {world, version, document}`, operating on `PrismaLike`/`EventBus` directly (not a
// `FastifyInstance`), so this module adapts to that shape explicitly rather than assuming one.
// Falls back to direct Prisma access if that module is ever unavailable.
import type { FastifyInstance } from 'fastify';
import { createEmptyWorld, randomUuid, touchWorld, type WorldDocument } from '@sonic-gameworld/world-schema';
import { AppError } from '../../errors.js';
import type { AuthContext } from '../../types.js';
import type { PrismaLike } from '../../db.js';
import type { EventBus } from '../../bus.js';

export interface WorldRecord {
  id: string;
  ownerId: string;
  orgId: string | null;
  name: string;
  slug: string;
  status: string;
  bounds?: unknown;
}

export interface LoadedWorld {
  world: WorldRecord;
  doc: WorldDocument;
}

// ---------------------------------------------------------------------------------------------
// Hand-off to src/modules/worlds/service.ts, probed once at runtime. A non-literal specifier is
// used deliberately: with a literal path TypeScript attempts to resolve the module for type
// information, which would create a hard build-order dependency on a sibling agent's file. A
// non-literal specifier is treated as `Promise<any>`, so this compiles either way and starts
// exercising the real module the moment it's resolvable.
//
// IMPORTANT: worlds/service.ts's actual exports operate on `(db: PrismaLike, ...)` /
// `(db, bus, ...)`, not `(app: FastifyInstance, ...)`, and return a `{world, version, document}`
// bundle rather than a bare `WorldDocument`. The adapter below calls them with the correct
// arguments (`app.db`, `app.bus`) and unwraps `.document`/`.version.id` accordingly — passing
// `app` itself where a `PrismaLike` is expected would silently misbehave at runtime (Fastify
// instances have no `.world` delegate), since a dynamic `import()` gives TypeScript nothing to
// typecheck the call against.
// ---------------------------------------------------------------------------------------------
interface WorldsServiceDocumentBundle {
  world: WorldRecord & { currentVersionId?: string | null; deletedAt?: Date | null };
  version: { id: string };
  document: WorldDocument;
}
interface WorldsServiceShape {
  getDocument: (db: PrismaLike, worldId: string) => Promise<WorldsServiceDocumentBundle>;
  putDocument: (
    db: PrismaLike,
    bus: EventBus,
    input: { worldId: string; document: unknown; userId: string; summary?: string },
  ) => Promise<WorldsServiceDocumentBundle>;
}

const WORLDS_SERVICE_SPECIFIER = '../worlds/service.js';
let cachedWorldsService: WorldsServiceShape | null | undefined;

async function loadWorldsService(): Promise<WorldsServiceShape | null> {
  if (cachedWorldsService !== undefined) return cachedWorldsService;
  try {
    const specifier = WORLDS_SERVICE_SPECIFIER;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod: unknown = await import(specifier);
    const candidate = mod as Partial<WorldsServiceShape>;
    cachedWorldsService =
      typeof candidate.getDocument === 'function' && typeof candidate.putDocument === 'function' ? (candidate as WorldsServiceShape) : null;
  } catch {
    cachedWorldsService = null;
  }
  return cachedWorldsService;
}

/** Test-only: force the next call to re-probe for src/modules/worlds/service.ts. */
export function resetWorldsServiceProbeForTests(): void {
  cachedWorldsService = undefined;
}

// ---------------------------------------------------------------------------------------------
// Direct-Prisma fallback (used only if src/modules/worlds/service.ts is ever unavailable)
// ---------------------------------------------------------------------------------------------

async function getDocumentViaPrisma(app: FastifyInstance, world: WorldRecord & { currentVersionId?: string | null }): Promise<WorldDocument> {
  const version = world.currentVersionId
    ? await app.db.worldVersion.findUnique({ where: { id: world.currentVersionId } })
    : (await app.db.worldVersion.findMany({ where: { worldId: world.id }, orderBy: { createdAt: 'desc' }, take: 1 }))[0];

  if (!version) {
    // No document has ever been saved for this world yet -- hand back a fresh, valid, empty one
    // rather than failing; the first tool execution's save will persist it as version 1.
    return createEmptyWorld({ id: world.id, name: world.name, ownerId: world.ownerId });
  }
  return version.document as WorldDocument;
}

async function putDocumentViaPrisma(app: FastifyInstance, worldId: string, doc: WorldDocument, actorId: string): Promise<{ versionId: string }> {
  const existingCount = await app.db.worldVersion.count({ where: { worldId } });
  const version = await app.db.worldVersion.create({
    data: { worldId, version: `1.0.${existingCount}`, document: doc, createdBy: actorId },
  });
  await app.db.world.update({
    where: { id: worldId },
    data: { currentVersionId: version.id, entityCount: doc.entities.length, updatedAt: new Date() },
  });
  return { versionId: version.id };
}

// ---------------------------------------------------------------------------------------------
// Public API used by tools/registry.ts + pipeline.ts
// ---------------------------------------------------------------------------------------------

/** Load a world + its current document, preferring the worlds module's own service once it
 * exists. Throws AppError.notFound if the world doesn't exist (or is soft-deleted). */
export async function getWorldDocument(app: FastifyInstance, worldId: string): Promise<LoadedWorld> {
  const service = await loadWorldsService();
  if (service) {
    // worlds/service.ts's own getDocument() already throws AppError.notFound for a missing/
    // soft-deleted world (via getWorldOrThrow), so no separate existence check is needed here.
    const bundle = await service.getDocument(app.db, worldId);
    return { world: bundle.world, doc: bundle.document };
  }

  const worldRow = (await app.db.world.findUnique({ where: { id: worldId } })) as
    | (WorldRecord & { currentVersionId: string | null; deletedAt: Date | null })
    | null;
  if (!worldRow || worldRow.deletedAt) throw AppError.notFound('World', worldId);
  const doc = await getDocumentViaPrisma(app, worldRow);
  return { world: worldRow, doc };
}

/** Persist a mutated document as a new WorldVersion + touch World bookkeeping. Returns the new
 * version id. `touchWorld` (stamping `updatedAt`/modification history) is applied exactly once:
 * delegated to worlds/service.ts's `putDocument` when available (it already calls `touchWorld`
 * internally), or applied here before the direct-Prisma fallback otherwise. */
export async function saveWorldDocument(
  app: FastifyInstance,
  worldId: string,
  doc: WorldDocument,
  actorId: string,
  note: string,
): Promise<{ versionId: string; doc: WorldDocument }> {
  const service = await loadWorldsService();
  if (service) {
    const bundle = await service.putDocument(app.db, app.bus, { worldId, document: doc, userId: actorId, summary: note });
    return { versionId: bundle.version.id, doc: bundle.document };
  }

  const stamped = touchWorld(doc, actorId, note);
  const { versionId } = await putDocumentViaPrisma(app, worldId, stamped, actorId);
  return { versionId, doc: stamped };
}


/** create_world tool support: makes a brand-new World + its first WorldVersion. Independent of
 * `worldId` in the surrounding command (a command's target world isn't touched). */
export async function createWorldRecord(
  app: FastifyInstance,
  owner: AuthContext,
  opts: { name: string; description?: string; genre?: WorldDocument['genre']; sizeKm2?: number; maxPlayers?: number; theme?: string },
): Promise<{ world: WorldRecord; doc: WorldDocument }> {
  const doc = createEmptyWorld({
    name: opts.name,
    description: opts.description,
    ownerId: owner.userId,
    genre: opts.genre,
    sizeKm2: opts.sizeKm2,
    maxPlayers: opts.maxPlayers,
    source: 'AI_GENERATED',
  });
  const baseSlug = slugify(opts.name) || 'world';
  const slug = `${baseSlug}-${randomUuid().slice(0, 8)}`;
  const world = await app.db.world.create({
    data: {
      id: doc.id,
      ownerId: owner.userId,
      orgId: owner.orgId ?? null,
      name: opts.name,
      slug,
      description: opts.description ?? '',
      genre: opts.genre ?? [],
      status: 'DRAFT',
      sizeKm2: doc.sizeKm2,
      maxPlayers: doc.maxPlayers,
      entityCount: 0,
    },
  });
  const version = await app.db.worldVersion.create({ data: { worldId: world.id, version: '1.0.0', document: doc, createdBy: owner.userId } });
  await app.db.world.update({ where: { id: world.id }, data: { currentVersionId: version.id } });
  return { world: world as WorldRecord, doc };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/** Basic authorization for AI actions against a world: owner, same-org member, or platform_admin. */
export function assertWorldAccess(world: WorldRecord, user: AuthContext): void {
  if (world.ownerId === user.userId) return;
  if (world.orgId && user.orgId && world.orgId === user.orgId) return;
  if (user.roles.includes('platform_admin')) return;
  throw AppError.forbidden('You do not have access to this world');
}
