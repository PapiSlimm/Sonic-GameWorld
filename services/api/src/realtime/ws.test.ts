// docs/RTS-CONTRACTS.md §5/§8: an RTS_COMMAND publish from one connected client is relayed to
// another subscriber of the same session topic — the narrow PUBLISH exception carved out in
// ws.ts's RTS_RELAY_TYPES. Uses @fastify/websocket's `injectWS` to open real in-process `ws`
// connections against the test app (no real network port).
import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import { buildTestApp, devLogin, type TestApp } from '../test/helpers.js';

// `app.injectWS()` (from @fastify/websocket) builds a synthetic upgrade request that has no real
// `.socket` — but this app's `trustProxy: true` makes Fastify's request logger read
// `req.socket.remoteAddress` on every request, including the upgrade itself. Passing a stub socket
// here isn't an RTS-specific workaround, it's just what any injectWS-based test against this app
// needs to avoid a `TypeError` inside the logger crashing the upgrade.
const FAKE_UPGRADE_SOCKET: Partial<IncomingMessage> = { socket: { remoteAddress: '127.0.0.1' } as IncomingMessage['socket'] };

interface RealtimeMessage {
  topic: string;
  type: string;
  payload: unknown;
  at: string;
}

function nextMessage(ws: WebSocket, predicate: (msg: RealtimeMessage) => boolean, timeoutMs = 2000): Promise<RealtimeMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('timed out waiting for a matching realtime message'));
    }, timeoutMs);
    function onMessage(data: Buffer) {
      const parsed = JSON.parse(data.toString()) as RealtimeMessage;
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(parsed);
      }
    }
    ws.on('message', onMessage);
  });
}

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRtsSession(ctx: TestApp, hostToken: string) {
  const hostAuth = { authorization: `Bearer ${hostToken}` };
  const world = (await ctx.app.inject({ method: 'POST', url: '/v1/worlds', headers: hostAuth, payload: { name: 'WS Test World' } })).json();
  const game = (
    await ctx.app.inject({ method: 'POST', url: '/v1/games', headers: hostAuth, payload: { worldId: world.id, name: 'WS Test Game' } })
  ).json();
  const created = (
    await ctx.app.inject({ method: 'POST', url: `/v1/games/${game.id}/rts/sessions`, headers: hostAuth, payload: {} })
  ).json();
  return created.session as { id: string };
}

describe('realtime: RTS_COMMAND relay (docs/RTS-CONTRACTS.md §5)', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('relays an RTS_COMMAND publish from one connected client to another subscriber of the same session topic, but not back to the sender', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'ws-relay-host@example.com');
    const guest = await devLogin(ctx.app, 'ws-relay-guest@example.com');
    const session = await createRtsSession(ctx, host.accessToken);
    await ctx.app.inject({
      method: 'POST',
      url: `/v1/sessions/${session.id}/rts/join`,
      headers: { authorization: `Bearer ${guest.accessToken}` },
      payload: {},
    });

    const topic = `session:${session.id}`;
    const hostWs = await ctx.app.injectWS(`/ws?token=${host.accessToken}`, FAKE_UPGRADE_SOCKET);
    const guestWs = await ctx.app.injectWS(`/ws?token=${guest.accessToken}`, FAKE_UPGRADE_SOCKET);
    hostWs.send(JSON.stringify({ op: 'SUBSCRIBE', topic }));
    guestWs.send(JSON.stringify({ op: 'SUBSCRIBE', topic }));
    await settle();

    let echoedBackToSender = false;
    hostWs.on('message', (data: Buffer) => {
      const parsed = JSON.parse(data.toString()) as RealtimeMessage;
      if (parsed.topic === topic && parsed.type === 'RTS_COMMAND') echoedBackToSender = true;
    });

    const command = { type: 'MOVE', unitIds: ['unit-1', 'unit-2'], targetPos: { x: 10, y: 0, z: 20 } };
    const relayedToGuest = nextMessage(guestWs, (m) => m.topic === topic && m.type === 'RTS_COMMAND');
    hostWs.send(JSON.stringify({ op: 'PUBLISH', topic, type: 'RTS_COMMAND', payload: { tick: 42, command } }));

    const message = await relayedToGuest;
    expect(message.payload).toEqual({ tick: 42, command });

    await settle();
    expect(echoedBackToSender).toBe(false);

    hostWs.close();
    guestWs.close();
  });

  it('silently drops a PUBLISH from a socket whose user is not an active player of that session', async () => {
    ctx = await buildTestApp();
    const host = await devLogin(ctx.app, 'ws-relay-host2@example.com');
    const stranger = await devLogin(ctx.app, 'ws-relay-stranger@example.com');
    const session = await createRtsSession(ctx, host.accessToken);

    const topic = `session:${session.id}`;
    const hostWs = await ctx.app.injectWS(`/ws?token=${host.accessToken}`, FAKE_UPGRADE_SOCKET);
    const strangerWs = await ctx.app.injectWS(`/ws?token=${stranger.accessToken}`, FAKE_UPGRADE_SOCKET);
    hostWs.send(JSON.stringify({ op: 'SUBSCRIBE', topic }));
    strangerWs.send(JSON.stringify({ op: 'SUBSCRIBE', topic })); // subscribing itself isn't gated — only PUBLISH is
    await settle();

    let hostReceivedRtsCommand = false;
    hostWs.on('message', (data: Buffer) => {
      const parsed = JSON.parse(data.toString()) as RealtimeMessage;
      if (parsed.topic === topic && parsed.type === 'RTS_COMMAND') hostReceivedRtsCommand = true;
    });

    strangerWs.send(
      JSON.stringify({ op: 'PUBLISH', topic, type: 'RTS_COMMAND', payload: { tick: 1, command: { type: 'MOVE', unitIds: [] } } }),
    );
    await settle(80);
    expect(hostReceivedRtsCommand).toBe(false);

    hostWs.close();
    strangerWs.close();
  });
});
