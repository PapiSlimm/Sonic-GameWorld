// cloud module (§9 of CONTRACTS.md — GameWorld Cloud): matchmaking (queue -> GameServer
// allocation), server listing, and live events CRUD. Matchmaking's queue lives in ./matchQueue.ts
// (Redis-backed or in-memory, same fallback convention as games/sessionStore.ts).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { assertCanWriteWorld, getWorldOrThrow } from '../worlds/service.js';
import { createMatchQueue, type MatchQueue } from './matchQueue.js';

// ---------------------------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------------------------

interface GameRowLite {
  id: string;
  ownerId: string;
  orgId: string | null;
  maxPlayers: number;
  deletedAt: Date | null;
}

interface GameServerRow {
  id: string;
  gameId: string | null;
  region: string;
  status: 'STARTING' | 'READY' | 'FULL' | 'DRAINING' | 'STOPPED';
  address: string;
  port: number;
  players: number;
  maxPlayers: number;
  version: string | null;
  startedAt: Date;
}

interface LiveEventRow {
  id: string;
  gameId: string | null;
  worldId: string | null;
  name: string;
  description: string | null;
  type: 'SEASON' | 'TOURNAMENT' | 'DROP' | 'RAID' | 'CUSTOM';
  startsAt: Date;
  endsAt: Date;
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  config: unknown;
  participants: number;
  createdAt: Date;
  deletedAt: Date | null;
}

interface MatchmakeTicketRow {
  id: string;
  gameId: string;
  userId: string;
  mode: string | null;
  region: string | null;
  party: string[];
  skill: number | null;
  status: 'SEARCHING' | 'MATCHED' | 'TIMEOUT';
  sessionId: string | null;
  createdAt: Date;
  matchedAt: Date | null;
}

// ---------------------------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------------------------

const MatchmakeSchema = z.object({
  gameId: z.string().min(1),
  mode: z.string().optional(),
  region: z.string().optional(),
  party: z.array(z.string()).optional(),
  skill: z.number().optional(),
});

const ServersQuerySchema = z.object({
  region: z.string().optional(),
  status: z.enum(['STARTING', 'READY', 'FULL', 'DRAINING', 'STOPPED']).optional(),
  gameId: z.string().optional(),
});

const CreateLiveEventSchema = z.object({
  gameId: z.string().optional(),
  worldId: z.string().optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  type: z.enum(['SEASON', 'TOURNAMENT', 'DROP', 'RAID', 'CUSTOM']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  config: z.record(z.unknown()).optional(),
});

const LiveEventsQuerySchema = z.object({
  gameId: z.string().optional(),
  worldId: z.string().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'ENDED']).optional(),
});

// ---------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------

function serializeTicket(t: MatchmakeTicketRow) {
  return {
    id: t.id,
    gameId: t.gameId,
    userId: t.userId,
    mode: t.mode,
    region: t.region,
    party: t.party,
    skill: t.skill,
    status: t.status,
    sessionId: t.sessionId,
    createdAt: t.createdAt.toISOString(),
    matchedAt: t.matchedAt ? t.matchedAt.toISOString() : null,
  };
}

function serializeServer(s: GameServerRow) {
  return {
    id: s.id,
    gameId: s.gameId,
    region: s.region,
    status: s.status,
    address: s.address,
    port: s.port,
    players: s.players,
    maxPlayers: s.maxPlayers,
    version: s.version,
    startedAt: s.startedAt.toISOString(),
  };
}

function serializeLiveEvent(e: LiveEventRow) {
  return {
    id: e.id,
    gameId: e.gameId,
    worldId: e.worldId,
    name: e.name,
    description: e.description,
    type: e.type,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    status: e.status,
    config: e.config ?? undefined,
    participants: e.participants,
    createdAt: e.createdAt.toISOString(),
  };
}

/** A ticket occupies one matchmaking slot regardless of party size — grouping players who queue
 * together is a session-join concern (games module), not this queue's. Two slots is the smallest
 * meaningful "match" (a solo queue would just self-allocate a server with nobody to play against). */
const REQUIRED_TICKETS_TO_MATCH = 2;

function deterministicPort(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 20000 + ((h >>> 0) % 20000);
}

export async function registerCloudModule(app: FastifyInstance): Promise<void> {
  const matchQueue: MatchQueue = createMatchQueue(app.redis);

  async function allocateGameServer(game: GameRowLite, region: string, incomingPlayers: number): Promise<GameServerRow> {
    const existing = (await app.db.gameServer.findFirst({
      where: { gameId: game.id, region, status: 'READY' },
    })) as GameServerRow | null;

    if (existing && existing.players + incomingPlayers <= existing.maxPlayers) {
      const nextPlayers = existing.players + incomingPlayers;
      return (await app.db.gameServer.update({
        where: { id: existing.id },
        data: { players: nextPlayers, status: nextPlayers >= existing.maxPlayers ? 'FULL' : 'READY' },
      })) as GameServerRow;
    }

    const address = `srv-${region.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}.gameservers.sonicgameworld.dev`;
    const port = deterministicPort(`${game.id}:${region}:${randomUUID()}`);
    return (await app.db.gameServer.create({
      data: {
        gameId: game.id,
        region,
        status: incomingPlayers >= game.maxPlayers ? 'FULL' : 'READY',
        address,
        port,
        players: incomingPlayers,
        maxPlayers: game.maxPlayers,
        startedAt: new Date(),
      },
    })) as GameServerRow;
  }

  // ---- Matchmaking ----

  app.post('/cloud/matchmake', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const body = MatchmakeSchema.parse(request.body ?? {});
    const game = (await app.db.game.findUnique({ where: { id: body.gameId } })) as GameRowLite | null;
    if (!game || game.deletedAt) throw AppError.notFound('Game', body.gameId);

    const mode = body.mode ?? 'default';
    const region = body.region ?? 'auto';
    const queueKey = `${body.gameId}:${mode}:${region}`;

    const ticket = (await app.db.matchmakeTicket.create({
      data: {
        gameId: body.gameId,
        userId: user.userId,
        mode: body.mode ?? null,
        region: body.region ?? null,
        party: body.party ?? [],
        skill: body.skill ?? null,
        status: 'SEARCHING',
      },
    })) as MatchmakeTicketRow;
    await matchQueue.push(queueKey, ticket.id);

    const popped = await matchQueue.popIfAtLeast(queueKey, REQUIRED_TICKETS_TO_MATCH);
    if (popped.length === 0) {
      return { status: 'SEARCHING' as const, ticket: serializeTicket(ticket), queueLength: await matchQueue.length(queueKey) };
    }

    const server = await allocateGameServer(game, region, popped.length);
    const matched: MatchmakeTicketRow[] = [];
    for (const ticketId of popped) {
      // eslint-disable-next-line no-await-in-loop -- bounded by REQUIRED_TICKETS_TO_MATCH
      const updated = (await app.db.matchmakeTicket.update({
        where: { id: ticketId },
        data: { status: 'MATCHED', sessionId: server.id, matchedAt: new Date() },
      })) as MatchmakeTicketRow;
      matched.push(updated);
    }

    const self = matched.find((t) => t.id === ticket.id) ?? (matched[0] as MatchmakeTicketRow);
    return {
      status: 'MATCHED' as const,
      ticket: serializeTicket(self),
      server: serializeServer(server),
      matchedWith: matched.filter((t) => t.id !== self.id).map((t) => t.userId),
    };
  });

  // ---- Servers ----

  app.get('/cloud/servers', { preHandler: [app.authenticate] }, async (request) => {
    const filters = ServersQuerySchema.parse(request.query ?? {});
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = {};
    if (filters.region) where.region = filters.region;
    if (filters.status) where.status = filters.status;
    if (filters.gameId) where.gameId = filters.gameId;
    const rows = (await app.db.gameServer.findMany({ where, orderBy: { startedAt: 'desc' }, ...toPrismaPageArgs(query) })) as GameServerRow[];
    return toPage(rows.map(serializeServer), query);
  });

  // ---- Live events ----

  app.post('/cloud/live-events', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateLiveEventSchema.parse(request.body ?? {});
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt.getTime() <= startsAt.getTime()) throw AppError.badRequest('endsAt must be after startsAt');

    // Live events aren't owned rows on their own (no `ownerId` column) — authorize off whatever
    // they're scoped to: the referenced game/world's owner, or platform_admin/admin for a
    // platform-wide event (neither gameId nor worldId set).
    if (body.gameId) {
      const game = (await app.db.game.findUnique({ where: { id: body.gameId } })) as GameRowLite | null;
      if (!game || game.deletedAt) throw AppError.notFound('Game', body.gameId);
      const owns = game.ownerId === user.userId || (!!game.orgId && game.orgId === user.orgId) || user.roles.includes('platform_admin');
      if (!owns) throw AppError.forbidden('You do not have write access to this game');
    } else if (body.worldId) {
      const world = await getWorldOrThrow(app.db, body.worldId);
      assertCanWriteWorld(world, user);
    } else if (!user.roles.includes('platform_admin') && !user.roles.includes('admin')) {
      throw AppError.forbidden('Platform-wide live events require an admin role');
    }

    const now = Date.now();
    const status: LiveEventRow['status'] = now >= endsAt.getTime() ? 'ENDED' : now >= startsAt.getTime() ? 'LIVE' : 'SCHEDULED';

    const event = (await app.db.liveEvent.create({
      data: {
        gameId: body.gameId ?? null,
        worldId: body.worldId ?? null,
        name: body.name,
        description: body.description ?? null,
        type: body.type,
        startsAt,
        endsAt,
        status,
        config: body.config ?? undefined,
        participants: 0,
      },
    })) as LiveEventRow;
    reply.status(201);
    return serializeLiveEvent(event);
  });

  app.get('/cloud/live-events', { preHandler: [app.authenticate] }, async (request) => {
    const filters = LiveEventsQuerySchema.parse(request.query ?? {});
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = { deletedAt: null };
    if (filters.gameId) where.gameId = filters.gameId;
    if (filters.worldId) where.worldId = filters.worldId;
    if (filters.status) where.status = filters.status;
    const rows = (await app.db.liveEvent.findMany({ where, orderBy: { startsAt: 'desc' }, ...toPrismaPageArgs(query) })) as LiveEventRow[];
    return toPage(rows.map(serializeLiveEvent), query);
  });

  // Note: matchmaking/live-events have no dedicated EventType in @sonic-gameworld/events (§7
  // doesn't list one for this domain) — nothing to publish to the bus here.
}
