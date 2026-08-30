// games module (§9 of CONTRACTS.md): Game CRUD, publish, sessions (create/join/end), saves,
// leaderboard. Live session state lives in Redis (or an in-memory map when REDIS_URL is unset)
// layered on top of the durable GameSession/GameSessionPlayer rows in Postgres.
import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { EngineTargetSchema, GenreSchema, type EngineTarget } from '@sonic-gameworld/world-schema';
import { createEvent } from '@sonic-gameworld/events';
import { RTS_FACTIONS, type FactionSetup } from '@sonic-gameworld/rts-sim';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { getOrCreateCreatorProfile, getWorldOrThrow, assertCanReadWorld, assertCanWriteWorld, type AccessSubject } from '../worlds/service.js';
import { createSessionStore, type LiveSessionState, type SessionStore } from './sessionStore.js';
import { createRtsSessionStore, type RtsSessionRecord, type RtsSessionStore } from './rtsSessionStore.js';

// ---------------------------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------------------------

interface GameRow {
  id: string;
  worldId: string;
  ownerId: string;
  orgId: string | null;
  name: string;
  slug: string;
  description: string;
  genre: string[];
  engines: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  maxPlayers: number;
  modes: string[];
  thumbnailUrl: string | null;
  currentVersionId: string | null;
  playerCount: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  deletedAt: Date | null;
}

interface GameVersionRow {
  id: string;
  gameId: string;
  version: string;
  changelog: string | null;
  buildRef: unknown;
  createdAt: Date;
}

interface GameSessionRow {
  id: string;
  gameId: string;
  hostId: string | null;
  serverId: string | null;
  status: 'LOBBY' | 'RUNNING' | 'ENDED';
  mode: string | null;
  region: string | null;
  maxPlayers: number;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

interface GameSessionPlayerRow {
  id: string;
  sessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

interface GameSaveRow {
  id: string;
  gameId: string;
  playerId: string;
  slot: number;
  data: unknown;
  version: number;
  updatedAt: Date;
}

interface LeaderboardEntryRow {
  id: string;
  gameId: string;
  board: string;
  playerId: string;
  score: number;
  metadata: unknown;
  achievedAt: Date;
}

// ---------------------------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------------------------

const CreateGameSchema = z.object({
  worldId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(4000).optional(),
  genre: z.array(GenreSchema).optional(),
  engines: z.array(EngineTargetSchema).optional(),
  maxPlayers: z.number().int().positive().optional(),
  modes: z.array(z.string()).optional(),
});

const PatchGameSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(4000).optional(),
  genre: z.array(GenreSchema).optional(),
  engines: z.array(EngineTargetSchema).optional(),
  maxPlayers: z.number().int().positive().optional(),
  modes: z.array(z.string()).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
});

const PublishGameSchema = z.object({
  changelog: z.string().max(2000).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  engines: z.array(EngineTargetSchema).optional(),
});

const CreateSessionSchema = z.object({
  mode: z.string().optional(),
  region: z.string().optional(),
  maxPlayers: z.number().int().positive().optional(),
});

// ---- RTS sessions (docs/RTS-CONTRACTS.md §5) ----
// A dedicated route rather than overloading `CreateSessionSchema` above: the generic session
// lifecycle (auto-`RUNNING` on 2nd join, no faction concept) doesn't fit lockstep RTS lobbies,
// which need an explicit per-player "ready" gate and a faction roster before `RTS_MATCH_START`
// can fire. `POST /games/:id/sessions` and its lifecycle are left completely untouched.
const RtsDifficultySchema = z.enum(['Beginner', 'Intermediate', 'Pro']);

const CreateRtsSessionSchema = z.object({
  region: z.string().optional(),
  /** Omit to let the server mint one — see the route handler. Only meaningful for reproducing a
   * specific match in tests/tools; two independently-created sessions never need the same seed. */
  seed: z.number().int().optional(),
  mapWidthM: z.number().positive().default(2000),
  mapDepthM: z.number().positive().default(2000),
  cellSizeM: z.number().positive().default(40),
  difficulty: RtsDifficultySchema.default('Intermediate'),
});

const RtsJoinSchema = z.object({ factionId: z.string().optional() });

const SaveBodySchema = z.object({ slot: z.number().int().nonnegative().default(0), data: z.record(z.unknown()) });

const LeaderboardSubmitSchema = z.object({
  playerId: z.string().optional(),
  board: z.string().default('default'),
  score: z.number(),
  metadata: z.record(z.unknown()).optional(),
});

const LeaderboardQuerySchema = z.object({ board: z.string().default('default'), limit: z.coerce.number().int().positive().max(100).default(20) });

// ---------------------------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------------------------

function serializeGame(game: GameRow) {
  return {
    id: game.id,
    worldId: game.worldId,
    ownerId: game.ownerId,
    orgId: game.orgId,
    name: game.name,
    slug: game.slug,
    description: game.description,
    genre: game.genre,
    engines: game.engines,
    status: game.status,
    maxPlayers: game.maxPlayers,
    modes: game.modes,
    thumbnailUrl: game.thumbnailUrl,
    currentVersionId: game.currentVersionId,
    playerCount: game.playerCount,
    rating: game.rating,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    publishedAt: game.publishedAt ? game.publishedAt.toISOString() : null,
  };
}

function serializeSave(save: GameSaveRow) {
  return { id: save.id, gameId: save.gameId, playerId: save.playerId, slot: save.slot, data: save.data, version: save.version, updatedAt: save.updatedAt.toISOString() };
}

function serializeLeaderboardEntry(entry: LeaderboardEntryRow) {
  return { id: entry.id, gameId: entry.gameId, board: entry.board, playerId: entry.playerId, score: entry.score, metadata: entry.metadata ?? undefined, achievedAt: entry.achievedAt.toISOString() };
}

/** Derives the pinned `FactionSetup[]` shape (rts-sim's `createMatch` input) from the stored
 * userId-or-null assignment map: unassigned = AI-controlled, per docs/RTS-CONTRACTS.md §5. */
function factionSetupsFor(rts: Pick<RtsSessionRecord, 'factionAssignments'>): FactionSetup[] {
  return RTS_FACTIONS.map((faction) => ({ factionId: faction.id, isAIControlled: rts.factionAssignments[faction.id] == null }));
}

function serializeRtsRecord(rts: RtsSessionRecord) {
  return {
    sessionId: rts.sessionId,
    gameId: rts.gameId,
    seed: rts.seed,
    mapWidthM: rts.mapWidthM,
    mapDepthM: rts.mapDepthM,
    cellSizeM: rts.cellSizeM,
    difficulty: rts.difficulty,
    factions: factionSetupsFor(rts),
    factionAssignments: rts.factionAssignments,
    readyUserIds: rts.readyUserIds,
  };
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `game-${randomUUID().slice(0, 8)}`;
}

function canAccessGame(game: Pick<GameRow, 'ownerId' | 'orgId'>, subject: AccessSubject): boolean {
  if (game.ownerId === subject.userId) return true;
  if (game.orgId && subject.orgId && game.orgId === subject.orgId) return true;
  return subject.roles.includes('platform_admin');
}

export async function registerGamesModule(app: FastifyInstance): Promise<void> {
  const sessionStore: SessionStore = createSessionStore(app.redis);
  const rtsStore: RtsSessionStore = createRtsSessionStore(app.redis);

  async function uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop -- small, bounded by actual collisions
    while (await app.db.game.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${base}-${n}`;
    }
    return slug;
  }

  async function getGameOrThrow(gameId: string): Promise<GameRow> {
    const game = (await app.db.game.findUnique({ where: { id: gameId } })) as GameRow | null;
    if (!game || game.deletedAt) throw AppError.notFound('Game', gameId);
    return game;
  }

  async function loadSessionOrThrow(sessionId: string): Promise<{ session: GameSessionRow; game: GameRow }> {
    const session = (await app.db.gameSession.findUnique({ where: { id: sessionId } })) as GameSessionRow | null;
    if (!session) throw AppError.notFound('Session', sessionId);
    const game = await getGameOrThrow(session.gameId);
    return { session, game };
  }

  async function syncLiveState(session: GameSessionRow, players: string[]): Promise<LiveSessionState> {
    const state: LiveSessionState = {
      id: session.id,
      gameId: session.gameId,
      status: session.status,
      players,
      maxPlayers: session.maxPlayers,
      mode: session.mode,
      region: session.region,
      hostId: session.hostId,
      serverId: session.serverId,
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    await sessionStore.set(session.id, state);
    return state;
  }

  async function serializeSession(session: GameSessionRow) {
    const live = await sessionStore.get(session.id);
    const playerRows = (await app.db.gameSessionPlayer.findMany({ where: { sessionId: session.id } })) as GameSessionPlayerRow[];
    const activePlayers = playerRows.filter((p) => !p.leftAt).map((p) => p.userId);
    return {
      id: session.id,
      gameId: session.gameId,
      hostId: session.hostId,
      serverId: session.serverId,
      status: session.status,
      mode: session.mode,
      region: session.region,
      maxPlayers: session.maxPlayers,
      players: live?.players ?? activePlayers,
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
    };
  }

  // ---- Game CRUD ----

  app.post('/games', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateGameSchema.parse(request.body ?? {});
    const world = await getWorldOrThrow(app.db, body.worldId);
    assertCanReadWorld(world, user);

    const slug = await uniqueSlug(slugify(body.name));
    const game = (await app.db.game.create({
      data: {
        worldId: body.worldId,
        ownerId: user.userId,
        orgId: user.orgId ?? null,
        name: body.name,
        slug,
        description: body.description ?? '',
        genre: body.genre ?? [],
        engines: body.engines ?? [],
        status: 'DRAFT',
        maxPlayers: body.maxPlayers ?? 16,
        modes: body.modes ?? [],
        playerCount: 0,
        rating: 0,
      },
    })) as GameRow;

    await app.bus.publish(createEvent({ type: 'GAME_CREATED', payload: { gameId: game.id, worldId: game.worldId, ownerId: user.userId } }));
    reply.status(201);
    return serializeGame(game);
  });

  app.get('/games', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const filters = request.query as { worldId?: string };
    const where: Record<string, unknown> = {
      deletedAt: null,
      OR: user.orgId ? [{ ownerId: user.userId }, { orgId: user.orgId }] : [{ ownerId: user.userId }],
    };
    if (filters.worldId) where.worldId = filters.worldId;
    const rows = (await app.db.game.findMany({ where, orderBy: { updatedAt: 'desc' }, ...toPrismaPageArgs(query) })) as GameRow[];
    return toPage(rows.map(serializeGame), query);
  });

  app.get('/games/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const game = await getGameOrThrow(id);
    if (game.status !== 'PUBLISHED' && !canAccessGame(game, request.user!)) throw AppError.forbidden('You do not have access to this game');
    return serializeGame(game);
  });

  app.patch('/games/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const game = await getGameOrThrow(id);
    if (!canAccessGame(game, request.user!)) throw AppError.forbidden('You do not have write access to this game');
    const body = PatchGameSchema.parse(request.body ?? {});
    const updated = (await app.db.game.update({ where: { id }, data: body })) as GameRow;
    return serializeGame(updated);
  });

  app.post('/games/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const game = await getGameOrThrow(id);
    if (!canAccessGame(game, request.user!)) throw AppError.forbidden('You do not have write access to this game');
    const body = PublishGameSchema.parse(request.body ?? {});

    const versionCount = await app.db.gameVersion.count({ where: { gameId: id } });
    const versionLabel = String(versionCount + 1);
    const version = (await app.db.gameVersion.create({
      data: { gameId: id, version: versionLabel, changelog: body.changelog ?? null, buildRef: null },
    })) as GameVersionRow;
    const updated = (await app.db.game.update({
      where: { id },
      data: { status: 'PUBLISHED', currentVersionId: version.id, publishedAt: new Date() },
    })) as GameRow;

    const profile = await getOrCreateCreatorProfile(app.db, request.user!.userId);
    // ProductCategory has no dedicated "GAME" entry (§5) — a published game is a playable
    // EXPERIENCE product, distinct from the WORLD it runs on.
    const product = await app.db.product.create({
      data: {
        slug: `${updated.slug}-game`,
        name: updated.name,
        category: 'EXPERIENCE',
        genre: updated.genre,
        engines: updated.engines.length ? updated.engines : ['WEB'],
        priceCents: body.priceCents ?? 0,
        currency: 'USD',
        description: updated.description || `A GameWorld game: ${updated.name}`,
        tags: [],
        previewUrls: [],
        license: { id: `lic_${updated.id}`, commercial: true, personal: true, enterprise: false, redistribution: false, modification: false, multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false },
        refKind: 'GAME',
        refId: updated.id,
        creatorId: profile.id,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    await app.bus.publish(createEvent({ type: 'GAME_PUBLISHED', payload: { gameId: updated.id, versionId: version.id, productId: product.id } }));

    // Compile the web/engine build packages off the request thread (workers/builds, queue
    // `build.compile`) — one engine failing doesn't block the others; see that worker's README.
    const engines = body.engines && body.engines.length > 0 ? body.engines : updated.engines.length ? (updated.engines as EngineTarget[]) : (['WEB'] as EngineTarget[]);
    await app.queues.buildCompile.add('compile', {
      gameId: updated.id,
      gameVersionId: version.id,
      worldId: updated.worldId,
      engines,
      requestedBy: request.user!.userId,
    });

    reply.status(201);
    return { game: serializeGame(updated), version: { id: version.id, version: version.version }, product };
  });

  // ---- Sessions ----

  app.post('/games/:id/sessions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const game = await getGameOrThrow(id);
    const body = CreateSessionSchema.parse(request.body ?? {});

    const session = (await app.db.gameSession.create({
      data: { gameId: id, hostId: request.user!.userId, status: 'LOBBY', mode: body.mode ?? null, region: body.region ?? null, maxPlayers: body.maxPlayers ?? game.maxPlayers },
    })) as GameSessionRow;
    await app.db.gameSessionPlayer.create({ data: { sessionId: session.id, userId: request.user!.userId } });
    await syncLiveState(session, [request.user!.userId]);

    await app.bus.publish(createEvent({ type: 'GAME_SESSION_STARTED', payload: { sessionId: session.id, gameId: id, hostId: request.user!.userId, maxPlayers: session.maxPlayers } }));
    reply.status(201);
    return serializeSession(session);
  });

  // ---- RTS sessions (docs/RTS-CONTRACTS.md §5) ----
  // This module never imports `tickMatch`/runs the simulation — "the API only relays/manages
  // lobbies", consistent with this codebase's existing "API enqueues/relays, clients/workers do
  // the work" pattern. These routes only mint a match seed + faction roster (so every peer can
  // call `createMatch()` with identical arguments) and gate the `RTS_MATCH_START` broadcast on
  // every human player readying up; the actual command stream is relayed peer-to-peer over the
  // realtime bridge (src/realtime/ws.ts's `RTS_COMMAND`/`RTS_SNAPSHOT`/`RTS_STATE_HASH` handling),
  // not through these HTTP routes.
  app.post('/games/:id/rts/sessions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await getGameOrThrow(id);
    const body = CreateRtsSessionSchema.parse(request.body ?? {});
    const hostId = request.user!.userId;

    const session = (await app.db.gameSession.create({
      data: { gameId: id, hostId, status: 'LOBBY', mode: 'RTS', region: body.region ?? null, maxPlayers: RTS_FACTIONS.length },
    })) as GameSessionRow;
    await app.db.gameSessionPlayer.create({ data: { sessionId: session.id, userId: hostId } });
    await syncLiveState(session, [hostId]);

    // The host takes the first faction slot; every other faction defaults to AI-controlled until
    // another human joins it via POST /sessions/:id/rts/join.
    const factionAssignments: Record<string, string | null> = {};
    RTS_FACTIONS.forEach((faction, index) => {
      factionAssignments[faction.id] = index === 0 ? hostId : null;
    });
    const rts: RtsSessionRecord = {
      sessionId: session.id,
      gameId: id,
      seed: body.seed ?? randomInt(0, 0x7fffffff),
      mapWidthM: body.mapWidthM,
      mapDepthM: body.mapDepthM,
      cellSizeM: body.cellSizeM,
      difficulty: body.difficulty,
      factionAssignments,
      readyUserIds: [],
      updatedAt: new Date().toISOString(),
    };
    await rtsStore.set(session.id, rts);

    await app.bus.publish(createEvent({ type: 'GAME_SESSION_STARTED', payload: { sessionId: session.id, gameId: id, hostId, maxPlayers: session.maxPlayers } }));
    reply.status(201);
    return { session: await serializeSession(session), rts: serializeRtsRecord(rts) };
  });

  app.post('/sessions/:id/rts/join', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { session } = await loadSessionOrThrow(id);
    if (session.mode !== 'RTS') throw AppError.badRequest('This session was not created as an RTS match');
    if (session.status !== 'LOBBY') throw AppError.conflict('This RTS match has already started');
    const rts = await rtsStore.get(id);
    if (!rts) throw AppError.notFound('RTS session', id);
    const body = RtsJoinSchema.parse(request.body ?? {});
    const userId = request.user!.userId;

    const existingPlayer = (await app.db.gameSessionPlayer.findFirst({ where: { sessionId: id, userId, leftAt: null } })) as GameSessionPlayerRow | null;
    if (!existingPlayer) {
      const activeCount = await app.db.gameSessionPlayer.count({ where: { sessionId: id, leftAt: null } });
      if (activeCount >= session.maxPlayers) throw AppError.conflict('Session is full');
      await app.db.gameSessionPlayer.create({ data: { sessionId: id, userId } });
    }

    let factionId = body.factionId;
    if (factionId) {
      if (!(factionId in rts.factionAssignments)) throw AppError.badRequest(`Unknown faction '${factionId}'`);
      const holder = rts.factionAssignments[factionId];
      if (holder && holder !== userId) throw AppError.conflict(`Faction '${factionId}' is already taken`);
    } else {
      // No faction requested: an idempotent re-join (e.g. a page reload re-calling this route)
      // keeps whatever faction this user already holds, rather than reassigning them to a
      // different open one and freeing the faction they were already playing.
      const alreadyHeld = Object.entries(rts.factionAssignments).find(([, holder]) => holder === userId)?.[0];
      const open = alreadyHeld ?? Object.entries(rts.factionAssignments).find(([, holder]) => holder === null)?.[0];
      if (!open) throw AppError.conflict('No open factions remain — every faction is already human-controlled');
      factionId = open;
    }
    // Switching factions (or re-joining the one you already hold) frees any faction this user
    // previously held, then un-readies them — a faction swap after readying up must be re-confirmed.
    for (const fid of Object.keys(rts.factionAssignments)) {
      if (rts.factionAssignments[fid] === userId) rts.factionAssignments[fid] = null;
    }
    rts.factionAssignments[factionId] = userId;
    rts.readyUserIds = rts.readyUserIds.filter((u) => u !== userId);
    rts.updatedAt = new Date().toISOString();
    await rtsStore.set(id, rts);

    const playerRows = (await app.db.gameSessionPlayer.findMany({ where: { sessionId: id, leftAt: null } })) as GameSessionPlayerRow[];
    await syncLiveState(session, playerRows.map((p) => p.userId));

    return { session: await serializeSession(session), rts: serializeRtsRecord(rts) };
  });

  app.post('/sessions/:id/rts/ready', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { session } = await loadSessionOrThrow(id);
    if (session.mode !== 'RTS') throw AppError.badRequest('This session was not created as an RTS match');
    const rts = await rtsStore.get(id);
    if (!rts) throw AppError.notFound('RTS session', id);
    const userId = request.user!.userId;

    if (session.status !== 'LOBBY') {
      // Already started (or ended) — idempotent no-op rather than an error, so a client that
      // double-fires "ready" right as RTS_MATCH_START lands doesn't see a spurious failure.
      return { session: await serializeSession(session), rts: serializeRtsRecord(rts), started: session.status === 'RUNNING' };
    }

    const humanUserIds = Object.values(rts.factionAssignments).filter((v): v is string => v !== null);
    if (!humanUserIds.includes(userId)) throw AppError.forbidden('Pick a faction (POST /sessions/:id/rts/join) before readying up');
    if (!rts.readyUserIds.includes(userId)) rts.readyUserIds.push(userId);
    rts.updatedAt = new Date().toISOString();
    await rtsStore.set(id, rts);

    const allReady = humanUserIds.length > 0 && humanUserIds.every((u) => rts.readyUserIds.includes(u));
    if (!allReady) {
      return { session: await serializeSession(session), rts: serializeRtsRecord(rts), started: false };
    }

    const updated = (await app.db.gameSession.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } })) as GameSessionRow;
    await syncLiveState(updated, humanUserIds);

    // Every peer calls createMatch({ seed, mapWidthM, mapDepthM, cellSizeM, factions }) with these
    // exact arguments on receipt of this broadcast — see docs/RTS-CONTRACTS.md §5.
    await app.bus.publish(
      createEvent({
        type: 'RTS_MATCH_START',
        payload: {
          sessionId: id,
          gameId: rts.gameId,
          seed: rts.seed,
          mapWidthM: rts.mapWidthM,
          mapDepthM: rts.mapDepthM,
          cellSizeM: rts.cellSizeM,
          difficulty: rts.difficulty,
          factions: factionSetupsFor(rts),
          factionAssignments: rts.factionAssignments,
        },
      }),
    );

    return { session: await serializeSession(updated), rts: serializeRtsRecord(rts), started: true };
  });

  app.get('/sessions/:id/rts', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await loadSessionOrThrow(id);
    const rts = await rtsStore.get(id);
    if (!rts) throw AppError.notFound('RTS session', id);
    return serializeRtsRecord(rts);
  });

  app.post('/sessions/:id/join', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { session } = await loadSessionOrThrow(id);
    if (session.status === 'ENDED') throw AppError.conflict('This session has already ended');

    const existing = (await app.db.gameSessionPlayer.findFirst({ where: { sessionId: id, userId: request.user!.userId, leftAt: null } })) as GameSessionPlayerRow | null;
    if (!existing) {
      const activeCount = await app.db.gameSessionPlayer.count({ where: { sessionId: id, leftAt: null } });
      if (activeCount >= session.maxPlayers) throw AppError.conflict('Session is full');
      await app.db.gameSessionPlayer.create({ data: { sessionId: id, userId: request.user!.userId } });
    }

    const playerRows = (await app.db.gameSessionPlayer.findMany({ where: { sessionId: id, leftAt: null } })) as GameSessionPlayerRow[];
    const players = playerRows.map((p) => p.userId);
    const nextStatus = session.status === 'LOBBY' && players.length > 1 ? 'RUNNING' : session.status;
    const updated = (await app.db.gameSession.update({
      where: { id },
      data: nextStatus !== session.status ? { status: nextStatus, startedAt: new Date() } : {},
    })) as GameSessionRow;
    await syncLiveState(updated, players);
    return serializeSession(updated);
  });

  app.post('/sessions/:id/end', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { session } = await loadSessionOrThrow(id);
    const now = new Date();
    await app.db.gameSessionPlayer.updateMany({ where: { sessionId: id, leftAt: null }, data: { leftAt: now } });
    const updated = (await app.db.gameSession.update({ where: { id }, data: { status: 'ENDED', endedAt: now } })) as GameSessionRow;
    await syncLiveState(updated, []);

    const startedAt = updated.startedAt ?? updated.createdAt;
    const durationS = Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000));
    const playerRows = (await app.db.gameSessionPlayer.findMany({ where: { sessionId: id } })) as GameSessionPlayerRow[];
    await app.bus.publish(createEvent({ type: 'GAME_SESSION_ENDED', payload: { sessionId: id, gameId: updated.gameId, durationS, players: playerRows.length } }));
    return serializeSession(updated);
  });

  app.get('/sessions/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const { session } = await loadSessionOrThrow(id);
    return serializeSession(session);
  });

  // ---- Saves ----

  app.get('/games/:id/saves/:playerId', { preHandler: [app.authenticate] }, async (request) => {
    const { id, playerId } = request.params as { id: string; playerId: string };
    await getGameOrThrow(id);
    const query = request.query as { slot?: string };
    const slot = query.slot ? Number(query.slot) : 0;
    const save = (await app.db.gameSave.findFirst({ where: { gameId: id, playerId, slot } })) as GameSaveRow | null;
    if (!save) throw AppError.notFound('Save');
    return serializeSave(save);
  });

  app.put('/games/:id/saves/:playerId', { preHandler: [app.authenticate] }, async (request) => {
    const { id, playerId } = request.params as { id: string; playerId: string };
    const game = await getGameOrThrow(id);
    const isSelf = request.user!.userId === playerId;
    if (!isSelf && !canAccessGame(game, request.user!)) throw AppError.forbidden('You can only write your own save');
    const body = SaveBodySchema.parse(request.body ?? {});

    const existing = (await app.db.gameSave.findFirst({ where: { gameId: id, playerId, slot: body.slot } })) as GameSaveRow | null;
    const save = existing
      ? ((await app.db.gameSave.update({ where: { id: existing.id }, data: { data: body.data, version: { increment: 1 } } })) as GameSaveRow)
      : ((await app.db.gameSave.create({ data: { gameId: id, playerId, slot: body.slot, data: body.data, version: 1 } })) as GameSaveRow);
    return serializeSave(save);
  });

  // ---- Leaderboard ----

  app.get('/games/:id/leaderboard', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    await getGameOrThrow(id);
    const query = LeaderboardQuerySchema.parse(request.query ?? {});
    const rows = (await app.db.leaderboardEntry.findMany({
      where: { gameId: id, board: query.board },
      orderBy: { score: 'desc' },
      take: query.limit,
    })) as LeaderboardEntryRow[];
    return { items: rows.map(serializeLeaderboardEntry) };
  });

  app.post('/games/:id/leaderboard', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await getGameOrThrow(id);
    const body = LeaderboardSubmitSchema.parse(request.body ?? {});
    const entry = (await app.db.leaderboardEntry.create({
      data: {
        gameId: id,
        board: body.board,
        playerId: body.playerId ?? request.user!.userId,
        score: body.score,
        metadata: body.metadata ?? undefined,
        // `achievedAt` carries a schema-level `@default(now())` (see prisma/schema.prisma) rather
        // than one of the two universal conventions (`id`/`createdAt`/`updatedAt`) the fakePrisma
        // test double auto-fills — pass it explicitly so it's set the same way against a real
        // Postgres client and against fakePrisma.
        achievedAt: new Date(),
      },
    })) as LeaderboardEntryRow;
    reply.status(201);
    return serializeLeaderboardEntry(entry);
  });
}
