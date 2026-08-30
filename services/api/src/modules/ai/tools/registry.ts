// The 20 AI tools (CONTRACTS.md §8 / world-schema/ai-tools.ts `AIToolName`). Each tool pairs a
// zod args schema (already defined in AI_TOOL_SCHEMAS) with:
//   - `permission`  — the AIPermission required (see ../permissions.ts for role → grants)
//   - `mutatesDoc`  — whether a successful execute() changes `ctx.doc` (pipeline.ts only bumps a
//                     new WorldVersion when at least one executed call in the batch says yes)
//   - `validate()`  — bounds / quota / license checks, run AFTER permission, BEFORE execute()
//   - `execute()`   — mutates `ctx.doc` (in place) and/or issues Prisma writes, returns events
import type { FastifyInstance } from 'fastify';
import {
  AI_TOOL_DEFINITIONS,
  type AIAgentRole,
  type AIPermission,
  type AIToolArgs,
  type AIToolName,
} from '@sonic-gameworld/ai-sdk';
import {
  checkLicenseCompatibility,
  childrenOf,
  findEntity,
  identityTransform,
  randomUuid,
  transformAt,
  type CameraRig,
  type LicenseRecord,
  type MissionDefinition,
  type SystemRef,
  type Trigger,
  type WorldDocument,
  type WorldEntity,
} from '@sonic-gameworld/world-schema';
import type { AuthContext } from '../../../types.js';
import { createWorldRecord, slugify, type WorldRecord } from '../worldStore.js';
import { clampToBounds, isInBounds, resolveAnchorEntity, resolvePlacement } from '../placement.js';

export interface ToolContext {
  app: FastifyInstance;
  user: AuthContext;
  world: WorldRecord;
  /** Mutable working copy of the world document for this command. Tools that mutate the world
   * assign into this via `ctx.doc = {...ctx.doc, ...}` (immutable-style updates) — pipeline.ts
   * reads `ctx.doc` back out after every call. */
  doc: WorldDocument;
  /** The agent role this batch of tool calls is running as (set once per `executeToolPlan` call —
   * see pipeline.ts). Only `generate_asset` reads this today, to stamp it onto the
   * `ai.generate` job it enqueues. */
  role: AIAgentRole;
}

export type ToolDenialCode = 'VALIDATION' | 'QUOTA' | 'LICENSE' | 'SAFETY' | 'PERMISSION';

export interface ToolValidation {
  ok: boolean;
  reason?: string;
  code?: ToolDenialCode;
}

export interface ToolExecutionOutcome {
  ok: boolean;
  result?: unknown;
  error?: string;
  events: string[];
  /** True if `ctx.doc` was mutated by this call and needs persisting. */
  docChanged: boolean;
}

export interface ToolDefinition<K extends AIToolName = AIToolName> {
  name: K;
  description: string;
  permission: AIPermission;
  roles: AIAgentRole[];
  mutatesDoc: boolean;
  validate(ctx: ToolContext, args: AIToolArgs[K]): Promise<ToolValidation> | ToolValidation;
  execute(ctx: ToolContext, args: AIToolArgs[K]): Promise<ToolExecutionOutcome> | ToolExecutionOutcome;
}

const ok: ToolValidation = { ok: true };
function deny(code: ToolDenialCode, reason: string): ToolValidation {
  return { ok: false, code, reason };
}
function success(result: unknown, events: string[], docChanged: boolean): ToolExecutionOutcome {
  return { ok: true, result, events, docChanged };
}

function resolveEntityRef(doc: WorldDocument, ref: { entityId?: string; entityName?: string }): WorldEntity | undefined {
  const key = ref.entityId ?? ref.entityName;
  return key ? findEntity(doc, key) : undefined;
}

function descendantIds(doc: WorldDocument, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const child of childrenOf(doc, parentId)) {
        if (!ids.has(child.id)) {
          ids.add(child.id);
          next.push(child.id);
        }
      }
    }
    frontier = next;
  }
  return ids;
}

/** Shared bounds pre-check for tools that take a `placement`/`position`: reject only a wildly
 * out-of-range explicit position (more than one bounds-diagonal past the box); an anchor-relative
 * placement is always accepted here because `resolvePlacement` clamps it into bounds at execute
 * time — this only screens obviously-bad absolute coordinates a model might hallucinate. */
function validatePlacementBounds(doc: WorldDocument, placement?: { position?: { x: number; y: number; z: number }; anchor?: string }): ToolValidation {
  if (placement?.anchor && !resolveAnchorEntity(doc, placement)) {
    return deny('VALIDATION', `No entity found matching "${placement.anchor}"`);
  }
  if (placement?.position) {
    const b = doc.bounds;
    const diagonal = Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) || 1;
    const nearest = clampToBounds(placement.position, b);
    const overshoot = Math.hypot(placement.position.x - nearest.x, placement.position.y - nearest.y, placement.position.z - nearest.z);
    if (overshoot > diagonal) {
      return deny('VALIDATION', `Position (${placement.position.x}, ${placement.position.y}, ${placement.position.z}) is far outside world bounds`);
    }
  }
  return ok;
}

function newEntity(doc: WorldDocument, opts: Partial<WorldEntity> & Pick<WorldEntity, 'kind' | 'name'>, ownerId: string): WorldEntity {
  return {
    id: randomUuid(),
    parentId: undefined,
    transform: identityTransform(),
    tags: [],
    permissions: { ownerId, editors: [], visibility: 'PRIVATE' },
    metadata: {},
    ...opts,
  };
}

// -------------------------------------------------------------------------------------------
// Tool implementations
// -------------------------------------------------------------------------------------------

const create_world: ToolDefinition<'create_world'> = {
  name: 'create_world',
  description: AI_TOOL_DEFINITIONS.create_world.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.create_world.roles,
  mutatesDoc: false, // creates a *new* world; doesn't touch the command's current ctx.doc
  validate: async (ctx) => {
    await ctx.app.quotas.assertProjectQuota(ctx.user.userId, ctx.user.tier);
    return ok;
  },
  execute: async (ctx, args) => {
    const { world, doc } = await createWorldRecord(ctx.app, ctx.user, {
      name: args.name,
      description: args.description,
      genre: args.genre,
      sizeKm2: args.sizeKm2,
      maxPlayers: args.maxPlayers,
      theme: args.theme,
    });
    return success({ worldId: world.id, slug: world.slug, name: world.name }, ['world.created'], false);
  },
};

const create_entity: ToolDefinition<'create_entity'> = {
  name: 'create_entity',
  description: AI_TOOL_DEFINITIONS.create_entity.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.create_entity.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    if (args.parentId && !findEntity(ctx.doc, args.parentId)) return deny('VALIDATION', `Parent entity "${args.parentId}" not found`);
    return validatePlacementBounds(ctx.doc, args.placement ?? (args.transform ? { position: args.transform.position } : undefined));
  },
  execute: (ctx, args) => {
    const position = args.transform?.position ?? resolvePlacement(ctx.doc, args.placement);
    const transform = args.transform ? { ...args.transform, position: clampToBounds(args.transform.position, ctx.doc.bounds) } : transformAt(position.x, position.y, position.z);
    const entity = newEntity(
      ctx.doc,
      {
        kind: args.kind,
        name: args.name,
        parentId: args.parentId,
        transform,
        tags: args.tags,
        metadata: args.metadata,
        assetRef: args.assetId ? { assetId: args.assetId } : undefined,
      },
      ctx.user.userId,
    );
    ctx.doc = { ...ctx.doc, entities: [...ctx.doc.entities, entity] };
    return success({ entity }, ['entity.created'], true);
  },
};

function applyEntityPatch(entity: WorldEntity, patch: Record<string, unknown>): WorldEntity {
  const next: WorldEntity = { ...entity };
  if (patch.name !== undefined) next.name = String(patch.name);
  if (patch.tags !== undefined) next.tags = patch.tags as string[];
  if (patch.metadata !== undefined) next.metadata = { ...next.metadata, ...(patch.metadata as Record<string, unknown>) };
  if (patch.behavior !== undefined) {
    const b = patch.behavior as { systemId?: string; params?: Record<string, unknown> };
    next.behavior = { systemId: b.systemId ?? next.behavior?.systemId, params: { ...next.behavior?.params, ...b.params } };
  }
  if (patch.transform !== undefined) {
    const t = patch.transform as { position?: WorldEntity['transform']['position']; rotation?: WorldEntity['transform']['rotation']; scale?: WorldEntity['transform']['scale'] };
    next.transform = {
      position: t.position ?? next.transform.position,
      rotation: t.rotation ?? next.transform.rotation,
      scale: t.scale ?? next.transform.scale,
    };
  }
  if (patch.ai !== undefined && typeof patch.ai === 'object' && patch.ai !== null) {
    const raw = patch.ai as Record<string, unknown>;
    next.ai = {
      memoryEnabled: typeof raw.memoryEnabled === 'boolean' ? raw.memoryEnabled : (next.ai?.memoryEnabled ?? false),
      agentId: typeof raw.agentId === 'string' ? raw.agentId : next.ai?.agentId,
      personalityId: typeof raw.personalityId === 'string' ? raw.personalityId : next.ai?.personalityId,
    };
  }
  return next;
}

const modify_entity: ToolDefinition<'modify_entity'> = {
  name: 'modify_entity',
  description: AI_TOOL_DEFINITIONS.modify_entity.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.modify_entity.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    const entity = resolveEntityRef(ctx.doc, args);
    if (!entity) return deny('VALIDATION', `Entity "${args.entityId ?? args.entityName}" not found`);
    const patch = args.patch as { transform?: { position?: { x: number; y: number; z: number } } };
    if (patch.transform?.position && !isInBounds(patch.transform.position, ctx.doc.bounds)) {
      return deny('VALIDATION', 'Requested transform.position is outside world bounds');
    }
    return ok;
  },
  execute: (ctx, args) => {
    const entity = resolveEntityRef(ctx.doc, args)!;
    const patched = applyEntityPatch(entity, args.patch);
    ctx.doc = { ...ctx.doc, entities: ctx.doc.entities.map((e) => (e.id === entity.id ? patched : e)) };
    return success({ entity: patched }, ['entity.modified'], true);
  },
};

const delete_entity: ToolDefinition<'delete_entity'> = {
  name: 'delete_entity',
  description: AI_TOOL_DEFINITIONS.delete_entity.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.delete_entity.roles,
  mutatesDoc: true,
  validate: (ctx, args) => (resolveEntityRef(ctx.doc, args) ? ok : deny('VALIDATION', `Entity "${args.entityId ?? args.entityName}" not found`)),
  execute: (ctx, args) => {
    const entity = resolveEntityRef(ctx.doc, args)!;
    const toRemove = descendantIds(ctx.doc, entity.id);
    ctx.doc = { ...ctx.doc, entities: ctx.doc.entities.filter((e) => !toRemove.has(e.id)) };
    return success({ deletedEntityId: entity.id, deletedCount: toRemove.size }, ['entity.deleted'], true);
  },
};

const modify_terrain: ToolDefinition<'modify_terrain'> = {
  name: 'modify_terrain',
  description: AI_TOOL_DEFINITIONS.modify_terrain.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.modify_terrain.roles,
  mutatesDoc: true,
  validate: (ctx, args) => validatePlacementBounds(ctx.doc, args.placement ?? (args.center ? { position: args.center } : undefined)),
  execute: (ctx, args) => {
    const center = args.center ?? resolvePlacement(ctx.doc, args.placement);
    // No dedicated heightmap in the world-schema document — represent the edit as a TERRAIN
    // entity carrying an append-only operation log in its metadata, matching how PROP/VOLUME
    // entities already store free-form behavior state.
    const existing = ctx.doc.entities.find(
      (e) => e.kind === 'TERRAIN' && Math.hypot(e.transform.position.x - center.x, e.transform.position.z - center.z) < args.radiusM,
    );
    const op = { operation: args.operation, center, radiusM: args.radiusM, strength: args.strength, material: args.material, at: new Date().toISOString() };
    if (existing) {
      const ops = [...((existing.metadata.ops as unknown[]) ?? []), op];
      const patched: WorldEntity = { ...existing, metadata: { ...existing.metadata, ops } };
      ctx.doc = { ...ctx.doc, entities: ctx.doc.entities.map((e) => (e.id === existing.id ? patched : e)) };
      return success({ entity: patched }, ['terrain.modified'], true);
    }
    const entity = newEntity(
      ctx.doc,
      { kind: 'TERRAIN', name: `Terrain patch (${args.operation.toLowerCase()})`, transform: transformAt(center.x, center.y, center.z), metadata: { ops: [op] } },
      ctx.user.userId,
    );
    ctx.doc = { ...ctx.doc, entities: [...ctx.doc.entities, entity] };
    return success({ entity }, ['terrain.modified'], true);
  },
};

const spawn_npc: ToolDefinition<'spawn_npc'> = {
  name: 'spawn_npc',
  description: AI_TOOL_DEFINITIONS.spawn_npc.description,
  permission: 'npc:write',
  roles: AI_TOOL_DEFINITIONS.spawn_npc.roles,
  mutatesDoc: true,
  validate: (ctx, args) => validatePlacementBounds(ctx.doc, args.placement),
  execute: (ctx, args) => {
    const anchor = resolveAnchorEntity(ctx.doc, args.placement);
    const spawned: WorldEntity[] = [];
    for (let i = 0; i < args.count; i++) {
      const position = resolvePlacement(ctx.doc, args.placement, { index: i, count: args.count });
      const entity = newEntity(
        ctx.doc,
        {
          kind: 'NPC',
          name: `${args.archetype} ${i + 1}`,
          parentId: anchor && args.placement?.relation === 'INSIDE' ? anchor.id : undefined,
          transform: transformAt(position.x, position.y, position.z),
          tags: [args.archetype, ...(args.faction ? [args.faction] : []), ...(args.archetype === 'enemy' || args.faction === 'infected' ? ['enemy'] : [])],
          behavior: { params: { archetype: args.archetype, faction: args.faction, state: args.behaviorState ?? 'IDLE', aggression: args.aggression ?? 0.3 } },
          ai: args.agentId || args.personalityId ? { agentId: args.agentId, personalityId: args.personalityId, memoryEnabled: true } : undefined,
        },
        ctx.user.userId,
      );
      spawned.push(entity);
    }
    ctx.doc = { ...ctx.doc, entities: [...ctx.doc.entities, ...spawned] };
    return success({ entities: spawned, count: spawned.length }, ['npc.spawned'], true);
  },
};

const create_quest: ToolDefinition<'create_quest'> = {
  name: 'create_quest',
  description: AI_TOOL_DEFINITIONS.create_quest.description,
  permission: 'mission:write',
  roles: AI_TOOL_DEFINITIONS.create_quest.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    if (args.targetEntity && !findEntity(ctx.doc, args.targetEntity)) return deny('VALIDATION', `Target entity "${args.targetEntity}" not found`);
    return ok;
  },
  execute: (ctx, args) => {
    const target = args.targetEntity ? findEntity(ctx.doc, args.targetEntity) : undefined;
    const mission: MissionDefinition = {
      id: randomUuid(),
      name: args.name,
      description: args.description,
      chainId: args.chainId,
      order: ctx.doc.missions.length,
      objectives: [
        {
          id: randomUuid(),
          type: args.objectiveType,
          targetEntityId: target?.id,
          count: args.count,
          timeLimitS: args.timeLimitS,
          description: args.description || `${args.objectiveType} objective for "${args.name}"`,
          conditions: [],
        },
      ],
      triggers: [],
      rewards: args.rewards,
      difficulty: args.difficulty,
      state: 'DRAFT',
    };
    ctx.doc = { ...ctx.doc, missions: [...ctx.doc.missions, mission] };
    return success({ mission }, ['quest.created'], true);
  },
};

const set_weather: ToolDefinition<'set_weather'> = {
  name: 'set_weather',
  description: AI_TOOL_DEFINITIONS.set_weather.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.set_weather.roles,
  mutatesDoc: true,
  validate: () => ok,
  execute: (ctx, args) => {
    ctx.doc = { ...ctx.doc, environment: { ...ctx.doc.environment, weather: args.weather, weatherIntensity: args.intensity } };
    return success({ weather: args.weather, intensity: args.intensity, transitionS: args.transitionS }, ['weather.changed'], true);
  },
};

const set_time_of_day: ToolDefinition<'set_time_of_day'> = {
  name: 'set_time_of_day',
  description: AI_TOOL_DEFINITIONS.set_time_of_day.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.set_time_of_day.roles,
  mutatesDoc: true,
  validate: () => ok,
  execute: (ctx, args) => {
    ctx.doc = { ...ctx.doc, environment: { ...ctx.doc.environment, timeOfDay: args.hour } };
    return success({ hour: args.hour, transitionS: args.transitionS }, ['time.changed'], true);
  },
};

const move_camera: ToolDefinition<'move_camera'> = {
  name: 'move_camera',
  description: AI_TOOL_DEFINITIONS.move_camera.description,
  permission: 'camera:write',
  roles: AI_TOOL_DEFINITIONS.move_camera.roles,
  mutatesDoc: false,
  validate: (ctx, args) => {
    if (args.targetEntity && !findEntity(ctx.doc, args.targetEntity)) return deny('VALIDATION', `Target entity "${args.targetEntity}" not found`);
    return ok;
  },
  execute: (ctx, args) => {
    const target = args.targetEntity ? findEntity(ctx.doc, args.targetEntity) : undefined;
    return success(
      { mode: args.mode, targetEntityId: target?.id, position: args.position, lookAt: args.lookAt, fov: args.fov, durationS: args.durationS },
      ['camera.moved'],
      false,
    );
  },
};

const create_camera_rig: ToolDefinition<'create_camera_rig'> = {
  name: 'create_camera_rig',
  description: AI_TOOL_DEFINITIONS.create_camera_rig.description,
  permission: 'camera:write',
  roles: AI_TOOL_DEFINITIONS.create_camera_rig.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    if (args.targetEntity && !findEntity(ctx.doc, args.targetEntity)) return deny('VALIDATION', `Target entity "${args.targetEntity}" not found`);
    return ok;
  },
  execute: (ctx, args) => {
    const target = args.targetEntity ? findEntity(ctx.doc, args.targetEntity) : undefined;
    const rig: CameraRig = { id: randomUuid(), name: args.name, mode: args.mode, targetEntityId: target?.id, keyframes: [], params: args.params };
    ctx.doc = { ...ctx.doc, cameras: [...ctx.doc.cameras, rig] };
    return success({ rig }, ['camera_rig.created'], true);
  },
};

const create_trigger: ToolDefinition<'create_trigger'> = {
  name: 'create_trigger',
  description: AI_TOOL_DEFINITIONS.create_trigger.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.create_trigger.roles,
  mutatesDoc: true,
  validate: () => ok,
  execute: (ctx, args) => {
    // WorldDocument has no top-level trigger list (Trigger only lives inside a MissionDefinition
    // per world-schema/schema.ts) — a standalone trigger is represented as a WorldEntity of kind
    // TRIGGER, since TRIGGER is a first-class EntityKind. entityId/actions/params are preserved
    // verbatim in metadata so a future mission can adopt this trigger by id.
    const anchor = args.entity ? findEntity(ctx.doc, args.entity) : undefined;
    const position = anchor?.transform.position ?? { x: 0, y: 0, z: 0 };
    const entity = newEntity(
      ctx.doc,
      {
        kind: 'TRIGGER',
        name: args.name,
        parentId: anchor?.id,
        transform: transformAt(position.x, position.y, position.z),
        behavior: { systemId: 'trigger', params: { kind: args.kind, event: args.event } },
        metadata: { triggerKind: args.kind, event: args.event, params: args.params, actions: args.actions, anchorEntityId: anchor?.id },
      },
      ctx.user.userId,
    );
    ctx.doc = { ...ctx.doc, entities: [...ctx.doc.entities, entity] };
    return success({ entity }, ['trigger.created'], true);
  },
};

const create_cinematic: ToolDefinition<'create_cinematic'> = {
  name: 'create_cinematic',
  description: AI_TOOL_DEFINITIONS.create_cinematic.description,
  permission: 'camera:write',
  roles: AI_TOOL_DEFINITIONS.create_cinematic.roles,
  mutatesDoc: true,
  validate: () => ok,
  execute: (ctx, args) => {
    const rigs: CameraRig[] = args.shots.map((shot, i) => {
      const target = shot.targetEntity ? findEntity(ctx.doc, shot.targetEntity) : args.subject ? findEntity(ctx.doc, args.subject) : undefined;
      return { id: randomUuid(), name: `${args.name} — shot ${i + 1}`, mode: shot.mode, targetEntityId: target?.id, keyframes: [], params: {} };
    });
    const sequence = {
      id: randomUuid(),
      name: args.name,
      shots: rigs.map((rig, i) => ({ rigId: rig.id, durationS: args.shots[i]?.durationS ?? 4, transition: args.shots[i]?.transition ?? 'CUT' })),
      grading: args.style,
    };
    const system: SystemRef = { id: sequence.id, name: `cinematic:${args.name}`, kind: 'CUSTOM', config: { cinematic: sequence }, enabled: true };
    ctx.doc = { ...ctx.doc, cameras: [...ctx.doc.cameras, ...rigs], systems: [...ctx.doc.systems, system] };
    return success({ sequence, rigs }, ['cinematic.created'], true);
  },
};

const set_layer_visibility: ToolDefinition<'set_layer_visibility'> = {
  name: 'set_layer_visibility',
  description: AI_TOOL_DEFINITIONS.set_layer_visibility.description,
  permission: 'world:write',
  roles: AI_TOOL_DEFINITIONS.set_layer_visibility.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    const layer = ctx.doc.layers.find((l) => l.kind === args.layer || l.id === args.layer || l.name === args.layer);
    return layer ? ok : deny('VALIDATION', `Layer "${args.layer}" not found`);
  },
  execute: (ctx, args) => {
    let changed: WorldDocument['layers'][number] | undefined;
    const layers = ctx.doc.layers.map((l) => {
      if (l.kind === args.layer || l.id === args.layer || l.name === args.layer) {
        changed = { ...l, visible: args.visible };
        return changed;
      }
      return l;
    });
    ctx.doc = { ...ctx.doc, layers };
    return success({ layer: changed }, ['layer.visibility_changed'], true);
  },
};

const track_entity: ToolDefinition<'track_entity'> = {
  name: 'track_entity',
  description: AI_TOOL_DEFINITIONS.track_entity.description,
  permission: 'world:read',
  roles: AI_TOOL_DEFINITIONS.track_entity.roles,
  mutatesDoc: false,
  validate: (ctx, args) => (findEntity(ctx.doc, args.entity) ? ok : deny('VALIDATION', `Entity "${args.entity}" not found`)),
  execute: (ctx, args) => {
    const entity = findEntity(ctx.doc, args.entity)!;
    return success({ entityId: entity.id, name: entity.name, cameraMode: args.cameraMode, highlight: args.highlight }, ['entity.tracked'], false);
  },
};

async function getOrCreateCreatorProfileId(app: FastifyInstance, userId: string): Promise<string> {
  const existing = await app.db.creatorProfile.findUnique({ where: { userId } });
  if (existing) return existing.id as string;
  const user = await app.db.user.findUnique({ where: { id: userId } });
  const created = await app.db.creatorProfile.create({
    data: {
      userId,
      handle: (user?.handle as string | undefined) ?? `creator-${userId.slice(0, 8)}`,
      displayName: (user?.displayName as string | undefined) ?? 'Creator',
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
  });
  return created.id as string;
}

const publish_asset: ToolDefinition<'publish_asset'> = {
  name: 'publish_asset',
  description: AI_TOOL_DEFINITIONS.publish_asset.description,
  permission: 'world:publish',
  roles: AI_TOOL_DEFINITIONS.publish_asset.roles,
  mutatesDoc: true,
  validate: (ctx, args) => {
    const dependencyLicenses: LicenseRecord[] = ctx.doc.dependencies.map((d) => d.license);
    const intent = {
      commercial: args.visibility === 'PUBLIC',
      multiplayer: true,
      redistribute: args.visibility === 'PUBLIC',
      modify: true,
    };
    const compat = checkLicenseCompatibility(dependencyLicenses, intent);
    if (compat.status === 'RED') return deny('LICENSE', `License check failed: ${compat.reasons.join('; ')}`);
    return ok;
  },
  execute: async (ctx, args) => {
    if (args.target === 'WORLD') {
      const world = await ctx.app.db.world.update({
        where: { id: ctx.world.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const doc = {
        ...ctx.doc,
        passport: {
          ...ctx.doc.passport,
          marketplaceHistory: [...ctx.doc.passport.marketplaceHistory, { productId: ctx.world.id, at: new Date().toISOString(), event: 'LISTED' as const }],
        },
      };
      ctx.doc = doc;
      return success({ worldId: world.id, status: world.status }, ['world.published'], true);
    }
    if (args.target === 'ASSET' && args.refId) {
      const asset = await ctx.app.db.asset.update({ where: { id: args.refId }, data: { status: 'PUBLISHED' } });
      return success({ assetId: asset.id, status: asset.status }, ['asset.published'], false);
    }
    // PRODUCT / GAME: create (or ensure) a marketplace Product row pointing at this world.
    const creatorId = await getOrCreateCreatorProfileId(ctx.app, ctx.user.userId);
    const slug = `${slugify(ctx.doc.name)}-${randomUuid().slice(0, 8)}`;
    const product = await ctx.app.db.product.create({
      data: {
        slug,
        name: ctx.doc.name,
        category: args.category ?? 'WORLD',
        genre: ctx.doc.genre,
        engines: ['WEB'],
        priceCents: args.priceCents ?? 0,
        currency: 'USD',
        description: ctx.doc.description,
        license: ctx.doc.passport.license,
        refKind: args.target === 'GAME' ? 'GAME' : 'WORLD',
        refId: args.refId ?? ctx.world.id,
        creatorId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    return success({ productId: product.id, slug: product.slug, status: product.status }, ['PRODUCT_LISTED'], false);
  },
};

const query_world: ToolDefinition<'query_world'> = {
  name: 'query_world',
  description: AI_TOOL_DEFINITIONS.query_world.description,
  permission: 'world:read',
  roles: AI_TOOL_DEFINITIONS.query_world.roles,
  mutatesDoc: false,
  validate: () => ok,
  execute: (ctx, args) => {
    let matches = ctx.doc.entities;
    if (args.kinds && args.kinds.length > 0) matches = matches.filter((e) => args.kinds!.includes(e.kind));
    if (args.near) {
      const center = resolvePlacement(ctx.doc, args.near);
      matches = matches.filter((e) => Math.hypot(e.transform.position.x - center.x, e.transform.position.y - center.y, e.transform.position.z - center.z) <= args.near!.radiusM);
    }
    const limited = matches.slice(0, args.limit);
    return success(
      { question: args.question, matchCount: matches.length, entities: limited.map((e) => ({ id: e.id, name: e.name, kind: e.kind, transform: e.transform, tags: e.tags })) },
      [],
      false,
    );
  },
};

const generate_asset: ToolDefinition<'generate_asset'> = {
  name: 'generate_asset',
  description: AI_TOOL_DEFINITIONS.generate_asset.description,
  permission: 'ai:generate',
  roles: AI_TOOL_DEFINITIONS.generate_asset.roles,
  mutatesDoc: true,
  validate: async (ctx, args) => {
    await ctx.app.quotas.assertAssetQuota(ctx.user.userId, ctx.user.tier);
    return validatePlacementBounds(ctx.doc, args.placement);
  },
  execute: async (ctx, args) => {
    const assetType = ({ MODEL: 'MODEL', TEXTURE: 'TEXTURE', AUDIO: 'AUDIO', CHARACTER: 'MODEL', VEHICLE: 'MODEL', ENVIRONMENT: 'MODEL', PROP: 'MODEL' } as const)[args.kind];
    const name = `${args.kind} — ${args.prompt}`.slice(0, 120);
    const slug = `${slugify(name)}-${randomUuid().slice(0, 8)}`;
    const asset = await ctx.app.db.asset.create({
      data: { creatorId: ctx.user.userId, orgId: ctx.user.orgId ?? null, name, slug, type: assetType, status: 'PROCESSING', description: args.prompt, tags: args.style ? [args.style] : [] },
    });
    let entity: WorldEntity | undefined;
    if (args.placement) {
      const position = resolvePlacement(ctx.doc, args.placement);
      entity = newEntity(
        ctx.doc,
        { kind: 'PROP', name, transform: transformAt(position.x, position.y, position.z), assetRef: { assetId: asset.id }, metadata: { generated: true, prompt: args.prompt } },
        ctx.user.userId,
      );
      ctx.doc = { ...ctx.doc, entities: [...ctx.doc.entities, entity] };
    }
    // Heavier/slower generation runs off the request thread (workers/ai-generation, queue
    // `ai.generate`) — this tool call's own AIExecution row (written by executeToolPlan around
    // this execute()) records the *request*; the worker writes its own AIExecution + AIUsage rows
    // and publishes AI_TOOL_EXECUTED again once generation actually finishes.
    await ctx.app.queues.aiGenerate.add('generate', {
      // 'worldless' is pipeline.ts's WORLDLESS_RECORD sentinel id, used when this tool runs with
      // no real world (e.g. from generate.ts's draft-only paths) — omit it rather than enqueue a
      // bogus worldId.
      worldId: ctx.world.id !== 'worldless' ? ctx.world.id : undefined,
      actorId: ctx.user.userId,
      orgId: ctx.user.orgId,
      tool: 'generate_asset',
      role: ctx.role,
      prompt: args.prompt,
      args: { assetId: asset.id, kind: args.kind, style: args.style, variants: args.variants },
    });
    return success({ assetId: asset.id, status: asset.status, variants: args.variants, entity }, ['asset.generation_queued'], Boolean(entity));
  },
};

const run_playtest: ToolDefinition<'run_playtest'> = {
  name: 'run_playtest',
  description: AI_TOOL_DEFINITIONS.run_playtest.description,
  permission: 'playtest:run',
  roles: AI_TOOL_DEFINITIONS.run_playtest.roles,
  mutatesDoc: false,
  validate: () => ok,
  execute: (ctx, args) => {
    // Deterministic synthetic playtest summary — a real bot-driven run belongs to a worker
    // (workers/ai-generation or a dedicated playtest worker), out of scope for this module; this
    // gives the QA agent a concrete, schema-shaped result to reason about today.
    const npcCount = ctx.doc.entities.filter((e) => e.kind === 'NPC').length;
    const completionRate = Math.max(0.1, Math.min(0.95, 0.6 + (10 - Math.min(10, npcCount)) * 0.02));
    return success(
      {
        bots: args.bots,
        durationS: args.durationS,
        scenario: args.scenario ?? 'freeform',
        missionId: args.missionId,
        results: { completionRate, avgDeaths: Math.round(npcCount * 0.15 * 10) / 10, crashes: 0, softlocks: 0 },
      },
      ['playtest.completed'],
      false,
    );
  },
};

const analyze_players: ToolDefinition<'analyze_players'> = {
  name: 'analyze_players',
  description: AI_TOOL_DEFINITIONS.analyze_players.description,
  permission: 'analytics:read',
  roles: AI_TOOL_DEFINITIONS.analyze_players.roles,
  mutatesDoc: false,
  validate: () => ok,
  execute: async (ctx, args) => {
    const since = new Date(Date.now() - args.windowDays * 24 * 60 * 60 * 1000);
    const events = (await ctx.app.db.analyticsEvent.findMany({ where: { createdAt: { gte: since } } })) as { type: string }[];
    return success({ metric: args.metric, windowDays: args.windowDays, segment: args.segment, sampleSize: events.length }, [], false);
  },
};

export const TOOLS: { [K in AIToolName]: ToolDefinition<K> } = {
  create_world,
  create_entity,
  modify_entity,
  delete_entity,
  modify_terrain,
  spawn_npc,
  create_quest,
  set_weather,
  set_time_of_day,
  move_camera,
  create_camera_rig,
  create_trigger,
  create_cinematic,
  set_layer_visibility,
  track_entity,
  publish_asset,
  query_world,
  generate_asset,
  run_playtest,
  analyze_players,
};

export function getTool<K extends AIToolName>(name: K): ToolDefinition<K> {
  return TOOLS[name];
}
