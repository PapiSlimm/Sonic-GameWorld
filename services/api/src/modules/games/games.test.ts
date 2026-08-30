import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

describe('games: CRUD, publish, sessions, saves, leaderboard', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('creates a game from a world, publishes it, and runs a full session lifecycle', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'game-host@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const guest = await devLogin(ctx.app, 'game-guest@example.com');
    const guestAuth = { authorization: `Bearer ${guest.accessToken}` };

    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: hostAuth, payload: { name: 'Arena World' } })).json();
    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/games',
      headers: hostAuth,
      payload: { worldId: world.id, name: 'Arena Brawl', maxPlayers: 4 },
    });
    expect(createRes.statusCode).toBe(201);
    const game = createRes.json();
    expect(game.status).toBe('DRAFT');

    const publishRes = await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/publish`, headers: hostAuth, payload: {} });
    expect(publishRes.statusCode).toBe(201);
    const publishBody = publishRes.json();
    expect(publishBody.game.status).toBe('PUBLISHED');
    expect(publishBody.product.category).toBe('EXPERIENCE');

    const sessionRes = await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/sessions`, headers: hostAuth, payload: {} });
    expect(sessionRes.statusCode).toBe(201);
    const session = sessionRes.json();
    expect(session.status).toBe('LOBBY');
    expect(session.players).toEqual([host.userId]);

    const joinRes = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${session.id}/join`, headers: guestAuth, payload: {} });
    expect(joinRes.statusCode).toBe(200);
    const joined = joinRes.json();
    expect(joined.status).toBe('RUNNING');
    expect(joined.players.sort()).toEqual([host.userId, guest.userId].sort());

    const saveRes = await ctx.app.inject({
      method: 'PUT',
      url: `/v1/games/${game.id}/saves/${guest.userId}`,
      headers: guestAuth,
      payload: { slot: 0, data: { level: 3, gold: 42 } },
    });
    expect(saveRes.statusCode).toBe(200);
    expect(saveRes.json().data).toEqual({ level: 3, gold: 42 });

    const leaderboardPost = await ctx.app.inject({
      method: 'POST',
      url: `/v1/games/${game.id}/leaderboard`,
      headers: guestAuth,
      payload: { score: 9001 },
    });
    expect(leaderboardPost.statusCode).toBe(201);

    const leaderboardGet = await ctx.app.inject({ method: 'GET', url: `/v1/games/${game.id}/leaderboard`, headers: hostAuth });
    expect(leaderboardGet.json().items[0].score).toBe(9001);

    const endRes = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${session.id}/end`, headers: hostAuth });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().status).toBe('ENDED');
  });

  it('rejects a stranger writing another player\'s save', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'game-host2@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const stranger = await devLogin(ctx.app, 'game-stranger@example.com');

    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: hostAuth, payload: { name: 'Solo World' } })).json();
    const game = (
      await ctx.app.inject({ method: 'POST', url: '/v1/games', headers: hostAuth, payload: { worldId: world.id, name: 'Solo Game' } })
    ).json();

    const res = await ctx.app.inject({
      method: 'PUT',
      url: `/v1/games/${game.id}/saves/${host.userId}`,
      headers: { authorization: `Bearer ${stranger.accessToken}` },
      payload: { slot: 0, data: { cheated: true } },
    });
    expect(res.statusCode).toBe(403);
  });
});
