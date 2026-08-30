import { describe, expect, it } from 'vitest';
import {
  AI_TOOL_SCHEMAS,
  AI_TOOL_NAMES,
  CAMERA_MODES,
  CameraModeSchema,
  CameraRigSchema,
  checkLicenseCompatibility,
  createEmptyWorld,
  createSampleWorld,
  diffWorlds,
  ENTITY_KINDS,
  EntityKindSchema,
  LAYER_KINDS,
  LayerKindSchema,
  LICENSE_PRESETS,
  NEON_TOKYO_ENTITY_KEYS,
  PLAN,
  sceneGraphToSemantic,
  splitRevenueCents,
  transformAt,
  validateToolCall,
  validateWorld,
  WORLD_SCHEMA_VERSION,
  WorldDocumentSchema,
  WorldEntitySchema,
  seededUuid,
  findEntity,
  applyEntityDiff,
} from './index.js';

describe('world validation', () => {
  it('creates a valid empty world', () => {
    const w = createEmptyWorld({ name: 'Test', ownerId: 'u1' });
    expect(w.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    const r = validateWorld(w);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.message.includes('PLAYER_SPAWN'))).toBe(true); // warning only
    expect(WorldDocumentSchema.safeParse(w).success).toBe(true);
  });

  it('rejects malformed documents', () => {
    const r = validateWorld({ id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('flags dangling parents and out-of-bounds entities', () => {
    const w = createSampleWorld('NEON_TOKYO_2099');
    const bad = structuredClone(w);
    bad.entities[0]!.parentId = 'missing';
    bad.entities[1]!.transform.position.x = 99999;
    const r = validateWorld(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.message).join('\n')).toMatch(/parent missing does not exist/);
    expect(r.issues.map((i) => i.message).join('\n')).toMatch(/outside world bounds/);
  });

  it('sample world is rich and valid', () => {
    const w = createSampleWorld('NEON_TOKYO_2099');
    expect(w.entities.length).toBeGreaterThanOrEqual(40);
    expect(w.missions).toHaveLength(3);
    expect(validateWorld(w).ok).toBe(true);
    const kinds = new Set(w.entities.map((e) => e.kind));
    for (const k of ['REGION', 'ZONE', 'BUILDING', 'ROOM', 'NPC', 'VEHICLE', 'TRIGGER', 'CAMERA', 'PLAYER_SPAWN']) expect(kinds.has(k as never)).toBe(true);
    // deterministic ids
    expect(createSampleWorld('NEON_TOKYO_2099').id).toBe(w.id);
    expect(findEntity(w, 'Building 7')?.id).toBe(NEON_TOKYO_ENTITY_KEYS.building7);
  });

  it('seededUuid produces uuid-shaped stable ids', () => {
    const a = seededUuid('abc');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(seededUuid('abc')).toBe(a);
    expect(seededUuid('abd')).not.toBe(a);
  });
});

describe('license compatibility engine', () => {
  it('GREEN when everything permitted', () => {
    const r = checkLicenseCompatibility([LICENSE_PRESETS.CC0()], { commercial: true, multiplayer: true, redistribute: true, modify: true });
    expect(r.status).toBe('GREEN');
  });
  it('YELLOW for attribution / unspecified multiplayer', () => {
    const r = checkLicenseCompatibility([LICENSE_PRESETS.CC_BY()], { commercial: true, multiplayer: true, redistribute: true, modify: true });
    expect(r.status).toBe('YELLOW');
    expect(r.reasons.join(' ')).toMatch(/attribution/i);
    const r2 = checkLicenseCompatibility([LICENSE_PRESETS.STANDARD()], { commercial: true, multiplayer: true, redistribute: false, modify: true });
    expect(r2.status).toBe('GREEN');
  });
  it('RED when commercial use forbidden', () => {
    const r = checkLicenseCompatibility([LICENSE_PRESETS.PERSONAL(), LICENSE_PRESETS.CC0()], { commercial: true, multiplayer: false, redistribute: false, modify: false });
    expect(r.status).toBe('RED');
    expect(r.reasons.some((x) => /commercial use is not permitted/.test(x))).toBe(true);
    expect(r.details).toHaveLength(2);
    expect(r.details[1]?.status).toBe('GREEN');
  });
  it('RED when redistribution forbidden', () => {
    const r = checkLicenseCompatibility([LICENSE_PRESETS.STANDARD()], { commercial: true, multiplayer: false, redistribute: true, modify: false });
    expect(r.status).toBe('RED');
  });
});

describe('semantic text', () => {
  it('narrates the scene graph', () => {
    const w = createSampleWorld('NEON_TOKYO_2099');
    const text = sceneGraphToSemantic(w);
    expect(text).toContain('Neon Tokyo 2099');
    expect(text).toMatch(/inside Building 7/);
    expect(text).toMatch(/enem/);
    expect(text).toMatch(/Player Spawn \(Station\) is outside the/);
    expect(text).toMatch(/Missions:/);
    expect(text).toMatch(/rain/);
  });
});

describe('diff', () => {
  it('detects adds, removes and modifications', () => {
    const a = createSampleWorld('NEON_TOKYO_2099');
    const b = structuredClone(a);
    b.entities = b.entities.filter((e) => e.id !== NEON_TOKYO_ENTITY_KEYS.drone);
    const boss = b.entities.find((e) => e.id === NEON_TOKYO_ENTITY_KEYS.boss)!;
    boss.transform.position.y = 151;
    b.entities.push({ ...a.entities[0]!, id: seededUuid('new'), name: 'New Thing', parentId: undefined });
    b.environment.weather = 'STORM';
    const d = diffWorlds(a, b);
    expect(d.empty).toBe(false);
    expect(d.entities.added).toHaveLength(1);
    expect(d.entities.removed[0]?.id).toBe(NEON_TOKYO_ENTITY_KEYS.drone);
    expect(d.entities.modified[0]?.changes[0]?.path).toBe('transform.position.y');
    expect(d.environment[0]?.after).toBe('STORM');
    expect(d.summary).toMatch(/entities \+1 -1 ~1/);
    expect(diffWorlds(a, a).empty).toBe(true);
    const applied = applyEntityDiff(a, d);
    expect(applied.entities.find((e) => e.id === NEON_TOKYO_ENTITY_KEYS.boss)?.transform.position.y).toBe(151);
    expect(applied.entities.some((e) => e.id === NEON_TOKYO_ENTITY_KEYS.drone)).toBe(false);
  });
});

describe('plans and tools', () => {
  it('PLAN table matches contract', () => {
    expect(PLAN.STARTER.feePct).toBe(20);
    expect(PLAN.PRO.projects).toBe(-1);
    expect(splitRevenueCents(1000, 'CREATOR')).toEqual({ feeCents: 150, creatorCents: 850, feePct: 15 });
  });
  it('every tool has a schema and validates', () => {
    for (const t of AI_TOOL_NAMES) expect(AI_TOOL_SCHEMAS[t]).toBeDefined();
    expect(validateToolCall({ tool: 'spawn_npc', args: { archetype: 'zombie', count: 3 } }).ok).toBe(true);
    const bad = validateToolCall({ tool: 'set_time_of_day', args: { hour: 30 } });
    expect(bad.ok).toBe(false);
  });
});

describe('RTS game template additions (docs/RTS-CONTRACTS.md §6)', () => {
  it('CameraModeSchema/CAMERA_MODES accept the new RTS strategic camera mode', () => {
    expect(CAMERA_MODES).toContain('RTS');
    expect(CameraModeSchema.safeParse('RTS').success).toBe(true);
  });

  it('EntityKindSchema/ENTITY_KINDS accept RTS_UNIT and RTS_BUILDING', () => {
    expect(ENTITY_KINDS).toContain('RTS_UNIT');
    expect(ENTITY_KINDS).toContain('RTS_BUILDING');
    expect(EntityKindSchema.safeParse('RTS_UNIT').success).toBe(true);
    expect(EntityKindSchema.safeParse('RTS_BUILDING').success).toBe(true);
  });

  it('LayerKindSchema/LAYER_KINDS accept the dedicated RTS_UNITS/RTS_BUILDINGS layers', () => {
    expect(LAYER_KINDS).toContain('RTS_UNITS');
    expect(LAYER_KINDS).toContain('RTS_BUILDINGS');
    expect(LayerKindSchema.safeParse('RTS_UNITS').success).toBe(true);
    expect(LayerKindSchema.safeParse('RTS_BUILDINGS').success).toBe(true);
  });

  it('a full WorldEntity of kind RTS_UNIT/RTS_BUILDING round-trips through the schema', () => {
    const base = {
      id: seededUuid('rts-unit-1'),
      name: 'Rifleman',
      transform: transformAt(10, 0, 20),
      tags: ['faction:raven-alliance'],
      permissions: { ownerId: 'usr_1', editors: [], visibility: 'PRIVATE' as const },
      metadata: { unitClass: 'INFANTRY' },
    };
    expect(WorldEntitySchema.safeParse({ ...base, kind: 'RTS_UNIT' }).success).toBe(true);
    expect(WorldEntitySchema.safeParse({ ...base, id: seededUuid('rts-bldg-1'), kind: 'RTS_BUILDING' }).success).toBe(true);
  });

  it('a CameraRig in mode RTS validates', () => {
    expect(CameraRigSchema.safeParse({ id: 'rig_1', name: 'Strategic overview', mode: 'RTS', keyframes: [], params: { distance: 150 } }).success).toBe(true);
  });

  it('createEmptyWorld ships RTS Units/RTS Buildings as toggleable default layers', () => {
    const w = createEmptyWorld({ name: 'RTS Map', ownerId: 'u1' });
    expect(w.layers.find((l) => l.kind === 'RTS_UNITS')).toBeDefined();
    expect(w.layers.find((l) => l.kind === 'RTS_BUILDINGS')).toBeDefined();
    expect(w.layers.find((l) => l.kind === 'RTS_UNITS')?.visible).toBe(true);
  });

  it('sceneGraphToSemantic narrates RTS_UNIT/RTS_BUILDING entities without throwing', () => {
    const w = createEmptyWorld({ name: 'RTS Map', ownerId: 'u1' });
    w.entities.push({
      id: seededUuid('rts-unit-narrate'),
      kind: 'RTS_UNIT',
      name: 'Rifleman Squad',
      transform: transformAt(5, 0, 5),
      tags: [],
      permissions: { ownerId: 'u1', editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    const text = sceneGraphToSemantic(w);
    expect(text).toContain('RTS Map');
    expect(() => sceneGraphToSemantic(w)).not.toThrow();
  });
});
