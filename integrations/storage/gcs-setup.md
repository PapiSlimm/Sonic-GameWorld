# Google Cloud Storage setup

`@aws-sdk/client-s3` talks to GCS through its [S3-compatible XML
API](https://cloud.google.com/storage/docs/interoperability) (`https://storage.googleapis.com`),
using HMAC keys instead of a native GCP service-account JSON key. This is what
`infrastructure/terraform`'s `google_storage_bucket` resource provisions for; see that module's
README for the Terraform-managed path — the steps below are the equivalent manual/`gcloud` path.

## 1. Create the bucket

```bash
gcloud storage buckets create gs://gameworld-assets-prod \
  --project=$GCP_PROJECT_ID \
  --location=US \
  --uniform-bucket-level-access
```

Keep `--uniform-bucket-level-access` (IAM-only, no per-object ACLs) and do **not** grant
`allUsers`/`allAuthenticatedUsers` read access — serve public reads through Cloud CDN (see step 5)
or presigned GETs, matching the S3 setup's private-by-default posture.

## 2. Apply CORS

GCS's CORS config shape differs from the S3 rule format used by AWS/R2/MinIO — use
[`gcs-cors.json`](./gcs-cors.json) in this directory, not [`cors.json`](./cors.json):

```bash
gcloud storage buckets update gs://gameworld-assets-prod --cors-file=gcs-cors.json
```

## 3. Create HMAC keys for S3-interoperability access

```bash
gcloud storage hmac create <SERVICE_ACCOUNT_EMAIL> --project=$GCP_PROJECT_ID
# -> prints accessId (S3_ACCESS_KEY_ID) and secret (S3_SECRET_ACCESS_KEY)
```

Use a dedicated service account (not a human's) with only `roles/storage.objectAdmin` on this one
bucket:

```bash
gcloud storage buckets add-iam-policy-binding gs://gameworld-assets-prod \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/storage.objectAdmin"
```

## 4. Env vars

```bash
S3_ENDPOINT=https://storage.googleapis.com
S3_REGION=auto                    # GCS ignores the region on the S3-compat endpoint; any value works
S3_BUCKET=gameworld-assets-prod
S3_ACCESS_KEY_ID=<accessId from step 3>
S3_SECRET_ACCESS_KEY=<secret from step 3>
S3_FORCE_PATH_STYLE=true          # required — GCS's S3-compat endpoint does not support virtual-hosted-style
S3_PUBLIC_URL_BASE=https://cdn.sonicgameworld.com   # Cloud CDN domain, or unset for presigned GETs
```

## 5. Cloud CDN (optional, matches `infrastructure/terraform`)

The Terraform module (`infrastructure/terraform/modules/storage`) provisions a backend bucket +
Cloud CDN + global external HTTPS load balancer in front of this same bucket. If you provisioned
the bucket manually instead of via Terraform:

```bash
gcloud compute backend-buckets create gameworld-assets-backend \
  --gcs-bucket-name=gameworld-assets-prod --enable-cdn
```

then wire it into a URL map / target HTTPS proxy / global forwarding rule (or just run
`terraform apply` against `infrastructure/terraform` — it does all of this for you). Point
`S3_PUBLIC_URL_BASE` at the load balancer's domain once DNS is live.

## HMAC key rotation

`gcloud storage hmac list` / `gcloud storage hmac update <ACCESS_ID> --state=INACTIVE` /
`gcloud storage hmac delete <ACCESS_ID>` — rotate by creating a new key, updating
`S3_SECRET_ACCESS_KEY` in your env var group (Render/Secret Manager), redeploying, then
deactivating and deleting the old key once the new one is confirmed live.
