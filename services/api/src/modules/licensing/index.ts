// licensing module (§9): read a specific license grant, list every grant issued for a product
// (creator/admin only — grant rows carry `buyerId`), and the compatibility-check engine
// (`POST /licenses/check`) wrapping `@sonic-gameworld/world-schema`'s `checkLicenseCompatibility`
// (§6). `ProductLicense` rows themselves are written by `orders/fulfillment.ts` at the moment an
// order is marked PAID — this module is purely the read + compatibility-check side.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checkLicenseCompatibility, type LicenseIntent, type LicenseRecord } from '@sonic-gameworld/world-schema';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';

const LicenseIntentSchema = z.object({
  commercial: z.boolean().default(false),
  multiplayer: z.boolean().default(false),
  redistribute: z.boolean().default(false),
  modify: z.boolean().default(false),
  aiTraining: z.boolean().optional(),
  resale: z.boolean().optional(),
  sublicense: z.boolean().optional(),
  enterprise: z.boolean().optional(),
  seats: z.number().int().positive().optional(),
});

// Mirrors LicenseRecord (world-schema/src/schema.ts) exactly so a caller can pass an ad-hoc
// license (e.g. a third-party asset's terms not yet in the DB) alongside/instead of `productIds`.
const LicenseRecordSchema = z.object({
  id: z.string(),
  commercial: z.boolean(),
  personal: z.boolean(),
  enterprise: z.boolean(),
  redistribution: z.boolean(),
  modification: z.boolean(),
  multiplayer: z.boolean(),
  aiTraining: z.boolean(),
  resale: z.boolean(),
  sublicensing: z.boolean(),
  attribution: z.boolean(),
  attributionText: z.string().optional(),
  seats: z.number().int().positive().optional(),
  spdx: z.string().optional(),
});

const CheckBodySchema = z
  .object({
    intent: LicenseIntentSchema,
    licenses: z.array(LicenseRecordSchema).optional(),
    productIds: z.array(z.string()).max(50).optional(),
  })
  .refine((b) => (b.licenses && b.licenses.length > 0) || (b.productIds && b.productIds.length > 0), {
    message: 'Provide at least one of `licenses` or `productIds`',
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeGrant(row: any) {
  return {
    id: row.id,
    productId: row.productId,
    buyerId: row.buyerId ?? null,
    record: row.record as LicenseRecord,
    seats: row.seats ?? null,
    grantedAt: new Date(row.grantedAt).toISOString(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
  };
}

export async function registerLicensingModule(app: FastifyInstance): Promise<void> {
  // GET /licenses/:id — the buyer who holds the grant, the product's creator, or a platform admin.
  app.get('/licenses/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const grant = await app.db.productLicense.findUnique({ where: { id } });
    if (!grant) throw AppError.notFound('License', id);

    const userId = request.user!.userId;
    const isAdmin = request.user!.roles.includes('platform_admin');
    if (grant.buyerId !== userId && !isAdmin) {
      const product = await app.db.product.findUnique({ where: { id: grant.productId } });
      const profile = product ? await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } }) : null;
      if (!profile || profile.userId !== userId) throw AppError.forbidden('You do not have access to this license');
    }
    return serializeGrant(grant);
  });

  // GET /licenses/product/:productId — every grant issued for a product. Owner (via
  // CreatorProfile) or platform_admin only, since grant rows carry buyer identity.
  app.get('/licenses/product/:productId', { preHandler: [app.authenticate] }, async (request) => {
    const { productId } = request.params as { productId: string };
    const product = await app.db.product.findUnique({ where: { id: productId } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', productId);

    const userId = request.user!.userId;
    const isAdmin = request.user!.roles.includes('platform_admin');
    const profile = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
    if (!isAdmin && profile?.userId !== userId) {
      throw AppError.forbidden('Only the product creator or a platform admin may list its licenses');
    }

    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = await app.db.productLicense.findMany({ where: { productId }, orderBy: { grantedAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeGrant), query);
  });

  // POST /licenses/check — the §6 compatibility engine. Accepts explicit `licenses` and/or
  // `productIds` (resolved to each product's current `LicenseRecord`); the two combine into one
  // bundle so a caller can check "these N marketplace products + this one third-party asset,
  // together, against this intent" in a single call. Public: a buyer deciding what to purchase
  // needs this before they own anything.
  app.post('/licenses/check', async (request) => {
    const body = CheckBodySchema.parse(request.body);
    const licenses: LicenseRecord[] = [...(body.licenses ?? [])];

    if (body.productIds && body.productIds.length > 0) {
      for (const productId of body.productIds) {
        const product = await app.db.product.findUnique({ where: { id: productId } });
        if (!product || product.deletedAt) throw AppError.notFound('Product', productId);
        licenses.push(product.license as LicenseRecord);
      }
    }

    const intent: LicenseIntent = body.intent;
    return checkLicenseCompatibility(licenses, intent);
  });
}
