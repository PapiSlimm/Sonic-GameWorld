// assets module (CONTRACTS.md §9/§13): creator-uploaded 3D models/textures/audio/etc. Owns
// `Asset` + `AssetVersion` + `AssetVariantFile` + `AssetPassport`. Upload is two-step, matching
// every other presigned-upload flow in the spec: the client asks this module for a presigned S3
// PUT URL (never uploading bytes through this API), PUTs the file directly to storage, then tells
// this module the upload is done — which is when the real ingestion pipeline
// (workers/asset-processing, queue `asset.process`) gets enqueued. See that worker's README for
// the exact pipeline stage order (UPLOAD -> ... -> MARKETPLACE).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import type { PrismaLike } from '../../db.js';
import type { AuthContext } from '../../types.js';
import { uniqueSlug } from '../products/slug.js';

const AssetTypeSchema = z.enum(['MODEL', 'TEXTURE', 'MATERIAL', 'AUDIO', 'VIDEO', 'ANIMATION', 'ARCHIVE', 'IMAGE', 'OTHER']);

const UploadUrlBodySchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

const CreateAssetSchema = z.object({
  name: z.string().min(1).max(120),
  type: AssetTypeSchema.default('MODEL'),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  fileKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  version: z.string().min(1).max(40).default('1.0.0'),
});

const CreateAssetVersionSchema = z.object({
  fileKey: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  version: z.string().min(1).max(40),
});

// ---------------------------------------------------------------------------------------------
// Row shapes (see src/types.ts's header comment on why these are hand-declared rather than
// imported from a generated-client model type).
// ---------------------------------------------------------------------------------------------

interface AssetRow {
  id: string;
  creatorId: string;
  orgId: string | null;
  name: string;
  slug: string;
  type: string;
  status: string;
  description: string | null;
  tags: string[];
  currentVersionId: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  sizeBytes: number;
  polyCount: number | null;
  qualityScore: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface AssetVersionRow {
  id: string;
  assetId: string;
  version: string;
  fileKey: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  pipeline: unknown;
  status: string;
  createdAt: Date;
}

interface AssetVariantFileRow {
  id: string;
  versionId: string;
  variant: string;
  url: string;
  sizeBytes: number;
  polyCount: number | null;
  textureMaxPx: number | null;
  format: string;
  createdAt: Date;
}

interface AssetPassportRow {
  id: string;
  assetId: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function serializeAsset(asset: AssetRow) {
  return {
    id: asset.id,
    creatorId: asset.creatorId,
    orgId: asset.orgId,
    name: asset.name,
    slug: asset.slug,
    type: asset.type,
    status: asset.status,
    description: asset.description ?? null,
    tags: asset.tags,
    currentVersionId: asset.currentVersionId,
    thumbnailUrl: asset.thumbnailUrl ?? null,
    previewUrl: asset.previewUrl ?? null,
    sizeBytes: asset.sizeBytes,
    polyCount: asset.polyCount ?? null,
    qualityScore: asset.qualityScore ?? null,
    createdAt: new Date(asset.createdAt).toISOString(),
    updatedAt: new Date(asset.updatedAt).toISOString(),
  };
}

function serializeAssetVersion(version: AssetVersionRow) {
  return {
    id: version.id,
    assetId: version.assetId,
    version: version.version,
    fileKey: version.fileKey,
    fileName: version.fileName,
    sizeBytes: version.sizeBytes,
    mimeType: version.mimeType,
    pipeline: version.pipeline,
    status: version.status,
    createdAt: new Date(version.createdAt).toISOString(),
  };
}

function serializeVariant(variant: AssetVariantFileRow) {
  return {
    id: variant.id,
    versionId: variant.versionId,
    variant: variant.variant,
    url: variant.url,
    sizeBytes: variant.sizeBytes,
    polyCount: variant.polyCount ?? null,
    textureMaxPx: variant.textureMaxPx ?? null,
    format: variant.format,
    createdAt: new Date(variant.createdAt).toISOString(),
  };
}

function serializePassport(passport: AssetPassportRow) {
  return {
    id: passport.id,
    assetId: passport.assetId,
    data: passport.data,
    createdAt: new Date(passport.createdAt).toISOString(),
    updatedAt: new Date(passport.updatedAt).toISOString(),
  };
}

/** Convenience wrapper over `uniqueSlug` (products/slug.ts) for `Asset.slug`. */
async function uniqueAssetSlug(prisma: PrismaLike, name: string): Promise<string> {
  return uniqueSlug(name, async (candidate) => Boolean(await prisma.asset.findUnique({ where: { slug: candidate } })));
}

async function getAssetOrThrow(app: FastifyInstance, id: string): Promise<AssetRow> {
  const asset = (await app.db.asset.findUnique({ where: { id } })) as AssetRow | null;
  if (!asset || asset.deletedAt) throw AppError.notFound('Asset', id);
  return asset;
}

/** Read access: a published asset is visible to everyone; an in-progress/private one is visible
 * only to its creator, an org-mate (when the asset belongs to an org), or a platform admin. */
function canAccessAsset(asset: Pick<AssetRow, 'creatorId' | 'orgId' | 'status'>, user: AuthContext): boolean {
  if (asset.status === 'PUBLISHED') return true;
  if (asset.creatorId === user.userId) return true;
  if (asset.orgId && asset.orgId === user.orgId) return true;
  return user.roles.includes('platform_admin');
}

/** Write access (new versions, publish): creator, an org-mate, or a platform admin. */
function canWriteAsset(asset: Pick<AssetRow, 'creatorId' | 'orgId'>, user: AuthContext): boolean {
  if (asset.creatorId === user.userId) return true;
  if (asset.orgId && asset.orgId === user.orgId) return true;
  return user.roles.includes('platform_admin');
}

export async function registerAssetsModule(app: FastifyInstance): Promise<void> {
  // POST /assets/upload-url — mint a presigned S3 PUT URL the client uploads directly to.
  app.post('/assets/upload-url', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const body = UploadUrlBodySchema.parse(request.body);
    await app.quotas.assertAssetQuota(user.userId, user.tier);
    return app.storage.getUploadUrl({
      fileName: body.fileName,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      prefix: `assets/${user.userId}`,
    });
  });

  // POST /assets — register the just-uploaded object as a new Asset + its first AssetVersion,
  // then hand off to the ingestion pipeline.
  app.post('/assets', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;
    const body = CreateAssetSchema.parse(request.body);
    await app.quotas.assertAssetQuota(user.userId, user.tier);

    const slug = await uniqueAssetSlug(app.db, body.name);
    const asset = (await app.db.asset.create({
      data: {
        creatorId: user.userId,
        orgId: user.orgId ?? null,
        name: body.name,
        slug,
        type: body.type,
        status: 'UPLOADING',
        description: body.description ?? null,
        tags: body.tags,
        currentVersionId: null,
        thumbnailUrl: null,
        previewUrl: null,
        sizeBytes: body.sizeBytes,
        polyCount: null,
        qualityScore: null,
      },
    })) as AssetRow;

    const version = (await app.db.assetVersion.create({
      data: {
        assetId: asset.id,
        version: body.version,
        fileKey: body.fileKey,
        fileName: body.fileName,
        sizeBytes: body.sizeBytes,
        mimeType: body.mimeType,
        pipeline: [],
        status: 'PROCESSING',
      },
    })) as AssetVersionRow;

    const updated = (await app.db.asset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id, status: 'PROCESSING' },
    })) as AssetRow;

    await app.queues.assetProcess.add('process', {
      assetId: asset.id,
      versionId: version.id,
      fileKey: body.fileKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      creatorId: user.userId,
    });
    await app.bus.publish(
      createEvent({
        type: 'ASSET_UPLOADED',
        actorId: user.userId,
        payload: { assetId: asset.id, versionId: version.id, creatorId: user.userId, fileName: body.fileName, sizeBytes: body.sizeBytes },
      }),
    );

    reply.status(201);
    return { asset: serializeAsset(updated), version: serializeAssetVersion(version) };
  });

  // GET /assets — the caller's own assets (plus their org's, when they belong to one).
  app.get('/assets', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user!;
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const where: Record<string, unknown> = user.orgId
      ? { OR: [{ creatorId: user.userId }, { orgId: user.orgId }], deletedAt: null }
      : { creatorId: user.userId, deletedAt: null };
    const rows = (await app.db.asset.findMany({ where, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) })) as AssetRow[];
    return toPage(rows.map(serializeAsset), query);
  });

  // GET /assets/:id
  app.get('/assets/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const asset = await getAssetOrThrow(app, id);
    if (!canAccessAsset(asset, request.user!)) throw AppError.notFound('Asset', id);
    return serializeAsset(asset);
  });

  // GET /assets/:id/passport — 404 until AI_TAGGING/QUALITY_SCORE have run and a passport exists.
  app.get('/assets/:id/passport', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const asset = await getAssetOrThrow(app, id);
    if (!canAccessAsset(asset, request.user!)) throw AppError.notFound('Asset', id);
    const passport = (await app.db.assetPassport.findUnique({ where: { assetId: id } })) as AssetPassportRow | null;
    if (!passport) throw AppError.notFound('AssetPassport', id);
    return serializePassport(passport);
  });

  // POST /assets/:id/versions — new version on an existing asset; same upload+enqueue flow as
  // POST /assets, linked to the existing Asset row.
  app.post('/assets/:id/versions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asset = await getAssetOrThrow(app, id);
    const user = request.user!;
    if (!canWriteAsset(asset, user)) throw AppError.forbidden('You do not have write access to this asset');

    const body = CreateAssetVersionSchema.parse(request.body);
    const existing = await app.db.assetVersion.findFirst({ where: { assetId: id, version: body.version } });
    if (existing) throw AppError.conflict(`Version '${body.version}' already exists for this asset`);

    const version = (await app.db.assetVersion.create({
      data: {
        assetId: id,
        version: body.version,
        fileKey: body.fileKey,
        fileName: body.fileName,
        sizeBytes: body.sizeBytes,
        mimeType: body.mimeType,
        pipeline: [],
        status: 'PROCESSING',
      },
    })) as AssetVersionRow;

    const updated = (await app.db.asset.update({
      where: { id },
      data: { currentVersionId: version.id, status: 'PROCESSING', sizeBytes: body.sizeBytes },
    })) as AssetRow;

    await app.queues.assetProcess.add('process', {
      assetId: id,
      versionId: version.id,
      fileKey: body.fileKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      creatorId: asset.creatorId,
    });
    await app.bus.publish(
      createEvent({
        type: 'ASSET_UPLOADED',
        actorId: user.userId,
        payload: { assetId: id, versionId: version.id, creatorId: asset.creatorId, fileName: body.fileName, sizeBytes: body.sizeBytes },
      }),
    );

    reply.status(201);
    return { asset: serializeAsset(updated), version: serializeAssetVersion(version) };
  });

  // POST /assets/:id/publish — only once the current version's pipeline has completed (READY).
  app.post('/assets/:id/publish', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const asset = await getAssetOrThrow(app, id);
    const user = request.user!;
    if (!canWriteAsset(asset, user)) throw AppError.forbidden('You do not have write access to this asset');
    if (!asset.currentVersionId) throw AppError.unprocessable('This asset has no uploaded version to publish');

    const version = (await app.db.assetVersion.findUnique({ where: { id: asset.currentVersionId } })) as AssetVersionRow | null;
    if (!version || version.status !== 'READY') {
      throw AppError.unprocessable(`The current version is not ready to publish yet (status: ${version?.status ?? 'MISSING'})`);
    }

    const updated = (await app.db.asset.update({ where: { id }, data: { status: 'PUBLISHED' } })) as AssetRow;

    await app.queues.moderationScan.add('scan', {
      refKind: 'ASSET',
      refId: id,
      content: { text: [updated.name, updated.description ?? ''].filter(Boolean).join('\n') },
    });
    await app.bus.publish(createEvent({ type: 'ASSET_PUBLISHED', actorId: user.userId, payload: { assetId: id, creatorId: updated.creatorId } }));

    return serializeAsset(updated);
  });

  // GET /assets/:id/variants — the current version's generated AssetVariantFile rows.
  app.get('/assets/:id/variants', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const asset = await getAssetOrThrow(app, id);
    if (!canAccessAsset(asset, request.user!)) throw AppError.notFound('Asset', id);
    if (!asset.currentVersionId) return { items: [] };
    const rows = (await app.db.assetVariantFile.findMany({ where: { versionId: asset.currentVersionId } })) as AssetVariantFileRow[];
    return { items: rows.map(serializeVariant) };
  });
}
