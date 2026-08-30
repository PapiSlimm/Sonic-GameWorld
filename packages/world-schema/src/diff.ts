import type { CameraRig, MissionDefinition, WorldDocument, WorldEntity, WorldLayer } from './schema.js';

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface EntityDiff {
  id: string;
  name: string;
  changes: FieldChange[];
}

export interface WorldDiff {
  entities: { added: WorldEntity[]; removed: WorldEntity[]; modified: EntityDiff[] };
  layers: { added: WorldLayer[]; removed: WorldLayer[]; modified: EntityDiff[] };
  missions: { added: MissionDefinition[]; removed: MissionDefinition[]; modified: EntityDiff[] };
  cameras: { added: CameraRig[]; removed: CameraRig[]; modified: EntityDiff[] };
  environment: FieldChange[];
  meta: FieldChange[];
  /** True when nothing differs. */
  empty: boolean;
  summary: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** Flatten differing leaf paths between two objects. */
export function diffObjects(a: unknown, b: unknown, prefix = ''): FieldChange[] {
  if (deepEqual(a, b)) return [];
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: FieldChange[] = [];
    for (const k of keys) out.push(...diffObjects(a[k], b[k], prefix ? `${prefix}.${k}` : k));
    return out;
  }
  return [{ path: prefix || '<root>', before: a, after: b }];
}

function diffCollection<T extends { id: string; name?: string }>(a: T[], b: T[]): { added: T[]; removed: T[]; modified: EntityDiff[] } {
  const am = new Map(a.map((x) => [x.id, x]));
  const bm = new Map(b.map((x) => [x.id, x]));
  const added = b.filter((x) => !am.has(x.id));
  const removed = a.filter((x) => !bm.has(x.id));
  const modified: EntityDiff[] = [];
  for (const [id, before] of am) {
    const after = bm.get(id);
    if (!after) continue;
    const changes = diffObjects(before, after);
    if (changes.length) modified.push({ id, name: after.name ?? before.name ?? id, changes });
  }
  return { added, removed, modified };
}

export function diffWorlds(a: WorldDocument, b: WorldDocument): WorldDiff {
  const entities = diffCollection(a.entities, b.entities);
  const layers = diffCollection(a.layers, b.layers);
  const missions = diffCollection(a.missions, b.missions);
  const cameras = diffCollection(a.cameras, b.cameras);
  const environment = diffObjects(a.environment, b.environment, 'environment');
  const metaKeys = ['name', 'description', 'genre', 'sizeKm2', 'maxPlayers', 'bounds', 'origin', 'systems', 'dependencies'] as const;
  const meta: FieldChange[] = [];
  for (const k of metaKeys) meta.push(...diffObjects(a[k], b[k], k));

  const parts: string[] = [];
  const sect = (label: string, c: { added: unknown[]; removed: unknown[]; modified: unknown[] }) => {
    const bits: string[] = [];
    if (c.added.length) bits.push(`+${c.added.length}`);
    if (c.removed.length) bits.push(`-${c.removed.length}`);
    if (c.modified.length) bits.push(`~${c.modified.length}`);
    if (bits.length) parts.push(`${label} ${bits.join(' ')}`);
  };
  sect('entities', entities);
  sect('layers', layers);
  sect('missions', missions);
  sect('cameras', cameras);
  if (environment.length) parts.push(`environment ~${environment.length}`);
  if (meta.length) parts.push(`meta ~${meta.length}`);
  const empty = parts.length === 0;
  return { entities, layers, missions, cameras, environment, meta, empty, summary: empty ? 'no changes' : parts.join(', ') };
}

/** Apply the entity portion of a diff onto a document (used for snapshots/undo). */
export function applyEntityDiff(doc: WorldDocument, diff: WorldDiff): WorldDocument {
  const removedIds = new Set(diff.entities.removed.map((e) => e.id));
  let entities = doc.entities.filter((e) => !removedIds.has(e.id));
  const modMap = new Map(diff.entities.modified.map((m) => [m.id, m]));
  entities = entities.map((e) => {
    const m = modMap.get(e.id);
    if (!m) return e;
    const clone = structuredClone(e) as unknown as Record<string, unknown>;
    for (const c of m.changes) setPath(clone, c.path, c.after);
    return clone as unknown as WorldEntity;
  });
  entities.push(...diff.entities.added);
  return { ...doc, entities };
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i] as string;
    const next = cur[k];
    if (!isObj(next)) {
      const created: Record<string, unknown> = {};
      cur[k] = created;
      cur = created;
    } else {
      cur = next;
    }
  }
  const last = keys[keys.length - 1] as string;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}
