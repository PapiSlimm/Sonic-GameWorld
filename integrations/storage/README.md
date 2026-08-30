# Object storage integration

`services/api`'s storage layer (`src/storage.ts`, `createStorageService`) is a single
S3-compatible client (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) that works unchanged
against AWS S3, Google Cloud Storage (via its S3-compatibility XML API), Cloudflare R2, or MinIO —
whichever `S3_ENDPOINT`/credentials you point it at. Nothing in the application code is
provider-specific; this directory documents how to provision the bucket itself on each provider.

Flow (`POST /v1/assets/upload-url` -> direct-to-bucket upload -> workers pick it up):

```
Client (Studio/Unity/Unreal)      services/api                          Bucket
────────────────────────────      ────────────                          ──────
POST /assets/upload-url      ──▶  StorageService.getUploadUrl()
                                     buildKey() -> "uploads/<uuid>.<ext>"
                                     PutObjectCommand + getSignedUrl()
                              ◀──  { uploadUrl, method: PUT, headers, fileKey, expiresAt }
PUT <uploadUrl>  (raw file bytes, direct to bucket, bypasses the API)  ──▶  object stored
POST /assets                 ──▶  records Asset row referencing fileKey
                                     -> asset.process queue (workers/asset-processing)
```

Because the browser (or Unity/Unreal SDK) PUTs directly to the bucket with a presigned URL, **the
bucket's CORS policy must allow `PUT` from every app origin** — see [`cors.json`](./cors.json)
(AWS S3 / R2 / MinIO CORS rule format) and [`gcs-cors.json`](./gcs-cors.json) (GCS's distinct CORS
schema). Apply whichever matches your provider using the steps in that provider's setup doc.

## Env vars (must match `services/api/src/config.ts` exactly)

| Var | Purpose | Default |
|---|---|---|
| `S3_ENDPOINT` | Custom endpoint URL. **Unset for real AWS S3.** Required for GCS's S3-compat endpoint, R2, and MinIO. | unset |
| `S3_REGION` | Bucket region (AWS/R2 use a real region code; GCS/MinIO accept a placeholder like `auto`/`us-east-1`). | `us-east-1` |
| `S3_BUCKET` | Bucket name. | `gameworld-dev` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credentials. Unset -> the SDK falls back to the default AWS credential chain (IAM role, etc.) — fine for Cloud Run/EC2 with an attached service account, wrong for GCS/R2/MinIO which always need an explicit key pair. | unset |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO and most self-hosted/S3-compatible targets (`http://host/bucket/key` instead of `http://bucket.host/key`). Also forced `true` automatically whenever `S3_ENDPOINT` is set. | `false` |
| `S3_PUBLIC_URL_BASE` | When set, `getDownloadUrl()`/`publicUrl()` return `"${S3_PUBLIC_URL_BASE}/${fileKey}"` directly instead of a presigned GET — use this for a public bucket/CDN in front of published assets. Leave unset to keep every asset private-by-default with presigned, expiring download URLs. | unset |
| `S3_UPLOAD_URL_TTL_SECONDS` | Presigned PUT URL lifetime. | `900` (15 min) |
| `S3_DOWNLOAD_URL_TTL_SECONDS` | Presigned GET URL lifetime (only used when `S3_PUBLIC_URL_BASE` is unset). | `3600` (1 hour) |

> **Cross-check:** the root `.env.example` and `infrastructure/environments/*.env.example`
> templates use these exact names. If you're pulling values from an older doc or a teammate's
> notes using `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`CDN_BASE_URL` instead, those do not match what
> `config.ts` actually reads (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_PUBLIC_URL_BASE`) —
> see the root README's cross-package notes.

## Provider setup docs

| Provider | Doc | When to use it |
|---|---|---|
| Amazon S3 | [`s3-setup.md`](./s3-setup.md) | Production on AWS, or anywhere you want IAM-role-based credentials instead of static keys. |
| Google Cloud Storage | [`gcs-setup.md`](./gcs-setup.md) | Production on GCP (pairs with `infrastructure/terraform`'s GCS + Cloud CDN resources). |
| Cloudflare R2 | [`r2-setup.md`](./r2-setup.md) | Zero egress fees for a CDN-fronted asset bucket serving many downloads per upload (GameWorld's read-heavy marketplace/game-asset traffic). |
| MinIO | [`minio-setup.md`](./minio-setup.md) | Local dev (already wired into `docker-compose.yml`) and self-hosted/on-prem deployments. |

## Accepted file types & size ceiling

`StorageService.getUploadUrl` enforces a hard 5 GiB per-object ceiling (`MAX_UPLOAD_BYTES`); the
asset pipeline (CONTRACTS.md §13) additionally validates the extension against the accepted list —
`FBX GLB GLTF OBJ USD BLEND PNG JPG WAV MP3 MP4 ZIP` — during the `FILE_VALIDATION` stage, after
the object is already in the bucket. Per-plan asset **count** quotas (CONTRACTS.md §4) are enforced
separately at `POST /assets`, not here.
