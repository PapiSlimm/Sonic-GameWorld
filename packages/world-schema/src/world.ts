import type { z } from 'zod';
import { randomUuid, vec3, WORLD_SCHEMA_VERSION, type Vec3 } from './primitives.js';
import type { Genre } from './enums.js';
import { LICENSE_PRESETS } from './license.js';
import {
  WorldDocumentSchema,
  type AssetPassport,
  type LayerKind,
  type LicenseRecord,
  type WorldDocument,
  type WorldEntity,
  type WorldLayer,
} from './schema.js';

export interface CreateEmptyWorldOptions {
  id?: string;
  name: string;
  description?: string;
  ownerId: string;
  genre?: Genre[];
  sizeKm2?: number;
  maxPlayers?: number;
  /** Half-extent in meters for bounds (default derived from sizeKm2). */
  halfExtentM?: number;
  license?: LicenseRecord;
  now?: Date;
  source?: AssetPassport['source'];
}

export const DEFAULT_LAYERS: { kind: LayerKind; name: string }[] = [
  { kind: 'TERRAIN', name: 'Terrain' },
  { kind: 'WATER', name: 'Water' },
  { kind: 'ROADS', name: 'Roads' },
  { kind: 'BUILDINGS', name: 'Buildings' },
  { kind: 'ENVIRONMENT', name: 'Environment' },
  { kind: 'ENTITIES', name: 'Entities' },
  { kind: 'NPCS', name: 'NPCs' },
  { kind: 'VEHICLES', name: 'Vehicles' },
  { kind: 'RTS_UNITS', name: 'RTS Units' },
  { kind: 'RTS_BUILDINGS', name: 'RTS Buildings' },
  { kind: 'MISSIONS', name: 'Missions' },
  { kind: 'TRIGGERS', name: 'Triggers' },
  { kind: 'CAMERAS', name: 'Cameras' },
  { kind: 'DETECTION', name: 'Detection' },
  { kind: 'SENSORS', name: 'Sensors' },
  { kind: 'HUD', name: 'HUD' },
];

export function createDefaultLayers(): WorldLayer[] {
  return DEFAULT_LAYERS.map((l, i) => ({
    id: `layer_${l.kind.toLowerCase()}`,
    name: l.name,
    kind: l.kind,
    visible: l.kind !== 'DETECTION' && l.kind !== 'SENSORS',
    locked: false,
    opacity: 1,
    order: i,
  }));
}

export function createEmptyWorld(opts: CreateEmptyWorldOptions): WorldDocument {
  const now = (opts.now ?? new Date()).toISOString();
  const id = opts.id ?? randomUuid();
  const sizeKm2 = opts.sizeKm2 ?? 1;
  const half = opts.halfExtentM ?? Math.max(50, (Math.sqrt(sizeKm2) * 1000) / 2);
  const doc: WorldDocument = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    id,
    name: opts.name,
    description: opts.description ?? '',
    genre: opts.genre ?? [],
    sizeKm2,
    maxPlayers: opts.maxPlayers ?? 16,
    bounds: { min: vec3(-half, -100, -half), max: vec3(half, 500, half) },
    layers: createDefaultLayers(),
    entities: [],
    environment: { timeOfDay: 12, weather: 'CLEAR', weatherIntensity: 0, gravity: -9.81 },
    missions: [],
    cameras: [],
    systems: [],
    dependencies: [],
    passport: {
      assetId: id,
      creatorId: opts.ownerId,
      createdAt: now,
      version: '1.0.0',
      source: opts.source ?? 'ORIGINAL',
      license: opts.license ?? LICENSE_PRESETS.STANDARD(`lic_${id}`),
      dependencies: [],
      modificationHistory: [{ at: now, by: opts.ownerId, note: 'World created' }],
      aiGenerated: false,
      aiAssisted: false,
      thirdPartyContent: false,
      marketplaceHistory: [],
    },
    createdAt: now,
    updatedAt: now,
  };
  return doc;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  /** Parsed & defaulted document when schema validation succeeded. */
  document?: WorldDocument;
}

function inBounds(p: Vec3, min: Vec3, max: Vec3): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

/**
 * Structural (zod) + semantic validation: unique ids, parent references, bounds, mission/camera references.
 * Bounds violations and dangling references are errors; empty spawns and orphan missions are warnings.
 */
export function validateWorld(input: unknown): ValidationResult {
  const parsed = WorldDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i: z.ZodIssue) => ({ path: i.path.join('.') || '<root>', message: i.message, severity: 'error' as const })),
    };
  }
  const doc = parsed.data;
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, WorldEntity>();
  doc.entities.forEach((e, idx) => {
    if (ids.has(e.id)) issues.push({ path: `entities.${idx}.id`, message: `duplicate entity id ${e.id}`, severity: 'error' });
    ids.set(e.id, e);
  });
  doc.entities.forEach((e, idx) => {
    if (e.parentId && !ids.has(e.parentId)) {
      issues.push({ path: `entities.${idx}.parentId`, message: `parent ${e.parentId} does not exist`, severity: 'error' });
    }
    if (e.parentId === e.id) issues.push({ path: `entities.${idx}.parentId`, message: 'entity cannot be its own parent', severity: 'error' });
    if (!inBounds(e.transform.position, doc.bounds.min, doc.bounds.max)) {
      issues.push({ path: `entities.${idx}.transform.position`, message: `entity "${e.name}" is outside world bounds`, severity: 'error' });
    }
    const s = e.transform.scale;
    if (s.x === 0 || s.y === 0 || s.z === 0) {
      issues.push({ path: `entities.${idx}.transform.scale`, message: `entity "${e.name}" has a zero scale component`, severity: 'warning' });
    }
  });
  // cycle detection in parent chain
  for (const e of doc.entities) {
    const seen = new Set<string>();
    let cur: WorldEntity | undefined = e;
    while (cur?.parentId) {
      if (seen.has(cur.id)) {
        issues.push({ path: `entities`, message: `parent cycle involving ${e.name}`, severity: 'error' });
        break;
      }
      seen.add(cur.id);
      cur = ids.get(cur.parentId);
    }
  }
  const layerIds = new Set<string>();
  doc.layers.forEach((l, idx) => {
    if (layerIds.has(l.id)) issues.push({ path: `layers.${idx}.id`, message: `duplicate layer id ${l.id}`, severity: 'error' });
    layerIds.add(l.id);
  });
  const missionIds = new Set<string>();
  doc.missions.forEach((m, mi) => {
    if (missionIds.has(m.id)) issues.push({ path: `missions.${mi}.id`, message: `duplicate mission id ${m.id}`, severity: 'error' });
    missionIds.add(m.id);
    if (m.objectives.length === 0) issues.push({ path: `missions.${mi}.objectives`, message: `mission "${m.name}" has no objectives`, severity: 'warning' });
    m.objectives.forEach((o, oi) => {
      if (o.targetEntityId && !ids.has(o.targetEntityId)) {
        issues.push({ path: `missions.${mi}.objectives.${oi}.targetEntityId`, message: `objective targets missing entity ${o.targetEntityId}`, severity: 'error' });
      }
    });
    m.triggers.forEach((t, ti) => {
      if (t.entityId && !ids.has(t.entityId)) {
        issues.push({ path: `missions.${mi}.triggers.${ti}.entityId`, message: `trigger references missing entity ${t.entityId}`, severity: 'error' });
      }
    });
  });
  doc.cameras.forEach((c, ci) => {
    if (c.targetEntityId && !ids.has(c.targetEntityId)) {
      issues.push({ path: `cameras.${ci}.targetEntityId`, message: `camera rig "${c.name}" targets missing entity`, severity: 'error' });
    }
  });
  if (!doc.entities.some((e) => e.kind === 'PLAYER_SPAWN')) {
    issues.push({ path: 'entities', message: 'world has no PLAYER_SPAWN entity', severity: 'warning' });
  }
  if (doc.bounds.min.x >= doc.bounds.max.x || doc.bounds.min.z >= doc.bounds.max.z || doc.bounds.min.y >= doc.bounds.max.y) {
    issues.push({ path: 'bounds', message: 'bounds.min must be strictly less than bounds.max', severity: 'error' });
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues, document: doc };
}

/** Parse + throw on failure (typed helper for APIs). */
export function parseWorld(input: unknown): WorldDocument {
  const r = validateWorld(input);
  if (!r.ok || !r.document) {
    throw new Error(`Invalid world document: ${r.issues.filter((i) => i.severity === 'error').map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  }
  return r.document;
}

// ---- Graph helpers ----
export function childrenOf(doc: WorldDocument, parentId: string | undefined): WorldEntity[] {
  return doc.entities.filter((e) => e.parentId === parentId);
}

export function findEntity(doc: WorldDocument, idOrName: string): WorldEntity | undefined {
  const byId = doc.entities.find((e) => e.id === idOrName);
  if (byId) return byId;
  const needle = idOrName.trim().toLowerCase();
  return doc.entities.find((e) => e.name.toLowerCase() === needle) ?? doc.entities.find((e) => e.name.toLowerCase().includes(needle));
}

export function ancestorsOf(doc: WorldDocument, entityId: string): WorldEntity[] {
  const map = new Map(doc.entities.map((e) => [e.id, e]));
  const out: WorldEntity[] = [];
  let cur = map.get(entityId);
  const guard = new Set<string>();
  while (cur?.parentId && !guard.has(cur.id)) {
    guard.add(cur.id);
    const p = map.get(cur.parentId);
    if (!p) break;
    out.push(p);
    cur = p;
  }
  return out;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function entitiesNear(doc: WorldDocument, point: Vec3, radiusM: number, kinds?: WorldEntity['kind'][]): WorldEntity[] {
  return doc.entities.filter((e) => (!kinds || kinds.includes(e.kind)) && distance(e.transform.position, point) <= radiusM);
}

export function countByKind(doc: WorldDocument): Record<WorldEntity['kind'], number> {
  const out = {} as Record<WorldEntity['kind'], number>;
  for (const e of doc.entities) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}

export function touchWorld(doc: WorldDocument, by: string, note: string, now = new Date()): WorldDocument {
  const at = now.toISOString();
  return {
    ...doc,
    updatedAt: at,
    passport: { ...doc.passport, modificationHistory: [...doc.passport.modificationHistory, { at, by, note }] },
  };
}
