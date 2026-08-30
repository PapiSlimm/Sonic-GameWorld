// products module (§5/§9): marketplace listings CRUD, versions, and the license builder.
// Owns `Product` + `ProductVersion`. A `Product.creatorId` always points at a `CreatorProfile`,
// never a `User` directly (matching the creator module's convention) — `getOrCreateCreatorProfile`
// below mirrors `creator/index.ts`'s own lazy-create so a first-time creator can list a product
// without a separate "activate as creator" step.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { ENGINE_TARGETS, GENRES, PRODUCT_CATEGORIES, type EngineTarget, type Genre, type LicenseRecord, type ProductCategory } from '@sonic-gameworld/world-schema';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import type { PrismaLike } from '../../db.js';
import { LicenseBuilderInputSchema, buildLicense } from './license.js';
import { uniqueProductSlug } from './slug.js';

const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES as [ProductCategory, ...ProductCategory[]]);
const GenreSchema = z.enum(GENRES as [Genre, ...Genre[]]);
const EngineTargetSchema = z.enum(ENGINE_TARGETS as [EngineTarget, ...EngineTarget[]]);
const ProductRefKindSchema = z.enum(['ASSET', 'WORLD', 'GAME', 'NPC', 'MISSION', 'SYSTEM']);

const CreateProductSchema = z.object({
  name: z.string().min(1).max(120),
  category: ProductCategorySchema,
  genre: z.array(GenreSchema).max(8).default([]),
  engines: z.array(EngineTargetSchema).min(1),
  priceCents: z.number().int().min(0).max(100_000_00),
  currency: z.string().length(3).default('USD'),
  description: z.string().min(1).max(2000),
  longDescription: z.string().max(20_000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  previewUrls: z.array(z.string().url()).max(20).default([]),
  modelPreviewUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  refKind: ProductRefKindSchema,
  refId: z.string().min(1),
  license: LicenseBuilderInputSchema.default({ preset: 'STANDARD' }),
});

const PatchProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: ProductCategorySchema.optional(),
  genre: z.array(GenreSchema).max(8).optional(),
  engines: z.array(EngineTargetSchema).min(1).optional(),
  priceCents: z.number().int().min(0).max(100_000_00).optional(),
  description: z.string().min(1).max(2000).optional(),
  longDescription: z.string().max(20_000).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  previewUrls: z.array(z.string().url()).max(20).optional(),
  modelPreviewUrl: z.string().url().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  license: LicenseBuilderInputSchema.partial().extend({ preset: LicenseBuilderInputSchema.shape.preset.optional() }).optional(),
  status: z.enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'DELISTED']).optional(),
  featured: z.boolean().optional(),
});

const CreateVersionSchema = z.object({
  version: z.string().min(1).max(40),
  changelog: z.string().max(5000).optional(),
  assetVersionId: z.string().optional(),
  worldVersionId: z.string().optional(),
  gameVersionId: z.string().optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

/** Product.creatorId always references CreatorProfile.id (never User.id directly) — mirrors the
 * lazy-create in creator/index.ts so a first product listing doubles as creator activation. */
async function getOrCreateCreatorProfile(db: PrismaLike, userId: string) {
  let profile = await db.creatorProfile.findUnique({ where: { userId } });
  if (!profile) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');
    profile = await db.creatorProfile.create({
      data: {
        userId,
        handle: user.handle,
        displayName: user.displayName,
        verified: false,
        followers: 0,
        repScore: 0,
        repQuality: 0,
        repReliability: 0,
        repSales: 0,
        repUpdates: 0,
        repReviews: 0,
        repSupport: 0,
        repOriginality: 0,
        repCompliance: 0,
        repComputedAt: new Date(),
      },
    });
  }
  return profile;
}

/** Ownership check for the entity a product wraps. `SYSTEM` has no dedicated table (it's a
 * platform-provided behavior tree reference), so it's exempt — everything else must belong to the
 * caller (or the caller must be platform_admin). */
async function assertOwnsRef(db: PrismaLike, refKind: string, refId: string, userId: string, isAdmin: boolean): Promise<void> {
  if (isAdmin || refKind === 'SYSTEM') return;
  const lookups: Record<string, () => Promise<{ ownerId?: string; creatorId?: string } | null>> = {
    ASSET: () => db.asset.findUnique({ where: { id: refId } }),
    WORLD: () => db.world.findUnique({ where: { id: refId } }),
    GAME: () => db.game.findUnique({ where: { id: refId } }),
    NPC: () => db.nPC.findUnique({ where: { id: refId } }),
    MISSION: () => db.mission.findUnique({ where: { id: refId } }),
  };
  const lookup = lookups[refKind];
  if (!lookup) return;
  const row = await lookup();
  if (!row) throw AppError.notFound(refKind, refId);
  const owner = row.ownerId ?? row.creatorId;
  if (owner !== userId) throw AppError.forbidden(`You do not own this ${refKind.toLowerCase()}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeProduct(product: any, creator?: any) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    genre: product.genre,
    engines: product.engines,
    priceCents: product.priceCents,
    currency: product.currency,
    description: product.description,
    longDescription: product.longDescription ?? null,
    tags: product.tags,
    previewUrls: product.previewUrls,
    modelPreviewUrl: product.modelPreviewUrl ?? null,
    thumbnailUrl: product.thumbnailUrl ?? null,
    license: product.license,
    refKind: product.refKind,
    refId: product.refId,
    creatorId: product.creatorId,
    creator: creator ? { id: creator.id, handle: creator.handle, displayName: creator.displayName, avatarUrl: creator.avatarUrl ?? null, verified: creator.verified } : undefined,
    status: product.status,
    featured: product.featured,
    rating: product.rating,
    ratingCount: product.ratingCount,
    sales: product.sales,
    publishedAt: product.publishedAt ? new Date(product.publishedAt).toISOString() : null,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: new Date(product.updatedAt).toISOString(),
  };
}

/** Index (or re-index) a product's searchable text into SearchDocument/OpenSearch. */
export async function indexProduct(app: FastifyInstance, product: { id: string; name: string; description: string; tags: string[]; category: string; genre: string[] }): Promise<void> {
  await app.searchService.index({
    kind: 'product',
    refId: product.id,
    text: [product.name, product.description, product.category, ...product.genre, ...product.tags].join(' '),
  });
}

export async function registerProductsModule(app: FastifyInstance): Promise<void> {
  // GET /products/:slug — public product detail page.
  app.get('/products/:slug', async (request) => {
    const { slug } = request.params as { slug: string };
    const product = await app.db.product.findUnique({ where: { slug } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', slug);
    const creator = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
    return serializeProduct(product, creator);
  });

  // POST /products — list a new product wrapping an owned world/game/asset/npc/mission (or a
  // platform SYSTEM reference).
  app.post('/products', { preHandler: [app.authenticate, app.requirePermission('product:write')] }, async (request, reply) => {
    const body = CreateProductSchema.parse(request.body);
    const userId = request.user!.userId;
    const isAdmin = request.user!.roles.includes('platform_admin');

    await assertOwnsRef(app.db, body.refKind, body.refId, userId, isAdmin);
    const profile = await getOrCreateCreatorProfile(app.db, userId);
    const slug = await uniqueProductSlug(app.db, body.name);
    const licenseId = `lic_${slug}`;

    const product = await app.db.product.create({
      data: {
        slug,
        name: body.name,
        category: body.category,
        genre: body.genre,
        engines: body.engines,
        priceCents: body.priceCents,
        currency: body.currency,
        description: body.description,
        longDescription: body.longDescription ?? null,
        tags: body.tags,
        previewUrls: body.previewUrls,
        modelPreviewUrl: body.modelPreviewUrl ?? null,
        thumbnailUrl: body.thumbnailUrl ?? null,
        license: buildLicense(body.license, licenseId),
        refKind: body.refKind,
        refId: body.refId,
        creatorId: profile.id,
        status: 'DRAFT',
        featured: false,
        rating: 0,
        ratingCount: 0,
        sales: 0,
      },
    });

    // Scan the new listing's title/description + license off the request thread
    // (workers/moderation, queue `moderation.scan`) — CONTRACTS.md §13's
    // MALWARE -> AI_SAFETY -> LICENSE -> CONTENT_POLICY -> HUMAN_REVIEW -> PUBLISH pipeline.
    await app.queues.moderationScan.add('scan', {
      refKind: 'PRODUCT',
      refId: product.id,
      content: { text: [product.name, product.description].filter(Boolean).join('\n') },
      licenses: [product.license as LicenseRecord],
    });

    reply.status(201);
    return serializeProduct(product, profile);
  });

  // PATCH /products/:id — owner or platform_admin. Publishing/delisting fires the marketplace
  // fan-out events (§7) and (re)indexes search.
  app.patch('/products/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const product = await app.db.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', id);

    const userId = request.user!.userId;
    const isAdmin = request.user!.roles.includes('platform_admin');
    const profile = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
    if (!isAdmin && (!profile || profile.userId !== userId)) throw AppError.forbidden('You do not own this product');

    const body = PatchProductSchema.parse(request.body ?? {});
    if (body.featured !== undefined && !isAdmin) throw AppError.forbidden('Only platform admins may feature a product');

    const data: Record<string, unknown> = {};
    for (const key of ['name', 'category', 'genre', 'engines', 'priceCents', 'description', 'tags', 'previewUrls', 'featured'] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.longDescription !== undefined) data.longDescription = body.longDescription;
    if (body.modelPreviewUrl !== undefined) data.modelPreviewUrl = body.modelPreviewUrl;
    if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl;
    if (body.license) {
      const merged = { ...body.license, preset: body.license.preset ?? 'STANDARD' } as z.infer<typeof LicenseBuilderInputSchema>;
      data.license = buildLicense(merged, (product.license as { id?: string })?.id ?? `lic_${product.slug}`);
    }

    const wasPublished = product.status === 'PUBLISHED';
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === 'PUBLISHED' && !wasPublished) data.publishedAt = new Date();
    }

    const updated = await app.db.product.update({ where: { id }, data });

    // Re-scan whenever the listing's user-facing content or license changed, or it's newly going
    // live — same `moderation.scan` hand-off as POST /products above.
    if (body.name !== undefined || body.description !== undefined || body.license !== undefined || (body.status === 'PUBLISHED' && !wasPublished)) {
      await app.queues.moderationScan.add('scan', {
        refKind: 'PRODUCT',
        refId: updated.id,
        content: { text: [updated.name, updated.description].filter(Boolean).join('\n') },
        licenses: [updated.license as LicenseRecord],
      });
    }

    if (body.status === 'PUBLISHED' && !wasPublished) {
      await indexProduct(app, updated);
      await app.bus.publish(createEvent({ type: 'PRODUCT_LISTED', payload: { productId: updated.id, creatorId: updated.creatorId, category: updated.category, priceCents: updated.priceCents } }));
    } else if (body.status === 'DELISTED') {
      await app.searchService.remove('product', updated.id);
      await app.bus.publish(createEvent({ type: 'PRODUCT_DELISTED', payload: { productId: updated.id } }));
    } else {
      if (updated.status === 'PUBLISHED') await indexProduct(app, updated);
      await app.bus.publish(createEvent({ type: 'PRODUCT_UPDATED', payload: { productId: updated.id } }));
    }

    return serializeProduct(updated, profile);
  });

  // POST /products/:id/versions
  app.post('/products/:id/versions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const product = await app.db.product.findUnique({ where: { id } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', id);

    const userId = request.user!.userId;
    const isAdmin = request.user!.roles.includes('platform_admin');
    const profile = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
    if (!isAdmin && (!profile || profile.userId !== userId)) throw AppError.forbidden('You do not own this product');

    const body = CreateVersionSchema.parse(request.body);
    const existing = await app.db.productVersion.findFirst({ where: { productId: id, version: body.version } });
    if (existing) throw AppError.conflict(`Version '${body.version}' already exists for this product`);

    const version = await app.db.productVersion.create({
      data: {
        productId: id,
        version: body.version,
        changelog: body.changelog ?? null,
        assetVersionId: body.assetVersionId ?? null,
        worldVersionId: body.worldVersionId ?? null,
        gameVersionId: body.gameVersionId ?? null,
        fileSizeBytes: body.fileSizeBytes ?? null,
      },
    });
    await app.bus.publish(createEvent({ type: 'PRODUCT_UPDATED', payload: { productId: id, versionId: version.id } }));

    reply.status(201);
    return {
      id: version.id,
      productId: version.productId,
      version: version.version,
      changelog: version.changelog ?? null,
      assetVersionId: version.assetVersionId ?? null,
      worldVersionId: version.worldVersionId ?? null,
      gameVersionId: version.gameVersionId ?? null,
      fileSizeBytes: version.fileSizeBytes ?? null,
      createdAt: new Date(version.createdAt).toISOString(),
    };
  });

  // GET /products/:id/versions — not in the §9 surface table verbatim but a natural read-side of
  // POST .../versions above, and every other agent's SDK expects a list endpoint per resource.
  app.get('/products/:id/versions', async (request) => {
    const { id } = request.params as { id: string };
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = await app.db.productVersion.findMany({ where: { productId: id }, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(
      rows.map((v: { id: string; productId: string; version: string; changelog: string | null; createdAt: Date }) => ({
        id: v.id,
        productId: v.productId,
        version: v.version,
        changelog: v.changelog ?? null,
        createdAt: new Date(v.createdAt).toISOString(),
      })),
      query,
    );
  });
}
