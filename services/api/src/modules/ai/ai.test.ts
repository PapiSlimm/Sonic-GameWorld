import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';
import { signAccessToken } from '../../plugins/auth.js';

interface AiExecutedEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result?: unknown;
  error?: string;
}
interface AiDeniedEntry {
  tool: string;
  args: Record<string, unknown>;
  code: string;
  reason: string;
}
interface CommandResponse {
  worldId: string;
  role: string;
  provider: string;
  model: string;
  plan: { tool: string; args: Record<string, unknown> }[];
  executed: AiExecutedEntry[];
  denied: AiDeniedEntry[];
  narration: string;
  versionId?: string;
}

async function createWorldWithAnchors(app: TestApp['app'], auth: Record<string, string>) {
  const world = (await app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Director Test City', sizeKm2: 4 } })).json();
  const building = (
    await app.inject({ method: 'POST', url: `/v1/worlds/${world.id}/entities`, headers: auth, payload: { kind: 'BUILDING', name: 'Building 7' } })
  ).json();
  const player = (
    await app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/entities`,
      headers: auth,
      payload: { kind: 'PLAYER_SPAWN', name: 'Player 17' },
    })
  ).json();
  return { world, building, player };
}

async function command(app: TestApp['app'], auth: Record<string, string>, worldId: string, text: string): Promise<{ statusCode: number; body: CommandResponse }> {
  const res = await app.inject({ method: 'POST', url: '/v1/ai/command', headers: auth, payload: { worldId, text } });
  return { statusCode: res.statusCode, body: res.json() as CommandResponse };
}

describe('ai: POST /ai/command (mock provider)', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('"spawn 3 enemies near Building 7" -> spawn_npc x3, each placed within world bounds', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'director@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    const { statusCode, body } = await command(ctx.app, auth, world.id, 'spawn 3 enemies near Building 7');
    expect(statusCode).toBe(200);
    expect(body.denied).toEqual([]);
    expect(body.executed).toHaveLength(1);
    expect(body.executed[0]?.tool).toBe('spawn_npc');
    expect(body.executed[0]?.ok).toBe(true);

    const doc = (await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/document`, headers: auth })).json();
    const npcs = doc.entities.filter((e: { kind: string }) => e.kind === 'NPC');
    expect(npcs).toHaveLength(3);
    for (const npc of npcs) {
      expect(npc.transform.position.x).toBeGreaterThanOrEqual(doc.bounds.min.x);
      expect(npc.transform.position.x).toBeLessThanOrEqual(doc.bounds.max.x);
      expect(npc.transform.position.y).toBeGreaterThanOrEqual(doc.bounds.min.y);
      expect(npc.transform.position.y).toBeLessThanOrEqual(doc.bounds.max.y);
      expect(npc.transform.position.z).toBeGreaterThanOrEqual(doc.bounds.min.z);
      expect(npc.transform.position.z).toBeLessThanOrEqual(doc.bounds.max.z);
    }
  });

  it('"start the storm" -> set_weather STORM', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'weather@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    const { statusCode, body } = await command(ctx.app, auth, world.id, 'start the storm');
    expect(statusCode).toBe(200);
    expect(body.executed).toHaveLength(1);
    expect(body.executed[0]?.tool).toBe('set_weather');
    expect(body.executed[0]?.ok).toBe(true);

    const doc = (await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/document`, headers: auth })).json();
    expect(doc.environment.weather).toBe('STORM');
  });

  it('"follow player 17" -> track_entity', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'tracker@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    const { statusCode, body } = await command(ctx.app, auth, world.id, 'follow player 17');
    expect(statusCode).toBe(200);
    expect(body.executed).toHaveLength(1);
    expect(body.executed[0]?.tool).toBe('track_entity');
    expect(body.executed[0]?.ok).toBe(true);
    expect((body.executed[0]?.result as { name?: string })?.name).toBe('Player 17');
  });

  it('"make this area a boss arena" -> plans create_trigger + modify_entity', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'designer@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    const { statusCode, body } = await command(ctx.app, auth, world.id, 'make this area a boss arena');
    expect(statusCode).toBe(200);
    expect(body.role).toBe('DESIGNER');
    const planTools = body.plan.map((c) => c.tool).sort();
    expect(planTools).toEqual(['create_trigger', 'modify_entity'].sort());
  });

  it('denies a tool the caller lacks permission for (viewer role)', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'viewer-owner@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    // Re-sign the same user's session with an explicit `viewer` role -- a deliberate downgrade
    // (see ./permissions.ts) that should stay in force even though this user owns the world.
    const viewerToken = signAccessToken({ userId: session.userId, roles: ['viewer'], tier: 'STARTER' }, ctx.app.config);
    const viewerAuth = { authorization: `Bearer ${viewerToken}` };

    const { statusCode, body } = await command(ctx.app, viewerAuth, world.id, 'spawn 3 enemies near Building 7');
    expect(statusCode).toBe(200);
    expect(body.executed).toEqual([]);
    expect(body.denied).toHaveLength(1);
    expect(body.denied[0]?.tool).toBe('spawn_npc');
    expect(body.denied[0]?.code).toBe('PERMISSION');
  });

  it('rejects a command against a world the caller cannot access', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'ai-owner@example.com');
    const stranger = await devLogin(ctx.app, 'ai-stranger@example.com');
    const { world } = await createWorldWithAnchors(ctx.app, { authorization: `Bearer ${owner.accessToken}` });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/command',
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { worldId: world.id, text: 'start the storm' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts voice input via {voice:true, transcript}', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'voice@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/command',
      headers: auth,
      payload: { worldId: world.id, voice: true, transcript: 'start the storm' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CommandResponse;
    expect(body.executed[0]?.tool).toBe('set_weather');
  });

  it('writes an AIExecution row and an AIUsage row, visible via GET /ai/executions and /ai/usage', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'audit@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { world } = await createWorldWithAnchors(ctx.app, auth);

    await command(ctx.app, auth, world.id, 'start the storm');

    const executionsRes = await ctx.app.inject({ method: 'GET', url: '/v1/ai/executions', headers: auth });
    expect(executionsRes.statusCode).toBe(200);
    const executions = executionsRes.json().items;
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[0].tool).toBe('set_weather');
    expect(executions[0].worldId).toBe(world.id);

    const usageRes = await ctx.app.inject({ method: 'GET', url: '/v1/ai/usage', headers: auth });
    expect(usageRes.statusCode).toBe(200);
    const usage = usageRes.json();
    expect(usage.items.length).toBeGreaterThanOrEqual(1);
    expect(usage.items[0].model).toBe('mock-parser-v1');
  });
});

describe('ai: GET /ai/tools', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('lists all 20 AI tools with permission + roles + argsSchema', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'tools@example.com');
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/ai/tools', headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items).toHaveLength(20);
    const spawnNpc = items.find((t: { name: string }) => t.name === 'spawn_npc');
    expect(spawnNpc.permission).toBe('npc:write');
    expect(spawnNpc.roles).toContain('BUILDER');
    expect(spawnNpc.argsSchema.type).toBe('object');
  });
});

describe('ai: POST /ai/generate', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('generates a cyberpunk city world with districts, tunnels, spaceport, tower, roads and props', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'worldgen@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/generate',
      headers: auth,
      payload: {
        kind: 'WORLD',
        prompt: 'Build me a 10 km cyberpunk city with four districts, underground tunnels, a spaceport and a central corporate tower',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('WORLD');
    expect(body.plan.genre).toContain('CYBERPUNK');
    expect(body.denied).toEqual([]);

    const counts: Record<string, number> = {};
    for (const e of body.document.entities as { kind: string }[]) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    expect(counts.REGION).toBe(4);
    expect(counts.VOLUME).toBe(1);
    expect(counts.ZONE).toBe(1);
    expect(counts.BUILDING).toBe(1);
    expect(counts.ROAD).toBeGreaterThanOrEqual(1);
    expect(counts.PROP).toBeGreaterThanOrEqual(1);

    // The generated world is a real, persisted world -- fetchable through the normal worlds API.
    const worldRes = await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${body.worldId}`, headers: auth });
    expect(worldRes.statusCode).toBe(200);
  });

  it('generates a draft NPCDefinition without a worldId, and spawns a live NPC when given one', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'npcgen@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const draftRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/generate',
      headers: auth,
      payload: { kind: 'NPC', prompt: 'A mysterious, aggressive smuggler named Vex who guards the docks' },
    });
    expect(draftRes.statusCode).toBe(200);
    const draft = draftRes.json();
    expect(draft.npc.personality.traits).toEqual(expect.arrayContaining(['mysterious', 'aggressive']));
    expect(draft.spawn).toBeUndefined();

    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'NPC World' } })).json();
    const spawnRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/generate',
      headers: auth,
      payload: { kind: 'NPC', prompt: 'A friendly merchant', worldId: world.id },
    });
    expect(spawnRes.statusCode).toBe(200);
    const spawned = spawnRes.json();
    expect(spawned.spawn?.entityId).toBeTruthy();
  });

  it('generates a mission plan and, with a worldId, a real MissionDefinition on the world', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'missiongen@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Mission World' } })).json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/generate',
      headers: auth,
      payload: { kind: 'MISSION', prompt: 'Design a hard boss mission to kill the reactor guardian', worldId: world.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan.objectiveType).toBe('KILL');
    expect(body.plan.difficulty).toBe(9);
    expect((body.mission as { state?: string })?.state).toBe('DRAFT');
  });

  it('generates a cinematic sequence plan', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'cinegen@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/ai/generate',
      headers: auth,
      payload: { kind: 'CINEMATIC', prompt: 'a drone orbit shot of the tower' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plan.shots.map((s: { mode: string }) => s.mode)).toEqual(expect.arrayContaining(['DRONE', 'ORBIT']));
  });
});
