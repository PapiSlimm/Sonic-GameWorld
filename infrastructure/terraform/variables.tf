variable "project_id" {
  description = "GCP project id (create Firebase in the same project — see integrations/identity/firebase-setup.md)."
  type        = string
}

variable "region" {
  description = "Primary GCP region for all regional resources."
  type        = string
  default     = "us-east1"
}

variable "environment" {
  description = "Deployment environment name, used as a resource-name suffix/label. One of dev, staging, prod."
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "name_prefix" {
  description = "Prefix applied to every resource name this module creates."
  type        = string
  default     = "gameworld"
}

variable "labels" {
  description = "Common labels applied to every resource that supports them."
  type        = map(string)
  default = {
    app = "sonic-gameworld"
  }
}

# ---- Networking ----

variable "vpc_cidr" {
  description = "CIDR range for the VPC subnet Cloud Run's Serverless VPC Access connector and private-services-access peering use."
  type        = string
  default     = "10.8.0.0/28"
}

variable "terraform_runner_cidr" {
  description = <<-EOT
    CIDR of whatever machine runs `terraform apply` (your laptop, a CI runner's egress IP, etc.),
    authorized on Cloud SQL's public IP so the `postgresql` provider can run `CREATE EXTENSION`
    during apply (see database.tf). Use a /32. Cloud SQL is otherwise only reachable from the VPC
    (private IP) by Cloud Run — this rule exists solely for the one-time extension setup.
  EOT
  type        = string
}

# ---- Cloud SQL ----

variable "db_tier" {
  description = "Cloud SQL machine tier."
  type        = string
  default     = "db-custom-2-8192" # 2 vCPU / 8GB — bump for production load.
}

variable "db_disk_size_gb" {
  description = "Cloud SQL disk size in GB."
  type        = number
  default     = 50
}

variable "db_high_availability" {
  description = "Enable regional (HA) Cloud SQL. Recommended true for prod, false for dev/staging."
  type        = bool
  default     = false
}

variable "db_name" {
  description = "Database name (matches DATABASE_URL's path in every env template)."
  type        = string
  default     = "gameworld"
}

variable "db_user" {
  description = "Application database user (least-privilege; distinct from the Cloud SQL default 'postgres' superuser)."
  type        = string
  default     = "gameworld"
}

# ---- Redis (Memorystore) ----

variable "redis_tier" {
  description = "Memorystore service tier: BASIC (no HA/replica) or STANDARD_HA."
  type        = string
  default     = "STANDARD_HA"
}

variable "redis_memory_size_gb" {
  description = "Memorystore instance size in GB."
  type        = number
  default     = 1
}

# ---- Storage / CDN ----

variable "assets_bucket_name" {
  description = "GCS bucket name for GameWorld assets (must be globally unique). See integrations/storage/gcs-setup.md."
  type        = string
  default     = "gameworld-assets-prod"
}

variable "cdn_domain" {
  description = "Custom domain to front the assets bucket via Cloud CDN + a Google-managed cert (e.g. cdn.sonicgameworld.com). Leave blank to skip DNS/cert setup and use the load balancer's own IP."
  type        = string
  default     = ""
}

# ---- Pub/Sub ----

variable "create_per_event_type_topics" {
  description = <<-EOT
    The ACTUAL event bus code (packages/events/src/drivers/pubsub.ts) publishes every DomainEvent
    to ONE shared topic (`${var.name_prefix}-events`, see pubsub.tf's `google_pubsub_topic.events`)
    and relies on per-subscriber pull subscriptions for fan-out, not one topic per EventType. This
    variable additionally provisions one topic per CONTRACTS.md §7 EventType (default: off, since
    the current driver never publishes to them) for teams that want a dedicated topic per event
    type for external/downstream integrations later — see pubsub.tf and this directory's README.
  EOT
  type        = bool
  default     = false
}

variable "pubsub_subscribers" {
  description = "Logical subscriber names (services/workers) that each get their own pull subscription on the shared events topic, matching the `subscriber` option passed to createEventBusFromEnv()/PubSubEventBus. Defaults cover the API plus one per worker."
  type        = list(string)
  default = [
    "api",
    "worker-asset-processing",
    "worker-ai-generation",
    "worker-thumbnails",
    "worker-builds",
    "worker-moderation",
    "worker-analytics",
  ]
}

# ---- Cloud Run ----

variable "artifact_registry_repo" {
  description = "Artifact Registry Docker repository name that holds gameworld-api / gameworld-workers / gameworld-<app> images (see infrastructure/docker)."
  type        = string
  default     = "gameworld"
}

variable "image_tag" {
  description = "Image tag to deploy for every Cloud Run service (e.g. a git SHA or `latest`). CI should pass a real SHA, not `latest`, for reproducible deploys."
  type        = string
  default     = "latest"
}

variable "web_apps" {
  description = "The 6 Next.js apps (CONTRACTS.md §12), each deployed as its own Cloud Run service. Keys are used as name suffixes; `port` matches each app's canonical dev port."
  type = map(object({
    port = number
  }))
  default = {
    "studio"           = { port = 3000 }
    "marketplace"      = { port = 3001 }
    "player"           = { port = 3002 }
    "creator"          = { port = 3003 }
    "admin"            = { port = 3004 }
    "developer-portal" = { port = 3005 }
  }
}

variable "api_min_instances" {
  type    = number
  default = 1
}

variable "api_max_instances" {
  type    = number
  default = 10
}

variable "workers_min_instances" {
  description = "Cloud Run min instances for the combined workers service. Cloud Run services scale on request concurrency, not queue depth, so a BullMQ worker with no HTTP traffic needs min_instances >= 1 to stay resident — see this directory's README for why Cloud Run is a workable-but-imperfect fit for the workers service."
  type        = number
  default     = 1
}

variable "workers_max_instances" {
  type    = number
  default = 3
}

variable "web_min_instances" {
  type    = number
  default = 0
}

variable "web_max_instances" {
  type    = number
  default = 5
}

# ---- Secrets (values, not names — see secrets.tf) ----
# Every one of these is written to Secret Manager but never given a default; pass them via a
# gitignored *.auto.tfvars file or -var on the CLI / CI secret store, exactly like you would any
# other secret (see the root README's "Secrets" note).

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "stripe_secret_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "stripe_webhook_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "anthropic_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "firebase_service_account_json" {
  description = "Full Firebase service account JSON key, as a single string. See integrations/identity/firebase-setup.md."
  type        = string
  sensitive   = true
  default     = ""
}
