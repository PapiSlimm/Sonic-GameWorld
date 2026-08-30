# Amazon S3 setup

## 1. Create the bucket

```bash
aws s3api create-bucket \
  --bucket gameworld-assets-prod \
  --region us-east-1

aws s3api put-public-access-block \
  --bucket gameworld-assets-prod \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Keep the bucket private (no public ACLs/policy). Serve reads either through presigned GET URLs
(the default — leave `S3_PUBLIC_URL_BASE` unset) or through **CloudFront** in front of the bucket
using an Origin Access Control, with `S3_PUBLIC_URL_BASE` set to the CloudFront domain.

## 2. Apply CORS

```bash
aws s3api put-bucket-cors --bucket gameworld-assets-prod --cors-configuration file://cors.json
```

(`cors.json` in this directory — edit `AllowedOrigins` to match your real app domains before
applying to a production bucket.)

## 3. Lifecycle rule (optional but recommended)

Abandoned presigned uploads (a client requested `POST /assets/upload-url` but never PUT the file,
or the PUT failed) leave no object behind — nothing to clean up. The one thing worth a lifecycle
rule is the `uploads/` prefix's *unprocessed* objects if you version bucket contents or add a
staging prefix later; skip this for a first deploy.

## 4. IAM policy for `services/api` / workers

Prefer an IAM role (ECS task role, EC2 instance profile, or IRSA on EKS) over static keys so
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` can stay unset and the AWS SDK's default credential
chain picks up the role automatically. Minimum policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::gameworld-assets-prod/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::gameworld-assets-prod"
    }
  ]
}
```

If you deploy on Render instead (see `render.yaml`) there's no IAM role attachment available, so
set `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` from an IAM user scoped to the policy above via
Render's env var groups.

## 5. Env vars

```bash
S3_ENDPOINT=                      # unset — talk to real AWS S3
S3_REGION=us-east-1
S3_BUCKET=gameworld-assets-prod
S3_ACCESS_KEY_ID=                 # unset if using an IAM role; otherwise an IAM user's key
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_PUBLIC_URL_BASE=https://cdn.sonicgameworld.com   # CloudFront domain, or unset for presigned GETs
```

## 6. CloudFront (optional CDN in front of the bucket)

1. Create a CloudFront distribution with the S3 bucket as origin, using an **Origin Access
   Control** (OAC) — not a public bucket policy.
2. Attach a bucket policy granting `s3:GetObject` to the specific CloudFront distribution's OAC
   principal (CloudFront's console generates this policy for you when you attach the OAC).
3. Set `S3_PUBLIC_URL_BASE=https://<distribution-domain-or-CDN_BASE_URL-alias>`.
4. Point `NEXT_PUBLIC_CDN_BASE_URL` (frontend env) at the same domain.
