import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';
import { SyntheticProvider } from './forge.js';

describe('worlds: create -> entity add -> semantic text', () => {
  let ctx: TestApp;

  afterEach(async () => {
    await ctx?.close();
  });

  it('creates a world, adds an entity, and reflects it in the document + semantic text', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'builder@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/worlds',
      headers: auth,
      payload: { name: 'Test Vale', description: 'A small test world', genre: ['FANTASY'], sizeKm2: 1, maxPlayers: 8 },
    });
    expect(createRes.statusCode).toBe(201);
    const world = createRes.json();
    expect(world.name).toBe('Test Vale');
    expect(world.entityCount).toBe(0);

    const docRes = await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/document`, headers: auth });
    expect(docRes.statusCode).toBe(200);
    const doc = docRes.json();
    expect(doc.entities).toHaveLength(0);

    const entityRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/entities`,
      headers: auth,
      payload: { kind: 'PLAYER_SPAWN', name: 'Main Spawn', tags: ['spawn'] },
    });
    expect(entityRes.statusCode).toBe(201);
    const entity = entityRes.json();
    expect(entity.kind).toBe('PLAYER_SPAWN');
    expect(entity.name).toBe('Main Spawn');

    const buildingRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/entities`,
      headers: auth,
      payload: { kind: 'BUILDING', name: 'Old Tower', tags: [] },
    });
    expect(buildingRes.statusCode).toBe(201);

    const worldAfter = (await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}`, headers: auth })).json();
    expect(worldAfter.entityCount).toBe(2);

    const semanticRes = await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/semantic`, headers: auth });
    expect(semanticRes.statusCode).toBe(200);
    expect(semanticRes.body).toContain('Test Vale');
    expect(semanticRes.body).toContain('Main Spawn');
    expect(semanticRes.body).toContain('Old Tower');

    // Patching current version in place must not create a second WorldVersion row.
    const versionsRes = await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/versions`, headers: auth });
    expect(versionsRes.json().items).toHaveLength(1);
  });

  it('rejects entity creation from a user who does not own the world', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'owner2@example.com');
    const stranger = await devLogin(ctx.app, 'stranger2@example.com');

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/worlds',
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: 'Private World' },
    });
    const world = createRes.json();

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/entities`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { kind: 'PROP', name: 'Intruder Prop' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('deletes an entity together with its children', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'deleter@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Deletion World' } })).json();

    const parent = (
      await ctx.app.inject({ method: 'POST', url: `/v1/worlds/${world.id}/entities`, headers: auth, payload: { kind: 'BUILDING', name: 'Parent Building' } })
    ).json();
    const child = (
      await ctx.app.inject({
        method: 'POST',
        url: `/v1/worlds/${world.id}/entities`,
        headers: auth,
        payload: { kind: 'ROOM', name: 'Child Room', parentId: parent.id },
      })
    ).json();

    const delRes = await ctx.app.inject({ method: 'DELETE', url: `/v1/worlds/${world.id}/entities/${parent.id}`, headers: auth });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().removedIds.sort()).toEqual([parent.id, child.id].sort());

    const doc = (await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/document`, headers: auth })).json();
    expect(doc.entities).toHaveLength(0);
  });
});

describe('worlds: publish', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('publishing a world creates a Product draft of category WORLD', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'publisher@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Sellable World' } })).json();

    const publishRes = await ctx.app.inject({ method: 'POST', url: `/v1/worlds/${world.id}/publish`, headers: auth, payload: {} });
    expect(publishRes.statusCode).toBe(201);
    const body = publishRes.json();
    expect(body.product.category).toBe('WORLD');
    expect(body.product.refKind).toBe('WORLD');
    expect(body.product.refId).toBe(world.id);
    expect(body.world.status).toBe('PUBLISHED');
  });
});

describe('WorldForge: SyntheticProvider', () => {
  it('is deterministic for a given lat/lon/radius', async () => {
    const provider = new SyntheticProvider();
    const a = await provider.generate({ lat: 40.7128, lon: -74.006, radiusKm: 1.5 });
    const b = await provider.generate({ lat: 40.7128, lon: -74.006, radiusKm: 1.5 });
    expect(a.entities.length).toBe(b.entities.length);
    expect(a.entities[0]?.name).toBe(b.entities[0]?.name);
  });

  it('produces more than 50 entities', async () => {
    const provider = new SyntheticProvider();
    const result = await provider.generate({ lat: 51.5074, lon: -0.1278, radiusKm: 2 });
    expect(result.entities.length).toBeGreaterThan(50);
    const kinds = new Set(result.entities.map((e) => e.kind));
    expect(kinds.has('BUILDING')).toBe(true);
    expect(kinds.has('ROAD')).toBe(true);
    expect(kinds.has('TERRAIN')).toBe(true);
    expect(kinds.has('PLAYER_SPAWN')).toBe(true);
  });
});

describe('worlds: forge endpoint', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('POST /worlds/:id/forge (synthetic) adds more than 50 entities and expands bounds', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'forger@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: 'Forge Target' } })).json();

    const forgeRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/worlds/${world.id}/forge`,
      headers: auth,
      payload: { lat: 35.6938, lon: 139.7034, radiusKm: 2, theme: 'CYBERPUNK' },
    });
    expect(forgeRes.statusCode).toBe(200);
    const body = forgeRes.json();
    expect(body.entitiesAdded).toBeGreaterThan(50);
    expect(body.provider).toBe('SYNTHETIC');

    const doc = (await ctx.app.inject({ method: 'GET', url: `/v1/worlds/${world.id}/document`, headers: auth })).json();
    expect(doc.entities.length).toBeGreaterThan(50);
    expect(doc.origin.lat).toBeCloseTo(35.6938, 3);
    expect(doc.environment.weather).toBe('RAIN'); // CYBERPUNK theme
  });
});
