// Shared cross-module types + Fastify instance/request decorator augmentation.
// Kept dependency-light so every module (ours and other agents' appended ones) can import it.
import type { PlanTier, Role } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { EventBus } from './bus.js';
import type { PrismaLike } from './db.js';
import type { Queues } from './queues.js';
import type { SearchService } from './search.js';
import type { StorageService } from './storage.js';
import type { Redis } from 'ioredis';

/** Authenticated-request identity, shared by JWT bearer, x-api-key, and dev-login auth. */
export interface AuthContext {
  userId: string;
  orgId?: string;
  roles: Role[];
  tier: PlanTier;
  apiKeyId?: string;
}

export type Permission =
  | 'world:read'
  | 'world:write'
  | 'world:publish'
  | 'product:write'
  | 'org:admin'
  | 'platform:admin';

export interface QuotaHelpers {
  assertProjectQuota(ownerId: string, tier: PlanTier): Promise<void>;
  assertAssetQuota(ownerId: string, tier: PlanTier): Promise<void>;
  assertTeamQuota(orgId: string, tier: PlanTier): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    db: PrismaLike;
    bus: EventBus;
    redis: Redis;
    storage: StorageService;
    queues: Queues;
    // NOTE: named `searchService`, not `search` — Fastify reserves `.search` as an HTTP route
    // shorthand (app.search(path, handler), for the SEARCH verb) and a same-named decorator
    // conflicts with it.
    searchService: SearchService;
    quotas: QuotaHelpers;
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    requireRole(...roles: Role[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission(...permissions: Permission[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: AuthContext | null;
  }
}

export type ModuleRegistrar = (app: FastifyInstance) => Promise<void> | void;

// ---------------------------------------------------------------------------------------------
// DB row shapes. The real generated Prisma client exports a type per model (`User`,
// `Organization`, ...); the sandbox verification shim (see repo root tooling notes) only exports
// `PrismaClient` + enums, not per-model types, because it doesn't know the model shapes it's
// stubbing. These interfaces declare just the fields our modules actually read/write off a raw
// row, so route handlers get real type-checking without depending on client-generated types that
// aren't available here. On a real generated client these are structurally compatible with (a
// subset of) the generated model types, so nothing needs to change when `pnpm db:generate` runs
// for real.
// ---------------------------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  tier: PlanTier;
  roles: Role[];
  orgId: string | null;
  emailVerified: boolean;
  firebaseUid?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  tier: PlanTier;
  ownerId: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface OrgMemberRow {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  joinedAt: Date;
}
