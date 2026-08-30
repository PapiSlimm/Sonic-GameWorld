# Sonic GameWorld — GCP Terraform skeleton

An alternative deployment target to `render.yaml` (Render Blueprint) — same application images
(`infrastructure/docker`), running on GCP instead: Cloud SQL for PostgreSQL 16 (PostGIS + pgvector
enabled), Memorystore Redis, a GCS bucket + Cloud CDN for assets, Pub/Sub for the event bus, and
Cloud Run v2 for the API, the combined workers image, and each of the 6 Next.js apps. Secrets live
in Secret Manager, referenced by Cloud Run at runtime rather than baked into images or state.

This is explicitly a **skeleton**: it provisions real, valid resources for every piece CONTRACTS.md
§40 calls for, with sane defaults, but skips the production-hardening a real GCP rollout would add
incrementally (Cloud Armor, a WAF policy, multi-region failover, a proper CI pipeline that builds
and pushes images into the Artifact Registry repo this creates, Terraform remote state locking,
etc.) — treat it as the starting point for those, not the finish line.

## Prerequisites

* Terraform >= 1.7, the `google`/`google-beta` providers (~> 6.0), and the community
  [`cyrilgdn/postgresql`](https://registry.terraform.io/providers/cyrilgdn/postgresql/latest)
  provider (used only to run `CREATE EXTENSION postgis`/`vector` — see `database.tf`).
* A GCP project with billing enabled. `main.tf` enables every API this config needs
  (`google_project_service`), so a fresh project works with no manual API-enabling step.
* `gcloud auth application-default login` (or a service account key via
  `GOOGLE_APPLICATION_CREDENTIALS`) with Owner or an equivalent broad role for the first apply —
  this config creates IAM bindings, networking, and Secret Manager entries, all of which need
  fairly wide permissions.

## Usage

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: project_id, terraform_runner_cidr (your IP, see below), secrets

terraform init
terraform plan
terraform apply
```

After `apply` succeeds, build and push the three image families
(`infrastructure/docker/{api,workers,web}.Dockerfile`) to the Artifact Registry repo in
`terraform output artifact_registry_repo`, tagged to match `var.image_tag`, then re-`apply` (or
`gcloud run services update --image=...`) to roll out — this config deploys whatever `image_tag`
already exists in the registry, it does not build images itself. Wiring that build step into
GitHub Actions (parallel to `.github/workflows/deploy.yml`'s Render path) is a natural next step,
not included here.

## Design notes / things to know before relying on this

* **`terraform_runner_cidr`** authorizes exactly one IP (yours, or a CI runner's) on Cloud SQL's
  public IP, needed once so the `postgresql` provider can run `CREATE EXTENSION postgis`/`vector`
  — Terraform's `google` provider has no resource for enabling Postgres extensions. Cloud Run
  itself never uses this path; it reaches Cloud SQL over the private IP via the VPC connector
  (`network.tf`). Update this variable (and re-apply) if your IP changes; don't leave a stale
  wide-open range here long-term.
* **Pub/Sub topology mismatch, by design — read before assuming "one topic per EventType" is
  live:** the assignment brief for this module says "Pub/Sub topics per EventType," but the
  *actual* driver (`packages/events/src/drivers/pubsub.ts`, `PubSubEventBus`) publishes every
  `DomainEvent` to one shared topic (`${var.name_prefix}-events`) and fans out via one pull
  subscription per logical subscriber. `pubsub.tf` provisions that real topic + subscriptions by
  default; per-EventType topics are provisioned only when `create_per_event_type_topics = true`,
  and nothing in this codebase publishes to them yet. See `pubsub.tf`'s header comment.
  **Also:** every subscriber must pass a distinct `subscriber` option to
  `createEventBusFromEnv()`/`new PubSubEventBus()` — the driver defaults to `'api'` for everyone,
  which would otherwise collide every service's default subscription onto one
  (`${prefix}-events-api`) and split events between them instead of each service seeing all of
  them. `variables.tf`'s `pubsub_subscribers` list names the subscriptions this config expects
  each worker to use (`worker-asset-processing`, etc.) — that's a naming convention this Terraform
  module is *prescribing*, not one already wired up in `workers/*`'s source.
* **Env var naming mismatches carried over from the application code**, not introduced here — see
  the root README's cross-package notes for the full list. `cloud_run.tf` sets **both** naming
  conventions for S3 credentials (`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` for `services/api`,
  `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`CDN_BASE_URL` for `workers/*`) pointed at the same HMAC key and
  bucket, so both packages work regardless of which convention they individually read.
* **The workers Cloud Run service is a real architectural compromise, not a clean fit.** Cloud Run
  services scale on inbound HTTP request concurrency; a BullMQ worker has no inbound requests at
  all. `workers_min_instances` (default 1) keeps at least one instance resident so it can actually
  consume jobs, and `infrastructure/docker/workers-entrypoint.mjs` now opens a trivial `/healthz`
  HTTP listener purely so Cloud Run's startup/liveness probing has something to check — that
  endpoint does not front the workers functionally. Autoscaling on **queue depth** (the metric
  that actually matters for a worker fleet) isn't native to Cloud Run Services; a Cloud Monitoring
  alerting policy driving `gcloud run services update --min-instances`, or moving this workload to
  GKE/Compute Engine with HPA-on-custom-metric, would be the real fix if worker throughput becomes
  a bottleneck. `ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"` keeps it off the public internet in the
  meantime, since it was never meant to serve external traffic.
* **`postgresql_extension`/`postgresql_grant`** run over the Cloud SQL instance's *public* IP
  (see the `terraform_runner_cidr` note above) — if you'd rather avoid exposing a public IP on
  Cloud SQL at all, run `terraform apply` from a machine inside the VPC (a bastion, Cloud Build
  private pool, etc.) instead, set `ipv4_enabled = false` in `database.tf`, and point the
  `postgresql` provider's `host` at `private_ip_address` instead of `public_ip_address`.
* **State:** `versions.tf` has a commented-out `backend "gcs"` block. Uncomment and point it at a
  real state bucket before more than one person (or one CI pipeline) ever runs `apply` — local
  state works for exploring this module solo, not for a team.

## What's deliberately out of scope

* Building/pushing the Docker images themselves (see "Usage" above).
* A staging vs. prod environment split beyond `var.environment`'s naming/labels — run this module
  twice with two different `terraform.tfvars` + state files (or add real Terraform workspaces) for
  a true multi-environment setup; `infrastructure/environments/` covers the *application* env var
  side of dev/staging/prod, which is a separate concern from this infra's own environment split.
* OpenSearch — CONTRACTS.md §2 lists it as the search backend, with a Postgres `ILIKE` fallback
  when `OPENSEARCH_URL` is unset. This skeleton relies on that fallback rather than standing up a
  managed OpenSearch/Elasticsearch cluster (no first-party GCP-managed OpenSearch product exists;
  the realistic options — self-hosted on GKE, or a third-party managed service like Elastic
  Cloud — are both sizeable enough to be their own follow-up, not a "skeleton" line item).
