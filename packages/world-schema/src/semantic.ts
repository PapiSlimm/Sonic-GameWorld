import type { Vec3 } from './primitives.js';
import type { EntityKind, WorldDocument, WorldEntity } from './schema.js';
import { distance } from './world.js';

export interface SemanticOptions {
  /** Max entities to describe per kind (default 12). */
  maxPerKind?: number;
  /** Include mission summaries (default true). */
  includeMissions?: boolean;
  /** Include camera rigs (default true). */
  includeCameras?: boolean;
  /** Reference position for "outside/inside/near" phrasing. */
  focus?: Vec3;
}

const KIND_LABELS: Record<EntityKind, [string, string]> = {
  REGION: ['region', 'regions'],
  ZONE: ['zone', 'zones'],
  BUILDING: ['building', 'buildings'],
  ROOM: ['room', 'rooms'],
  NPC: ['NPC', 'NPCs'],
  PLAYER_SPAWN: ['player spawn', 'player spawns'],
  ITEM: ['item', 'items'],
  VEHICLE: ['vehicle', 'vehicles'],
  TRIGGER: ['trigger', 'triggers'],
  CAMERA: ['camera', 'cameras'],
  LIGHT: ['light', 'lights'],
  PROP: ['prop', 'props'],
  TERRAIN: ['terrain patch', 'terrain patches'],
  WATER: ['water body', 'water bodies'],
  ROAD: ['road', 'roads'],
  VOLUME: ['volume', 'volumes'],
  GROUP: ['group', 'groups'],
  RTS_UNIT: ['RTS unit', 'RTS units'],
  RTS_BUILDING: ['RTS building', 'RTS buildings'],
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export function compassDirection(from: Vec3, to: Vec3): string {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 'at the same position as';
  // Convention: +z = north, +x = east
  const angle = (Math.atan2(dx, dz) * 180) / Math.PI; // 0 = north, 90 = east
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const idx = Math.round(((angle + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'north';
}

function fmtPos(p: Vec3): string {
  return `(${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)})`;
}

function isInside(doc: WorldDocument, e: WorldEntity, container: WorldEntity): boolean {
  let cur: WorldEntity | undefined = e;
  const byId = new Map(doc.entities.map((x) => [x.id, x]));
  let guard = 0;
  while (cur?.parentId && guard++ < 64) {
    if (cur.parentId === container.id) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

function describeEntity(doc: WorldDocument, e: WorldEntity, byId: Map<string, WorldEntity>, containers: WorldEntity[]): string {
  const parent = e.parentId ? byId.get(e.parentId) : undefined;
  const parts: string[] = [];
  const label = KIND_LABELS[e.kind][0];
  parts.push(`${e.name} (${label})`);
  if (parent && (parent.kind === 'BUILDING' || parent.kind === 'ROOM' || parent.kind === 'ZONE' || parent.kind === 'REGION')) {
    parts.push(`is inside ${parent.name}`);
  } else {
    const nearest = containers
      .filter((c) => c.id !== e.id && (c.kind === 'BUILDING' || c.kind === 'ZONE'))
      .map((c) => ({ c, d: distance(c.transform.position, e.transform.position) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d < 250) {
      const dir = compassDirection(nearest.c.transform.position, e.transform.position);
      parts.push(`is ${Math.round(nearest.d)}m ${dir} of ${nearest.c.name}`);
    } else {
      parts.push(`is at ${fmtPos(e.transform.position)}`);
    }
  }
  const extras: string[] = [];
  if (e.behavior?.params) {
    const st = e.behavior.params['state'];
    const faction = e.behavior.params['faction'];
    if (typeof st === 'string') extras.push(`state ${st}`);
    if (typeof faction === 'string') extras.push(`faction ${faction}`);
  }
  if (e.ai?.agentId) extras.push('AI-driven');
  if (e.tags.length) extras.push(`tags: ${e.tags.slice(0, 4).join(', ')}`);
  if (extras.length) parts.push(`[${extras.join('; ')}]`);
  return parts.join(' ');
}

/**
 * Produce the AI-context narration for a world:
 * "There are three enemies inside Building 7, Player 12 is outside the northern entrance..."
 */
export function sceneGraphToSemantic(doc: WorldDocument, opts: SemanticOptions = {}): string {
  const maxPerKind = opts.maxPerKind ?? 12;
  const byId = new Map(doc.entities.map((e) => [e.id, e]));
  const lines: string[] = [];

  const env = doc.environment;
  const hour = Math.floor(env.timeOfDay);
  const minute = Math.round((env.timeOfDay - hour) * 60);
  const clock = `${String(hour % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const phase = env.timeOfDay < 5 || env.timeOfDay >= 21 ? 'night' : env.timeOfDay < 8 ? 'dawn' : env.timeOfDay < 17 ? 'daytime' : 'dusk';
  lines.push(
    `World "${doc.name}" (${doc.genre.join('/') || 'unclassified'}, ${doc.sizeKm2} km², up to ${doc.maxPlayers} players). ` +
      `It is ${clock} (${phase}); weather is ${env.weather.toLowerCase()}${env.weatherIntensity > 0 ? ` at ${Math.round(env.weatherIntensity * 100)}% intensity` : ''}.`,
  );

  const counts = new Map<EntityKind, WorldEntity[]>();
  for (const e of doc.entities) {
    const arr = counts.get(e.kind) ?? [];
    arr.push(e);
    counts.set(e.kind, arr);
  }
  const summary = Array.from(counts.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, arr]) => `${numberWord(arr.length)} ${arr.length === 1 ? KIND_LABELS[k][0] : KIND_LABELS[k][1]}`);
  if (summary.length) lines.push(`The world contains ${summary.join(', ')}.`);

  // Structure: regions → zones → buildings
  const regions = counts.get('REGION') ?? [];
  for (const r of regions) {
    const zones = doc.entities.filter((e) => e.parentId === r.id && e.kind === 'ZONE');
    const buildings = doc.entities.filter((e) => e.kind === 'BUILDING' && isInside(doc, e, r));
    lines.push(
      `Region ${r.name}: ${zones.length ? `zones ${zones.map((z) => z.name).join(', ')}` : 'no zones'}; ${buildings.length} building(s)${buildings.length ? ` (${buildings.slice(0, 6).map((b) => b.name).join(', ')}${buildings.length > 6 ? ', …' : ''})` : ''}.`,
    );
  }

  // Occupancy: what is inside each building
  const containers = doc.entities.filter((e) => e.kind === 'BUILDING' || e.kind === 'ZONE' || e.kind === 'ROOM');
  for (const b of doc.entities.filter((e) => e.kind === 'BUILDING')) {
    const inside = doc.entities.filter((e) => e.id !== b.id && isInside(doc, e, b) && e.kind !== 'ROOM');
    if (!inside.length) continue;
    const hostile = inside.filter((e) => e.kind === 'NPC' && (e.tags.includes('enemy') || e.tags.includes('hostile')));
    const friendly = inside.filter((e) => e.kind === 'NPC' && !hostile.includes(e));
    const bits: string[] = [];
    if (hostile.length) bits.push(`${numberWord(hostile.length)} ${hostile.length === 1 ? 'enemy' : 'enemies'}`);
    if (friendly.length) bits.push(`${numberWord(friendly.length)} friendly ${friendly.length === 1 ? 'NPC' : 'NPCs'}`);
    const others = inside.filter((e) => e.kind !== 'NPC');
    if (others.length) bits.push(`${numberWord(others.length)} other ${others.length === 1 ? 'entity' : 'entities'} (${others.slice(0, 4).map((o) => o.name).join(', ')})`);
    lines.push(`There ${hostile.length + friendly.length + others.length === 1 ? 'is' : 'are'} ${bits.join(' and ')} inside ${b.name}.`);
  }

  // Player spawns and notable entities relative to buildings
  const spawns = counts.get('PLAYER_SPAWN') ?? [];
  for (const s of spawns.slice(0, maxPerKind)) {
    const nearest = containers
      .filter((c) => c.kind === 'BUILDING')
      .map((c) => ({ c, d: distance(c.transform.position, s.transform.position) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest) {
      lines.push(`${s.name} is outside the ${compassDirection(nearest.c.transform.position, s.transform.position)} side of ${nearest.c.name}, ${Math.round(nearest.d)}m away.`);
    } else {
      lines.push(`${s.name} is at ${fmtPos(s.transform.position)}.`);
    }
  }

  const detailKinds: EntityKind[] = ['NPC', 'VEHICLE', 'ITEM', 'TRIGGER', 'CAMERA', 'PROP', 'LIGHT', 'VOLUME'];
  for (const k of detailKinds) {
    const arr = (counts.get(k) ?? []).filter((e) => !(k === 'NPC' && e.parentId && byId.get(e.parentId)?.kind === 'BUILDING'));
    if (!arr.length) continue;
    const shown = arr.slice(0, maxPerKind);
    lines.push(`${KIND_LABELS[k][1].charAt(0).toUpperCase() + KIND_LABELS[k][1].slice(1)}: ${shown.map((e) => describeEntity(doc, e, byId, containers)).join('; ')}${arr.length > shown.length ? `; and ${arr.length - shown.length} more` : ''}.`);
  }

  if (opts.includeMissions !== false && doc.missions.length) {
    lines.push(
      `Missions: ${doc.missions
        .map((m) => `"${m.name}" (${m.state.toLowerCase()}, difficulty ${m.difficulty}/10, ${m.objectives.length} objective${m.objectives.length === 1 ? '' : 's'}${m.objectives[0] ? `: ${m.objectives[0].description}` : ''})`)
        .join('; ')}.`,
    );
  }
  if (opts.includeCameras !== false && doc.cameras.length) {
    lines.push(`Camera rigs: ${doc.cameras.map((c) => `${c.name} [${c.mode}${c.targetEntityId ? ` → ${byId.get(c.targetEntityId)?.name ?? c.targetEntityId}` : ''}]`).join(', ')}.`);
  }
  const hiddenLayers = doc.layers.filter((l) => !l.visible).map((l) => l.name);
  if (hiddenLayers.length) lines.push(`Hidden layers: ${hiddenLayers.join(', ')}.`);
  return lines.join('\n');
}
