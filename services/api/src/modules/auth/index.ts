// auth module (§3, §9): dev login, Firebase exchange, refresh, /auth/me, API key issuance.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import type { PlanTier, Role } from '@prisma/client';
import { AppError } from '../../errors.js';
import {
  generateApiKey,
  generateRefreshToken,
  hashToken,
  signAccessToken,
  verifyFirebaseIdToken,
} from '../../plugins/auth.js';
import type { AuthContext, UserRow } from '../../types.js';

const DevLoginSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80).optional(),
});

const FirebaseLoginSchema = z.object({ idToken: z.string().min(1) });
const RefreshSchema = z.object({ refreshToken: z.string().min(1) });
const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    tier: user.tier,
    roles: user.roles,
    orgId: user.orgId ?? null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function contextFromUser(user: UserRow): AuthContext {
  const ctx: AuthContext = { userId: user.id, roles: user.roles, tier: user.tier };
  if (user.orgId) ctx.orgId = user.orgId;
  return ctx;
}

function slugifyHandle(email: string): string {
  const local = email.split('@')[0] ?? 'creator';
  const cleaned = local.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'creator';
}

export async function registerAuthModule(app: FastifyInstance): Promise<void> {
  async function uniqueHandle(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    // Small bounded loop: collisions are rare and the suffix space is large.
    while (await app.db.user.findUnique({ where: { handle: candidate } })) {
      attempt += 1;
      candidate = `${base}_${randomBytes(3).toString('hex')}`;
      if (attempt > 8) throw AppError.internal('Could not allocate a unique handle');
    }
    return candidate;
  }

  async function issueSession(user: UserRow) {
    const ctx = contextFromUser(user);
    const accessToken = signAccessToken(ctx, app.config);
    const { token: refreshToken, hash } = generateRefreshToken();
    const expiresAt = new Date(Date.now() + app.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    await app.db.refreshToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });
    return {
      tokens: { accessToken, refreshToken, expiresIn: app.config.jwtExpiresInSeconds, tokenType: 'Bearer' as const },
      user: serializeUser(user),
    };
  }

  // POST /auth/dev — dev-only shortcut login (§3). Creates the user on first use.
  app.post('/auth/dev', async (request) => {
    if (app.config.isProd) {
      throw AppError.forbidden('Dev login is disabled in production');
    }
    const body = DevLoginSchema.parse(request.body);
    let user = await app.db.user.findUnique({ where: { email: body.email } });
    if (!user) {
      const handle = await uniqueHandle(slugifyHandle(body.email));
      user = await app.db.user.create({
        data: {
          email: body.email,
          handle,
          displayName: body.displayName ?? handle,
          emailVerified: true,
          roles: ['player'] as Role[],
          tier: 'STARTER' as PlanTier,
        },
      });
      await app.bus.publish(createEvent({ type: 'USER_REGISTERED', payload: { userId: user.id, email: user.email, tier: user.tier as PlanTier } }));
    }
    return issueSession(user);
  });

  // POST /auth/firebase — exchange a Firebase ID token for a GameWorld JWT session.
  app.post('/auth/firebase', async (request) => {
    const body = FirebaseLoginSchema.parse(request.body);
    const identity = await verifyFirebaseIdToken(app.config, body.idToken);

    let user = await app.db.user.findUnique({ where: { firebaseUid: identity.uid } });
    if (!user && identity.email) {
      user = await app.db.user.findUnique({ where: { email: identity.email } });
      if (user && !user.firebaseUid) {
        user = await app.db.user.update({ where: { id: user.id }, data: { firebaseUid: identity.uid } });
      }
    }
    if (!user) {
      const email = identity.email ?? `${identity.uid}@firebase.local`;
      const handle = await uniqueHandle(slugifyHandle(email));
      user = await app.db.user.create({
        data: {
          email,
          handle,
          displayName: identity.name ?? handle,
          firebaseUid: identity.uid,
          emailVerified: identity.emailVerified,
          roles: ['player'] as Role[],
          tier: 'STARTER' as PlanTier,
        },
      });
      await app.bus.publish(createEvent({ type: 'USER_REGISTERED', payload: { userId: user.id, email: user.email, tier: user.tier as PlanTier } }));
    }
    return issueSession(user);
  });

  // POST /auth/refresh — rotate a refresh token for a new access + refresh token pair.
  app.post('/auth/refresh', async (request) => {
    const body = RefreshSchema.parse(request.body);
    const tokenHash = hashToken(body.refreshToken);
    const record = await app.db.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token is invalid or expired');
    }
    const user = await app.db.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) throw AppError.unauthorized('User no longer exists');

    await app.db.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
    return issueSession(user);
  });

  // GET /auth/me
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = await app.db.user.findUnique({ where: { id: request.user!.userId } });
    if (!user || user.deletedAt) throw AppError.notFound('User');
    return serializeUser(user);
  });

  // GET /auth/api-keys — list the caller's own keys (never returns hashedKey).
  app.get('/auth/api-keys', { preHandler: [app.authenticate] }, async (request) => {
    const keys = await app.db.apiKey.findMany({ where: { userId: request.user!.userId }, orderBy: { createdAt: 'desc' } });
    return {
      items: keys.map((k: { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: Date | null; createdAt: Date; expiresAt: Date | null; revokedAt: Date | null }) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
        expiresAt: k.expiresAt?.toISOString() ?? null,
        revoked: k.revokedAt !== null,
      })),
    };
  });

  // POST /auth/api-keys — mint a new key; the raw `key` is returned exactly once.
  app.post('/auth/api-keys', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateApiKeySchema.parse(request.body);
    const { key, prefix, hash } = generateApiKey(app.config);
    const created = await app.db.apiKey.create({
      data: {
        userId: request.user!.userId,
        name: body.name,
        prefix,
        hashedKey: hash,
        scopes: body.scopes,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    reply.status(201);
    return {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      scopes: created.scopes,
      lastUsedAt: null,
      createdAt: created.createdAt.toISOString(),
      expiresAt: created.expiresAt?.toISOString() ?? null,
      key,
    };
  });

  // DELETE /auth/api-keys/:id — revoke (soft-delete) an API key owned by the caller.
  app.delete('/auth/api-keys/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await app.db.apiKey.findUnique({ where: { id } });
    if (!record || record.userId !== request.user!.userId) {
      throw AppError.notFound('API key');
    }
    await app.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    reply.status(204);
    return null;
  });
}
