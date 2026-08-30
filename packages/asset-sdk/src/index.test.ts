import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssetClient, PACKAGE_NAME, uploadAsset, type AssetUploadClient } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('@sonic-gameworld/asset-sdk', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@sonic-gameworld/asset-sdk');
  });

  it('createAssetClient() scopes requests to the assets namespace', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.example.com/v1/assets');
      return jsonResponse({ items: [], nextCursor: null });
    });
    const assets = createAssetClient({ baseUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch });
    const page = await assets.list();
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  describe('uploadAsset()', () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('requests a presigned upload URL then PUTs the bytes (Node fetch fallback, no XMLHttpRequest)', async () => {
      expect(typeof (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest).toBe('undefined');

      const putMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('PUT');
        expect(new Headers(init?.headers).get('x-amz-meta-foo')).toBe('bar');
        return new Response(null, { status: 200 });
      });
      globalThis.fetch = putMock as unknown as typeof fetch;

      const client: AssetUploadClient = {
        assets: {
          uploadUrl: vi.fn(async (input) => {
            expect(input).toMatchObject({ fileName: 'model.glb', contentType: 'model/gltf-binary', sizeBytes: 4 });
            return {
              uploadUrl: 'https://storage.example.com/bucket/model.glb?sig=abc',
              method: 'PUT' as const,
              headers: { 'x-amz-meta-foo': 'bar' },
              fileKey: 'assets/model.glb',
              expiresAt: new Date().toISOString(),
              maxSizeBytes: 1_000_000,
            };
          }),
        },
      };

      const result = await uploadAsset(client, { data: new Uint8Array([1, 2, 3, 4]), fileName: 'model.glb', contentType: 'model/gltf-binary' });

      expect(client.assets.uploadUrl).toHaveBeenCalledOnce();
      expect(putMock).toHaveBeenCalledOnce();
      expect(putMock.mock.calls[0]?.[0]).toBe('https://storage.example.com/bucket/model.glb?sig=abc');
      expect(result).toEqual({
        fileKey: 'assets/model.glb',
        fileName: 'model.glb',
        contentType: 'model/gltf-binary',
        sizeBytes: 4,
        uploadUrl: 'https://storage.example.com/bucket/model.glb?sig=abc',
      });
    });

    it('reports progress at completion when falling back to fetch', async () => {
      globalThis.fetch = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
      const client: AssetUploadClient = {
        assets: {
          uploadUrl: async () => ({
            uploadUrl: 'https://storage.example.com/x',
            method: 'PUT',
            headers: {},
            fileKey: 'k1',
            expiresAt: new Date().toISOString(),
            maxSizeBytes: 100,
          }),
        },
      };
      const onProgress = vi.fn();
      await uploadAsset(client, { data: new Uint8Array(10), fileName: 'a.bin', contentType: 'application/octet-stream' }, { onProgress });
      expect(onProgress).toHaveBeenCalledWith(10, 10);
    });

    it('rejects when the PUT fails', async () => {
      globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500, statusText: 'Server Error' })) as unknown as typeof fetch;
      const client: AssetUploadClient = {
        assets: {
          uploadUrl: async () => ({
            uploadUrl: 'https://storage.example.com/x',
            method: 'PUT',
            headers: {},
            fileKey: 'k1',
            expiresAt: new Date().toISOString(),
            maxSizeBytes: 100,
          }),
        },
      };
      await expect(
        uploadAsset(client, { data: new Uint8Array(1), fileName: 'a.bin', contentType: 'application/octet-stream' }),
      ).rejects.toThrow(/500/);
    });
  });
});
