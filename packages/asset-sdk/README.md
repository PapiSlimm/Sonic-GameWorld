# @sonic-gameworld/asset-sdk

Thin wrapper over `@sonic-gameworld/gameworld-sdk` scoped to the asset pipeline routes
(docs/CONTRACTS.md §9 `assets:`, §13 asset pipeline), plus an `uploadAsset()` helper.

## Install

```bash
pnpm add @sonic-gameworld/asset-sdk
```

## Usage

```ts
import { createAssetClient, uploadAsset } from '@sonic-gameworld/asset-sdk';

const assets = createAssetClient({ baseUrl: 'http://localhost:4000', token });

// Browser: pass a File/Blob directly — progress is reported via XMLHttpRequest.
const result = await uploadAsset(assets, fileInput.files[0], {
  onProgress: (loaded, total) => console.log(`${loaded}/${total}`),
});

// Node.js: pass raw bytes — falls back to a plain `fetch` PUT (no progress events).
await uploadAsset(assets, { data: buffer, fileName: 'model.glb', contentType: 'model/gltf-binary' });

// Then finalize the asset record:
await assets.create({ name: 'My Model', fileKey: result.fileKey, fileName: result.fileName, sizeBytes: result.sizeBytes, contentType: result.contentType });
```

`uploadAsset()` calls `POST /v1/assets/upload-url` for a presigned URL, then `PUT`s the bytes
directly to storage — it uses `XMLHttpRequest` when available (browsers, for progress events)
and a plain `fetch` PUT otherwise (Node.js; no progress events, but `onProgress` still fires
once at completion).

Need more than assets (marketplace/ai/etc.)? Use `createFullClient(options)` to get the full
`GameWorldClient` from `@sonic-gameworld/gameworld-sdk`.

## Env vars

None.

## Public API

- `createAssetClient(options): AssetClient` — `AssetClient` is `GameWorldClient['assets']`.
- `uploadAsset(client, file, opts?): Promise<UploadAssetResult>` — `client` is any object
  shaped like `{ assets: { uploadUrl } }` (an `AssetClient` or full `GameWorldClient` both work);
  `file` is a `Blob`/`File` or `{ data: Uint8Array; fileName; contentType }`; `opts?: { fileName?,
  contentType?, assetId?, onProgress?, signal? }`.
- `createFullClient(options): GameWorldClient`.
- Re-exported types: `Asset`, `AssetVersion`, `AssetVariantInfo`, `AssetPassport`,
  `CreateAssetInput`, `PublishAssetInput`, `UploadUrlInput`, `UploadUrlResult`, `ApiError`.

## Build & test

```bash
pnpm --filter @sonic-gameworld/asset-sdk build
pnpm --filter @sonic-gameworld/asset-sdk test
```
