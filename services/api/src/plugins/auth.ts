// Authentication plugin (§3 of CONTRACTS.md): JWT bearer tokens, `x-api-key`, dev login, and
// Firebase ID-token exchange. Decorates `request.user`, `fastify.authenticate`,
// `fastify.requireRole`, and `fastify.requirePermission`. Route handlers for `/auth/*` live in
// src/modules/auth — this plugin only owns the primitives + request-lifecycle wiring.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PlanTier, Role } from '@prisma/client';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { AuthContext, Permission } from '../types.js';
import { hasPermission, hasRole } from './rbac.js';

export interface JwtClaims {
  sub: string;
  org?: string;
  roles: Role[];
  tier: PlanTier;
  apiKeyId?: string;
}

function isJwtClaims(v: unknown): v is JwtClaims {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.sub === 'string' && Array.isArray(o.roles) && typeof o.tier === 'string';
}

/** Sign a GameWorld access token for an authenticated context. */
export function signAccessToken(ctx: AuthContext, config: AppConfig): string {
  const claims: JwtClaims = { sub: ctx.userId, roles: ctx.roles, tier: ctx.tier };
  if (ctx.orgId) claims.org = ctx.orgId;
  if (ctx.apiKeyId) claims.apiKeyId = ctx.apiKeyId;
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

/** Verify + decode a GameWorld access token into an AuthContext. Throws on invalid/expired tokens. */
export function verifyAccessToken(token: string, config: AppConfig): AuthContext {
  const decoded: unknown = jwt.verify(token, config.jwtSecret);
  if (!isJwtClaims(decoded)) throw new Error('Malformed token claims');
  const ctx: AuthContext = { userId: decoded.sub, roles: decoded.roles, tier: decoded.tier };
  if (decoded.org) ctx.orgId = decoded.org;
  if (decoded.apiKeyId) ctx.apiKeyId = decoded.apiKeyId;
  return ctx;
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Opaque refresh token: the raw value is returned to the client once; only its hash is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

/** `gw_live_<random>` API key: `prefix` (first N chars, fast DB lookup) + sha256 `hash` (stored). */
export function generateApiKey(config: AppConfig): { key: string; prefix: string; hash: string } {
  const random = randomBytes(24).toString('hex');
  const key = `${config.apiKeyPrefix}${random}`;
  const prefix = key.slice(0, config.apiKeyPrefix.length + 8);
  return { key, prefix, hash: hashToken(key) };
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function resolveApiKeyAuth(app: FastifyInstance, presentedKey: string): Promise<AuthContext | null> {
  if (!presentedKey.startsWith(app.config.apiKeyPrefix)) return null;
  const prefixLen = app.config.apiKeyPrefix.length + 8;
  const prefix = presentedKey.slice(0, prefixLen);
  const record = (await app.db.apiKey.findFirst({ where: { prefix } })) as {
    id: string;
    userId: string;
    hashedKey: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;
  if (!safeEqualHex(hashToken(presentedKey), record.hashedKey)) return null;

  const user = (await app.db.user.findUnique({ where: { id: record.userId } })) as {
    id: string;
    orgId: string | null;
    roles: Role[];
    tier: PlanTier;
    deletedAt: Date | null;
  } | null;
  if (!user || user.deletedAt) return null;

  // Fire-and-forget last-used bookkeeping; must never fail the request.
  void app.db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  const ctx: AuthContext = { userId: user.id, roles: user.roles, tier: user.tier, apiKeyId: record.id };
  if (user.orgId) ctx.orgId = user.orgId;
  return ctx;
}

async function resolveRequestUser(app: FastifyInstance, request: FastifyRequest): Promise<AuthContext | null> {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      return verifyAccessToken(authHeader.slice('Bearer '.length), app.config);
    } catch {
      return null;
    }
  }
  const apiKeyHeader = request.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;
  if (apiKey) {
    try {
      return await resolveApiKeyAuth(app, apiKey);
    } catch {
      return null;
    }
  }
  return null;
}

// ---- Firebase ID token exchange (§3: POST /v1/auth/firebase) ----
export interface FirebaseVerifiedIdentity {
  uid: string;
  email?: string;
  name?: string;
  emailVerified: boolean;
}

let firebaseAppPromise: Promise<unknown> | undefined;

async function getFirebaseApp(config: AppConfig): Promise<unknown> {
  if (!firebaseAppPromise) {
    firebaseAppPromise = (async () => {
      // Lazy import: most dev/test environments never touch Firebase, so keep it out of the
      // request path (and out of the module graph) until actually needed.
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const existing = getApps();
      if (existing.length > 0) return existing[0];
      if (config.firebase.serviceAccountJson) {
        const serviceAccount: Record<string, unknown> = JSON.parse(config.firebase.serviceAccountJson);
        return initializeApp({ credential: cert(serviceAccount as never) });
      }
      if (config.firebase.clientEmail && config.firebase.privateKey && config.firebase.projectId) {
        // The FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY triple (root
        // .env.example convention) — privateKey commonly arrives with literal `\n` sequences
        // from a single-line env value, so unescape them.
        return initializeApp({
          credential: cert({
            projectId: config.firebase.projectId,
            clientEmail: config.firebase.clientEmail,
            privateKey: config.firebase.privateKey.replace(/\\n/g, '\n'),
          }),
        });
      }
      // Falls back to Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS,
      // metadata server, etc.) — works in most cloud deployments with no extra config.
      return initializeApp({ projectId: config.firebase.projectId });
    })();
  }
  return firebaseAppPromise;
}

/** Verify a Firebase ID token via firebase-admin (lazily imported). Throws AppError.unauthorized on failure. */
export async function verifyFirebaseIdToken(config: AppConfig, idToken: string): Promise<FirebaseVerifiedIdentity> {
  try {
    const app = await getFirebaseApp(config);
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(app as never).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: (decoded as Record<string, unknown>).name as string | undefined,
      emailVerified: decoded.email_verified ?? false,
    };
  } catch (err) {
    throw AppError.unauthorized(`Invalid Firebase ID token: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    request.user = await resolveRequestUser(app, request);
  });

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) throw AppError.unauthorized();
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.user) throw AppError.unauthorized();
      if (!hasRole(request.user.roles, roles)) {
        throw AppError.forbidden(`Requires one of roles: ${roles.join(', ')}`);
      }
    };
  });

  app.decorate('requirePermission', (...permissions: Permission[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.user) throw AppError.unauthorized();
      const missing = permissions.filter((p) => !hasPermission(request.user!.roles, p));
      if (missing.length > 0) {
        throw AppError.forbidden(`Missing required permission(s): ${missing.join(', ')}`);
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth' });
