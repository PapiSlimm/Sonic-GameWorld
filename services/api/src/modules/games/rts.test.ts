// docs/RTS-CONTRACTS.md §5/§8: session creation returns a valid seed + faction assignment, and the
// lobby "ready" gate fires RTS_MATCH_START only once every human player has confirmed ready.
import { afterEach, describe, expect, it } from 'vitest';
import { RTS_FACTIONS } from '@sonic-gameworld/rts-sim';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

describe('RTS sessions: lobby, faction assignment, ready-gated match start', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  async function createGame(ctx: TestApp, hostAuth: Record<string, string>) {
    const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: hostAuth, payload: { name: 'RTS Arena' } })).json();
    return (
      await ctx.app.inject({ method: 'POST', url: '/v1/games', headers: hostAuth, payload: { worldId: world.id, name: 'Global Dominance' } })
    ).json();
  }

  it('creates an RTS session with a valid seed + faction assignment (host takes the first faction, the rest default to AI)', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'rts-host@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const game = await createGame(ctx, hostAuth);

    const res = await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: {} });
    expect(res.statusCode).toBe(201);
    const body = res.json();

    expect(body.session.status).toBe('LOBBY');
    expect(body.session.mode).toBe('RTS');
    expect(Number.isInteger(body.rts.seed)).toBe(true);
    expect(body.rts.seed).toBeGreaterThanOrEqual(0);
    expect(body.rts.factions).toHaveLength(RTS_FACTIONS.length);
    expect(body.rts.factions.map((f: { factionId: string }) => f.factionId).sort()).toEqual(RTS_FACTIONS.map((f) => f.id).sort());

    const [firstFaction, ...restFactions] = RTS_FACTIONS;
    const hostFaction = body.rts.factions.find((f: { factionId: string }) => f.factionId === firstFaction!.id);
    expect(hostFaction.isAIControlled).toBe(false);
    expect(body.rts.factionAssignments[firstFaction!.id]).toBe(host.userId);
    // Every other faction defaults to AI-controlled until a second human joins it.
    for (const faction of restFactions) {
      expect(body.rts.factionAssignments[faction.id]).toBeNull();
    }
  });

  it('accepts a client-supplied seed (for reproducible tests/tools)', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'rts-seed@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const game = await createGame(ctx, hostAuth);

    const res = await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: { seed: 20260829 } });
    expect(res.json().rts.seed).toBe(20260829);
  });

  it('lets a second player join an open faction, and only broadcasts RTS_MATCH_START once every human faction is ready', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'rts-host2@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const guest = await devLogin(ctx.app, 'rts-guest2@example.com');
    const guestAuth = { authorization: `Bearer ${guest.accessToken}` };
    const game = await createGame(ctx, hostAuth);

    const created = (await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: {} })).json();
    const sessionId = created.session.id;
    const secondFactionId = RTS_FACTIONS[1]!.id;

    const startEvents: unknown[] = [];
    ctx.bus.subscribe('RTS_MATCH_START', (event) => {
      startEvents.push(event.payload);
    });

    const joinRes = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sessions/${sessionId}/rts/join`,
      headers: guestAuth,
      payload: { factionId: secondFactionId },
    });
    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.json().rts.factionAssignments[secondFactionId]).toBe(guest.userId);

    // Host readies first: not everyone is ready yet, no match start.
    const hostReady = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/rts/ready`, headers: hostAuth });
    expect(hostReady.json().started).toBe(false);
    expect(startEvents).toHaveLength(0);

    // Guest readies: now every human faction is ready, so the match starts.
    const guestReady = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/rts/ready`, headers: guestAuth });
    const readyBody = guestReady.json();
    expect(readyBody.started).toBe(true);
    expect(readyBody.session.status).toBe('RUNNING');

    expect(startEvents).toHaveLength(1);
    const payload = startEvents[0] as { sessionId: string; seed: number; factions: { factionId: string; isAIControlled: boolean }[] };
    expect(payload.sessionId).toBe(sessionId);
    expect(payload.seed).toBe(created.rts.seed);
    expect(payload.factions.find((f) => f.factionId === RTS_FACTIONS[0]!.id)?.isAIControlled).toBe(false);
    expect(payload.factions.find((f) => f.factionId === secondFactionId)?.isAIControlled).toBe(false);
  });

  it('rejects readying up before picking a faction, and rejects taking an already-taken faction', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'rts-host3@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const bystander = await devLogin(ctx.app, 'rts-bystander@example.com');
    const bystanderAuth = { authorization: `Bearer ${bystander.accessToken}` };
    const game = await createGame(ctx, hostAuth);

    const created = (await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: {} })).json();
    const sessionId = created.session.id;

    const readyBeforeJoin = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/rts/ready`, headers: bystanderAuth });
    expect(readyBeforeJoin.statusCode).toBe(403);

    const takeHostFaction = await ctx.app.inject({
      method: 'POST',
      url: `/v1/sessions/${sessionId}/rts/join`,
      headers: bystanderAuth,
      payload: { factionId: RTS_FACTIONS[0]!.id },
    });
    expect(takeHostFaction.statusCode).toBe(409);
  });

  it('re-joining without a factionId is idempotent — it keeps the faction you already hold rather than reassigning you', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'rts-rejoin-host@example.com');
    const hostAuth = { authorization: `Bearer ${host.accessToken}` };
    const guest = await devLogin(ctx.app, 'rts-rejoin-guest@example.com');
    const guestAuth = { authorization: `Bearer ${guest.accessToken}` };
    const game = await createGame(ctx, hostAuth);

    const created = (await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: {} })).json();
    const sessionId = created.session.id;
    const secondFactionId = RTS_FACTIONS[1]!.id;

    const firstJoin = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/rts/join`, headers: guestAuth, payload: { factionId: secondFactionId } });
    expect(firstJoin.json().rts.factionAssignments[secondFactionId]).toBe(guest.userId);

    // Re-join without specifying a faction (e.g. a page reload) — must not bounce the guest to a
    // different faction or free the one they already hold.
    const rejoin = await ctx.app.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/rts/join`, headers: guestAuth, payload: {} });
    expect(rejoin.statusCode).toBe(200);
    expect(rejoin.json().rts.factionAssignments[secondFactionId]).toBe(guest.userId);
  });
});
