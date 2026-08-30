// Realtime bridge (§9): `GET /ws?token=`. Clients send `{ op: 'SUBSCRIBE'|'UNSUBSCRIBE', topic }`;
// the server pushes `{ topic, type, payload, at }` whenever a bus event maps onto a topic the
// socket is subscribed to. Topic rooms: `world:<id>`, `session:<id>`, `creator:<id>`, `user:<id>`.
import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { DomainEvent } from '@sonic-gameworld/events';
import { verifyAccessToken } from '../plugins/auth.js';

interface ClientOp {
  op: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PING' | 'PUBLISH';
  topic?: string;
  type?: string;
  payload?: unknown;
}

interface Connection {
  socket: WebSocket;
  topics: Set<string>;
  userId: string;
}

function isClientOp(v: unknown): v is ClientOp {
  return typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).op === 'string';
}

/**
 * docs/RTS-CONTRACTS.md §5: lockstep RTS multiplayer relays *commands*, never state, and needs
 * that relay to be a direct peer-to-peer hop, not a REST-request-plus-event-bus round trip — the
 * whole point is every peer receiving the same command stream with minimal added latency. This is
 * a narrow, deliberate exception to the "PUBLISH is intentionally not honored" rule below: only
 * these three message types, only on a `session:<id>` topic, and only from a socket whose user is
 * an active player of that session — no schema/tick/anti-cheat validation beyond that membership
 * check (cheating prevention is explicitly out of scope for this pass, per §5/§8).
 *  - `RTS_COMMAND` — `{ tick, command: RTSCommand }`, a human player's input.
 *  - `RTS_SNAPSHOT` — host-published `serializeMatch()` output for reconnect/late-join (§5 picks
 *    "host periodically publishes a snapshot" over full command replay from tick 0).
 *  - `RTS_STATE_HASH` — `stateHash()` output for desync *detection* (not correction) between peers.
 */
const RTS_RELAY_TYPES = new Set(['RTS_COMMAND', 'RTS_SNAPSHOT', 'RTS_STATE_HASH']);
const SESSION_TOPIC_PREFIX = 'session:';

/** Which realtime rooms a domain event's payload fans out to. Pure + exported for unit testing. */
export function topicsForEvent(event: Pick<DomainEvent, 'type' | 'payload'>): string[] {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const topics: string[] = [];
  if (typeof payload.worldId === 'string') topics.push(`world:${payload.worldId}`);
  if (typeof payload.sessionId === 'string') topics.push(`session:${payload.sessionId}`);
  if (typeof payload.creatorId === 'string') topics.push(`creator:${payload.creatorId}`);
  if (typeof payload.userId === 'string') topics.push(`user:${payload.userId}`);
  return topics;
}

export interface RealtimeHub {
  connectionCount(): number;
  broadcast(topic: string, type: string, payload: unknown): void;
  close(): void;
}

/** Registers the `/ws` route and bridges every domain event onto matching topic subscribers.
 * Returns a handle exposing broadcast()/connectionCount() for tests and for other modules that
 * want to push ad-hoc realtime messages (not just bus-driven ones). */
export async function registerRealtime(app: FastifyInstance): Promise<RealtimeHub> {
  await app.register(websocketPlugin);

  const connections = new Set<Connection>();

  function broadcast(topic: string, type: string, payload: unknown, exclude?: WebSocket): void {
    const message = JSON.stringify({ topic, type, payload, at: new Date().toISOString() });
    for (const conn of connections) {
      if (conn.socket === exclude) continue;
      if (conn.topics.has(topic) && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(message);
      }
    }
  }

  /** Handles one client `PUBLISH` for an `RTS_RELAY_TYPES` message — see that const's doc comment. */
  async function relayRtsMessage(conn: Connection, topic: string, type: string, payload: unknown): Promise<void> {
    const sessionId = topic.slice(SESSION_TOPIC_PREFIX.length);
    if (!sessionId) return;
    let isMember: boolean;
    try {
      const membership = await app.db.gameSessionPlayer.findFirst({ where: { sessionId, userId: conn.userId, leftAt: null } });
      isMember = membership !== null;
    } catch {
      isMember = false; // fail closed: an unreachable db means "can't confirm membership", not "allow"
    }
    if (!isMember) return; // silently dropped — see RTS_RELAY_TYPES's doc comment on scope
    // Relayed to every *other* subscriber only: the publisher already applied its own command
    // locally the instant it queued it, so echoing it back would double-apply on that peer.
    broadcast(topic, type, payload, conn.socket);
  }

  app.get('/ws', { websocket: true }, (socket, request) => {
    const query = request.query as Record<string, string | undefined>;
    const token = query.token;
    let userId: string | undefined;
    if (token) {
      try {
        userId = verifyAccessToken(token, app.config).userId;
      } catch {
        userId = undefined;
      }
    }
    if (!userId) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const conn: Connection = { socket, topics: new Set(), userId };
    connections.add(conn);
    // Every socket is auto-subscribed to its own user room so personal notifications/AI
    // execution updates reach it without an explicit SUBSCRIBE.
    conn.topics.add(`user:${userId}`);

    socket.on('message', (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isClientOp(parsed)) return;
      if (parsed.op === 'SUBSCRIBE' && parsed.topic) conn.topics.add(parsed.topic);
      else if (parsed.op === 'UNSUBSCRIBE' && parsed.topic) conn.topics.delete(parsed.topic);
      else if (parsed.op === 'PING') socket.send(JSON.stringify({ topic: '_system', type: 'PONG', payload: null, at: new Date().toISOString() }));
      // PUBLISH is not honored from clients in general — all other writes flow through REST + the
      // event bus so every mutation is validated, permissioned, and persisted (§8) — except the
      // narrow RTS lockstep relay carved out above (RTS_RELAY_TYPES's doc comment).
      else if (parsed.op === 'PUBLISH' && parsed.topic?.startsWith(SESSION_TOPIC_PREFIX) && typeof parsed.type === 'string' && RTS_RELAY_TYPES.has(parsed.type)) {
        void relayRtsMessage(conn, parsed.topic, parsed.type, parsed.payload);
      }
    });

    socket.on('close', () => {
      connections.delete(conn);
    });
  });

  const unsubscribe = app.bus.subscribe('*', (event) => {
    const topics = topicsForEvent(event);
    for (const topic of topics) broadcast(topic, event.type, event.payload);
  });

  app.addHook('onClose', () => {
    unsubscribe();
    for (const conn of connections) conn.socket.close(1001, 'server shutting down');
    connections.clear();
  });

  return {
    connectionCount: () => connections.size,
    broadcast,
    close: () => {
      unsubscribe();
      for (const conn of connections) conn.socket.close();
      connections.clear();
    },
  };
}
