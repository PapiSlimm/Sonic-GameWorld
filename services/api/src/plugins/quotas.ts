// PLAN tier limit enforcement (§4 of CONTRACTS.md). Registered as `fastify.quotas`; other
// modules (worlds, assets, org membership — owned by other agents) call these before creating
// a row that counts against a plan limit. `-1` in PLAN means unlimited.
import fp from 'fastify-plugin';
import { PLAN, isUnlimited, type PlanTier } from '@sonic-gameworld/world-schema';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import type { PrismaLike } from '../db.js';
import type { QuotaHelpers } from '../types.js';

export { PLAN, isUnlimited };

/** Pure comparison — used directly in unit tests without a database. */
export function checkQuota(current: number, limit: number): { ok: boolean; limit: number; current: number } {
  return { ok: isUnlimited(limit) || current < limit, limit, current };
}

export function buildQuotaHelpers(prisma: PrismaLike): QuotaHelpers {
  async function assertProjectQuota(ownerId: string, tier: PlanTier): Promise<void> {
    const limit = PLAN[tier].projects;
    if (isUnlimited(limit)) return;
    const current = await prisma.world.count({ where: { ownerId, deletedAt: null } });
    const result = checkQuota(current, limit);
    if (!result.ok) {
      throw AppError.quotaExceeded(`Plan ${tier} allows at most ${limit} project(s); you have ${current}. Upgrade to create more.`, result);
    }
  }

  async function assertAssetQuota(ownerId: string, tier: PlanTier): Promise<void> {
    const limit = PLAN[tier].assets;
    if (isUnlimited(limit)) return;
    const current = await prisma.asset.count({ where: { creatorId: ownerId, deletedAt: null } });
    const result = checkQuota(current, limit);
    if (!result.ok) {
      throw AppError.quotaExceeded(`Plan ${tier} allows at most ${limit} asset(s); you have ${current}. Upgrade to upload more.`, result);
    }
  }

  async function assertTeamQuota(orgId: string, tier: PlanTier): Promise<void> {
    const limit = PLAN[tier].teamMembers;
    if (isUnlimited(limit)) return;
    const current = await prisma.orgMember.count({ where: { orgId } });
    const result = checkQuota(current, limit);
    if (!result.ok) {
      throw AppError.quotaExceeded(`Plan ${tier} allows at most ${limit} team member(s); this org has ${current}. Upgrade to add more.`, result);
    }
  }

  return { assertProjectQuota, assertAssetQuota, assertTeamQuota };
}

async function quotasPlugin(app: FastifyInstance): Promise<void> {
  app.decorate('quotas', buildQuotaHelpers(app.db));
}

// NOTE: must be registered after `app.decorate('db', ...)` has run (see src/app.ts) — `app.db`
// is read eagerly here, once, to build the closures.
export default fp(quotasPlugin, { name: 'quotas' });
