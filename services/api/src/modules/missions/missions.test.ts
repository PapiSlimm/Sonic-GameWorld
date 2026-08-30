import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyWorld, MissionDefinitionSchema } from '@sonic-gameworld/world-schema';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';
import { generateMissionDefinition } from './generator.js';

describe('missions: generator', () => {
  it('produces a valid MissionDefinition even for an empty world', () => {
    const doc = createEmptyWorld({ name: 'Empty World', ownerId: 'u1' });
    const mission = generateMissionDefinition(doc, { prompt: 'survive the night' });
    expect(MissionDefinitionSchema.safeParse(mission).success).toBe(true);
    expect(mission.objectives.length).toBeGreaterThan(0);
    expect(mission.triggers.length).toBeGreaterThan(0);
    expect(mission.rewards.length).toBeGreaterThan(0);
    expect(mission.difficulty).toBeGreaterThanOrEqual(1);
    expect(mission.difficulty).toBeLessThanOrEqual(10);
  });

  it('references a real world entity when a matching one exists', () => {
    const doc = createEmptyWorld({ name: 'Populated World', ownerId: 'u1' });
    const enemy = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'NPC' as const,
      name: 'Bandit Chief',
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
      tags: ['enemy'],
      permissions: { ownerId: 'u1', editors: [], visibility: 'PRIVATE' as const },
      metadata: {},
    };
    const withEnemy = { ...doc, entities: [enemy] };
    const mission = generateMissionDefinition(withEnemy, { prompt: 'kill the bandit chief', difficulty: 7 });
    expect(mission.objectives[0]?.type).toBe('KILL');
    expect(mission.objectives[0]?.targetEntityId).toBe(enemy.id);
    expect(mission.difficulty).toBe(7);
  });

  it('is deterministic for the same world + prompt + chain/order', () => {
    const doc = createEmptyWorld({ name: 'Det World', ownerId: 'u1' });
    const a = generateMissionDefinition(doc, { prompt: 'collect the artifacts', chainId: 'c1', order: 0 });
    const b = generateMissionDefinition(doc, { prompt: 'collect the artifacts', chainId: 'c1', order: 0 });
    expect(a.name).toBe(b.name);
    expect(a.objectives[0]?.type).toBe(b.objectives[0]?.type);
    expect(a.difficulty).toBe(b.difficulty);
  });
});

describe('missions: routes', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('creates a mission manually and lists it', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'quest-owner@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Quest World' } })).json();

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/missions',
      headers: auth,
      payload: {
        worldId: world.id,
        name: 'Clear the Cellar',
        difficulty: 3,
        objectives: [{ type: 'COLLECT', description: 'Collect 3 crates', count: 3 }],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const mission = createRes.json();
    expect(mission.definition.objectives[0].type).toBe('COLLECT');

    const listRes = await ctx.app.inject({ method: 'GET', url: `/v1/missions?worldId=${world.id}`, headers: auth });
    expect(listRes.json().items).toHaveLength(1);
  });

  it('generate produces a mission referencing world entities and persists it', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'quest-owner2@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Bandit Camp' } })).json();

    await ctx.app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/entities`,
      headers: auth,
      payload: { kind: 'NPC', name: 'Bandit Scout', tags: ['enemy'] },
    });

    const genRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/missions/generate',
      headers: auth,
      payload: { worldId: world.id, prompt: 'defeat the bandit scout', difficulty: 4 },
    });
    expect(genRes.statusCode).toBe(201);
    const mission = genRes.json();
    expect(mission.definition.objectives[0].type).toBe('KILL');
    expect(mission.definition.difficulty).toBe(4);

    const getRes = await ctx.app.inject({ method: 'GET', url: `/v1/missions/${mission.id}`, headers: auth });
    expect(getRes.statusCode).toBe(200);
  });

  it('rejects creating a mission on a world the caller cannot read', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'quest-owner3@example.com');
    const stranger = await devLogin(ctx.app, 'quest-stranger@example.com');
    const world = (
      await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: 'Locked World' } })
    ).json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/missions',
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { worldId: world.id, name: 'Sneak In' },
    });
    expect(res.statusCode).toBe(403);
  });
});
