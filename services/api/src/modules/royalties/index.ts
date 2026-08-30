// royalties module: read-side of the accrual ledger `accrual.ts` writes to (invoked from
// orders/fulfillment.ts on every paid order). Not part of the exact §9 route table verbatim, but
// a natural, additive surface: the creator module's `GET /creators/me/balance` gives a summary
// number, this gives the underlying ledger (per-tier split already applied, per line item).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { AppError } from '../../errors.js';

const RoyaltyListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['ACCRUED', 'PAID', 'REVERSED']).optional(),
  creatorId: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeRoyalty(row: any) {
  return {
    id: row.id,
    creatorId: row.creatorId,
    orderItemId: row.orderItemId ?? null,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
  };
}

export async function registerRoyaltiesModule(app: FastifyInstance): Promise<void> {
  // GET /royalties/me — the caller's own royalty ledger.
  app.get('/royalties/me', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await app.db.creatorProfile.findUnique({ where: { userId: request.user!.userId } });
    if (!profile) throw AppError.notFound('Creator profile');

    const query = RoyaltyListQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = { creatorId: profile.id };
    if (query.status) where.status = query.status;
    const rows = await app.db.royaltyAccrual.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeRoyalty), query);
  });

  // GET /royalties — platform-wide ledger, finance/admin only.
  app.get('/royalties', { preHandler: [app.authenticate, app.requireRole('platform_admin', 'admin')] }, async (request) => {
    const query = RoyaltyListQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.creatorId) where.creatorId = query.creatorId;
    const rows = await app.db.royaltyAccrual.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeRoyalty), query);
  });
}
