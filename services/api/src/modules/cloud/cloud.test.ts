import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

async function createGame(ctx: TestApp, auth: Record<string, string>, name = 'Cloud Test Game') {
  const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: auth, payload: { name: `${name} World` } })).json();
  const game = (
    await ctx.app.inject({ method: 'POST', url: '/v1/games', headers: auth, payload: { worldId: world.id, name, maxPlayers: 8 } })
  ).json();
  return { world, game };
}

describe('cloud: matchmake -> GameServer allocation', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('queues a solo ticket, then matches it with a second ticket and allocates a server', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'cloud-owner@example.com');
    const ownerAuth = { authorization: `Bearer ${owner.accessToken}` };
    const player2 = await devLogin(ctx.app, 'cloud-player2@example.com');
    const player2Auth = { authorization: `Bearer ${player2.accessToken}` };

    const { game } = await createGame(ctx, ownerAuth);

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/cloud/matchmake',
      headers: ownerAuth,
      payload: { gameId: game.id, mode: 'quickplay', region: 'us-east' },
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.status).toBe('SEARCHING');

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/v1/cloud/matchmake',
      headers: player2Auth,
      payload: { gameId: game.id, mode: 'quickplay', region: 'us-east' },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();
    expect(secondBody.status).toBe('MATCHED');
    expect(secondBody.server.region).toBe('us-east');
    expect(secondBody.server.players).toBe(2);
    expect(secondBody.matchedWith).toContain(owner.userId);

    const serversRes = await ctx.app.inject({ method: 'GET', url: '/v1/cloud/servers?region=us-east', headers: ownerAuth });
    expect(serversRes.statusCode).toBe(200);
    expect(serversRes.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps separate queues per mode/region', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'cloud-isolated@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { game } = await createGame(ctx, auth, 'Isolated Game');

    const res = await ctx.app.inject({ method: 'POST', url: '/v1/cloud/matchmake', headers: auth, payload: { gameId: game.id, mode: 'ranked', region: 'eu-west' } });
    expect(res.json().status).toBe('SEARCHING');
    expect(res.json().queueLength).toBe(1);
  });
});

describe('cloud: live events', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('lets a game owner create and list a live event for their game', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'live-owner@example.com');
    const auth = { authorization: `Bearer ${owner.accessToken}` };
    const { game } = await createGame(ctx, auth, 'Tournament Game');

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/cloud/live-events',
      headers: auth,
      payload: {
        gameId: game.id,
        name: 'Season 1 Championship',
        type: 'TOURNAMENT',
        startsAt: new Date(Date.now() - 1000 * 60).toISOString(),
        endsAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });
    expect(createRes.statusCode).toBe(201);
    const event = createRes.json();
    expect(event.type).toBe('TOURNAMENT');
    expect(event.status).toBe('LIVE');

    const listRes = await ctx.app.inject({ method: 'GET', url: `/v1/cloud/live-events?gameId=${game.id}`, headers: auth });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);
  });

  it('rejects a live event for a game the caller does not own', async () => {
    ctx = await buildTestApp();
    const owner = await devLogin(ctx.app, 'live-owner2@example.com');
    const stranger = await devLogin(ctx.app, 'live-stranger@example.com');
    const { game } = await createGame(ctx, { authorization: `Bearer ${owner.accessToken}` }, 'Locked Game');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/cloud/live-events',
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: {
        gameId: game.id,
        name: 'Hijacked Event',
        type: 'DROP',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60000).toISOString(),
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects endsAt before startsAt', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'live-badrange@example.com');
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { game } = await createGame(ctx, auth, 'Bad Range Game');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/cloud/live-events',
      headers: auth,
      payload: { gameId: game.id, name: 'Backwards', type: 'RAID', startsAt: new Date(Date.now() + 60000).toISOString(), endsAt: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(400);
  });
});
