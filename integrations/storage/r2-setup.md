# Cloudflare R2 setup

R2 speaks the S3 API natively (no compatibility shim needed) and — the main reason to consider it
for GameWorld's asset bucket — charges **zero egress fees**, which matters a lot for a
marketplace where every asset is uploaded once and downloaded (imported into Unity/Unreal
projects, streamed into `spatial-engine`, etc.) potentially thousands of times.

## 1. Create the bucket

Dashboard: **R2 > Create bucket** -> name it `gameworld-assets-prod`, choose a location hint
close to most of your creators/players (or "Automatic").

Or via Wrangler:

```bash
wrangler r2 bucket create gameworld-assets-prod
```

## 2. Apply CORS

R2 uses the same CORS rule shape as AWS S3 — apply [`cors.json`](./cors.json) from this directory:

```bash
wrangler r2 bucket cors put gameworld-assets-prod --rules cors.json
```

(Or Dashboard: bucket -> **Settings > CORS Policy** -> paste the contents of `cors.json`.)

## 3. Create an S3 API token

Dashboard: **R2 > Manage R2 API Tokens > Create API Token** -> permission **Object Read & Write**,
scoped to the `gameworld-assets-prod` bucket only. This gives you an **Access Key ID** and
**Secret Access Key** plus your account's R2 S3 endpoint
(`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`).

## 4. Env vars

```bash
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto                    # R2 requires exactly "auto"
S3_BUCKET=gameworld-assets-prod
S3_ACCESS_KEY_ID=<access key from step 3>
S3_SECRET_ACCESS_KEY=<secret key from step 3>
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_URL_BASE=https://cdn.sonicgameworld.com   # a custom domain mapped to the bucket (step 5), or unset for presigned GETs
```

## 5. Public access via a custom domain (recommended over presigned GETs for published assets)

R2 buckets can be exposed directly on a domain you control, which then sits behind Cloudflare's
CDN/cache automatically — no separate CDN product needed (unlike S3+CloudFront or GCS+Cloud CDN):

Dashboard: bucket -> **Settings > Public access > Custom Domains > Connect Domain** -> e.g.
`cdn.sonicgameworld.com`. Cloudflare creates the DNS record and TLS cert automatically if the zone
is already on Cloudflare.

Once connected, set `S3_PUBLIC_URL_BASE=https://cdn.sonicgameworld.com` so
`StorageService.getDownloadUrl()`/`publicUrl()` return direct CDN URLs instead of presigned GETs —
appropriate once an asset has cleared moderation and is `PUBLISHED` (CONTRACTS.md §13); keep
in-pipeline/private assets served through the presigned path by not exposing their prefix on the
custom domain (or by using a separate private bucket for pre-publish assets if you want a hard
boundary).

## Notes

* R2 has no regions to pick — `auto` in `S3_REGION` is required, not a placeholder.
* Multipart upload, presigned URLs (`getSignedUrl`), and every `@aws-sdk/client-s3` command used
  by `services/api/src/storage.ts` are all supported as-is; no code changes needed to switch a
  deployment from S3/GCS to R2 — only the four `S3_*` env vars above change.
