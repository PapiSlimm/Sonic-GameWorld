// Route-level tests for the assets module (CONTRACTS.md §9/§13): upload-url presigning, asset +
// version creation (asserting the `asset.process` job actually gets enqueued), read access rules,
// versions, publish gating on pipeline completion, and variants.
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

async function uploadAndCreateAsset(ctx: TestApp, auth: Record<string, string>, overrides: Record<string, unknown> = {}) {
  const uploadRes = await ctx.app.inject({
    method: 'POST',
    url: '/v1/assets/upload-url',
    headers: auth,
    payload: { fileName: 'hero.glb', contentType: 'model/gltf-binary', sizeBytes: 4096 },
  });
  expect(uploadRes.statusCode).toBe(200);
  const { fileKey } = uploadRes.json() as { fileKey: string };

  const createRes = await ctx.app.inject({
    method: 'POST',
    url: '/v1/assets',
    headers: auth,
    payload: {
      name: 'Hero Character',
      type: 'MODEL',
      description: 'A rigged hero character.',
      tags: ['character'],
      fileKey,
      fileName: 'hero.glb',
      mimeType: 'model/gltf-binary',
      sizeBytes: 4096,
      ...overrides,
    },
  });
  return { uploadRes, createRes, fileKey };
}

describe('assets module', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('presigns an upload URL and enforces the plan asset quota', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/assets/upload-url',
      headers: auth,
      payload: { fileName: 'texture.png', contentType: 'image/png', sizeBytes: 2048 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { uploadUrl: string; fileKey: string; method: string };
    expect(body.method).toBe('PUT');
    expect(body.fileKey).toContain(`assets/${session.userId}/`);
    expect(body.uploadUrl).toContain('http');
  });

  it('requires authentication', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/assets' });
    expect(res.statusCode).toBe(401);
  });

  it('creates an asset + first version, enqueues asset.process, and publishes ASSET_UPLOADED', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };

    let published: unknown;
    const unsubscribe = ctx.bus.subscribe('ASSET_UPLOADED', (event) => {
      published = event;
    });

    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    expect(createRes.statusCode).toBe(201);
    const body = createRes.json() as { asset: { id: string; status: string; currentVersionId: string }; version: { id: string; status: string } };
    expect(body.asset.status).toBe('PROCESSING');
    expect(body.asset.currentVersionId).toBe(body.version.id);
    expect(body.version.status).toBe('PROCESSING');

    expect(ctx.queues.assetProcess.calls).toHaveLength(1);
    const enqueued = ctx.queues.assetProcess.calls[0]!;
    expect(enqueued.data).toMatchObject({
      assetId: body.asset.id,
      versionId: body.version.id,
      fileKey: expect.any(String),
      fileName: 'hero.glb',
      mimeType: 'model/gltf-binary',
      sizeBytes: 4096,
      creatorId: session.userId,
    });

    expect(published).toBeTruthy();
    unsubscribe();
  });

  it('GET /assets lists only the caller\'s own assets', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const other = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const otherAuth = { authorization: `Bearer ${other.accessToken}` };

    await uploadAndCreateAsset(ctx, auth);
    await uploadAndCreateAsset(ctx, otherAuth, { name: 'Other Asset' });

    const list = await ctx.app.inject({ method: 'GET', url: '/v1/assets', headers: auth });
    expect(list.statusCode).toBe(200);
    const items = list.json().items as Array<{ creatorId: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.creatorId).toBe(session.userId);
  });

  it('GET /assets/:id 404s for a non-owner on a non-published asset, but 200s for the owner', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const other = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const otherAuth = { authorization: `Bearer ${other.accessToken}` };

    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    const assetId = createRes.json().asset.id as string;

    const ownerGet = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}`, headers: auth });
    expect(ownerGet.statusCode).toBe(200);

    const otherGet = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}`, headers: otherAuth });
    expect(otherGet.statusCode).toBe(404);

    const missing = await ctx.app.inject({ method: 'GET', url: '/v1/assets/does-not-exist', headers: auth });
    expect(missing.statusCode).toBe(404);
  });

  it('GET /assets/:id/passport 404s until a passport row exists', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    const assetId = createRes.json().asset.id as string;

    const before = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}/passport`, headers: auth });
    expect(before.statusCode).toBe(404);

    await ctx.prisma.assetPassport.create({ data: { assetId, data: { assetId, creatorId: session.userId, source: 'ORIGINAL' } } });

    const after = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}/passport`, headers: auth });
    expect(after.statusCode).toBe(200);
    expect(after.json().assetId).toBe(assetId);
  });

  it('POST /assets/:id/versions rejects a non-owner and a duplicate version label', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const other = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const otherAuth = { authorization: `Bearer ${other.accessToken}` };
    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    const assetId = createRes.json().asset.id as string;

    const forbidden = await ctx.app.inject({
      method: 'POST',
      url: `/v1/assets/${assetId}/versions`,
      headers: otherAuth,
      payload: { fileKey: 'assets/x/y.glb', fileName: 'hero-v2.glb', mimeType: 'model/gltf-binary', sizeBytes: 8192, version: '2.0.0' },
    });
    expect(forbidden.statusCode).toBe(403);

    const dup = await ctx.app.inject({
      method: 'POST',
      url: `/v1/assets/${assetId}/versions`,
      headers: auth,
      payload: { fileKey: 'assets/x/y.glb', fileName: 'hero-v1-again.glb', mimeType: 'model/gltf-binary', sizeBytes: 8192, version: '1.0.0' },
    });
    expect(dup.statusCode).toBe(409);

    expect(ctx.queues.assetProcess.calls).toHaveLength(1); // only the original POST /assets enqueue

    const ok = await ctx.app.inject({
      method: 'POST',
      url: `/v1/assets/${assetId}/versions`,
      headers: auth,
      payload: { fileKey: 'assets/x/y.glb', fileName: 'hero-v2.glb', mimeType: 'model/gltf-binary', sizeBytes: 8192, version: '2.0.0' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ctx.queues.assetProcess.calls).toHaveLength(2);
  });

  it('POST /assets/:id/publish is gated on the current version being READY, then enqueues a moderation scan', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    const assetId = createRes.json().asset.id as string;
    const versionId = createRes.json().version.id as string;

    const tooEarly = await ctx.app.inject({ method: 'POST', url: `/v1/assets/${assetId}/publish`, headers: auth });
    expect(tooEarly.statusCode).toBe(422);

    await ctx.prisma.assetVersion.update({ where: { id: versionId }, data: { status: 'READY' } });

    const published = await ctx.app.inject({ method: 'POST', url: `/v1/assets/${assetId}/publish`, headers: auth });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('PUBLISHED');

    expect(ctx.queues.moderationScan.calls).toHaveLength(1);
    expect(ctx.queues.moderationScan.calls[0]!.data).toMatchObject({ refKind: 'ASSET', refId: assetId });
  });

  it('GET /assets/:id/variants returns the current version\'s variant files', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const auth = { authorization: `Bearer ${session.accessToken}` };
    const { createRes } = await uploadAndCreateAsset(ctx, auth);
    const versionId = createRes.json().version.id as string;
    const assetId = createRes.json().asset.id as string;

    const empty = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}/variants`, headers: auth });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().items).toHaveLength(0);

    await ctx.prisma.assetVariantFile.create({ data: { versionId, variant: 'WEB', url: 'https://cdn.example.com/hero-web.glb', sizeBytes: 1024, format: 'glb' } });

    const res = await ctx.app.inject({ method: 'GET', url: `/v1/assets/${assetId}/variants`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].variant).toBe('WEB');
  });
});
