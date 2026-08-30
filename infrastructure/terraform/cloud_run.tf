# Cloud Run v2 services for the API, the combined workers image, and each of the 6 Next.js apps.
# All three image families come from infrastructure/docker, pushed to the Artifact Registry repo
# created in main.tf.

resource "google_service_account" "cloud_run" {
  account_id   = "${local.name}-run"
  display_name = "Sonic GameWorld Cloud Run runtime service account"
}

resource "google_project_iam_member" "cloud_run_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

locals {
  repo_prefix = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.gameworld.repository_id}"

  # Shared secret-backed env vars every service that talks to Postgres/Redis/Stripe/AI needs.
  # Cloud Run v2's `env { value_source { secret_key_ref { ... } } }` shape is repeated per service
  # below rather than factored into a variable, since each service also needs its own plain
  # (non-secret) env vars alongside these.
  database_url = "postgresql://${var.db_user}:${random_password.gameworld_db_user.result}@${google_sql_database_instance.main.private_ip_address}:5432/${var.db_name}?schema=public"
  redis_url    = "rediss://:${google_redis_instance.main.auth_string}@${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}

# ---- API ----

resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name}-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = var.api_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.repo_prefix}/api:${var.image_tag}"

      ports {
        container_port = 4000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "API_PORT"
        value = "4000"
      }
      env {
        name  = "DATABASE_URL"
        value = local.database_url
      }
      env {
        name  = "REDIS_URL"
        value = local.redis_url
      }
      env {
        name  = "EVENT_BUS_DRIVER"
        value = "pubsub"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_TOPIC_PREFIX"
        value = var.name_prefix
      }
      env {
        name  = "S3_ACCESS_KEY_ID"
        value = google_storage_hmac_key.assets.access_id
      }
      env {
        name  = "S3_ENDPOINT"
        value = "https://storage.googleapis.com"
      }
      env {
        name  = "S3_REGION"
        value = "auto"
      }
      env {
        name  = "S3_BUCKET"
        value = google_storage_bucket.assets.name
      }
      env {
        name  = "S3_FORCE_PATH_STYLE"
        value = "true"
      }
      env {
        name  = "S3_PUBLIC_URL_BASE"
        value = var.cdn_domain != "" ? "https://${var.cdn_domain}" : "https://storage.googleapis.com/${google_storage_bucket.assets.name}"
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }

      dynamic "env" {
        for_each = {
          JWT_SECRET                    = "jwt-secret"
          STRIPE_SECRET_KEY             = "stripe-secret-key"
          STRIPE_WEBHOOK_SECRET         = "stripe-webhook-secret"
          ANTHROPIC_API_KEY             = "anthropic-api-key"
          GEMINI_API_KEY                = "gemini-api-key"
          FIREBASE_SERVICE_ACCOUNT_JSON = "firebase-service-account-json"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      startup_probe {
        http_get {
          path = "/v1/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 10
      }
    }
  }

  depends_on = [google_secret_manager_secret_version.this]
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ---- Workers (combined image, WORKER=all — see infrastructure/docker/workers.Dockerfile) ----

resource "google_cloud_run_v2_service" "workers" {
  name     = "${local.name}-workers"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.cloud_run.email

    # Cloud Run scales services on inbound request concurrency, not queue depth — a BullMQ worker
    # has no inbound requests at all, so it needs at least one always-on instance to keep
    # consuming jobs. Autoscaling on queue depth would need a separate metric-based trigger (e.g.
    # a Cloud Monitoring alerting policy driving `gcloud run services update --min-instances`, or
    # moving this to GKE/Compute Engine) — out of scope for this skeleton.
    scaling {
      min_instance_count = var.workers_min_instances
      max_instance_count = var.workers_max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.repo_prefix}/workers:${var.image_tag}"

      ports {
        container_port = 8080 # workers-entrypoint.mjs's /healthz-only listener — see that file's comments
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "WORKER"
        value = "all"
      }
      env {
        name  = "DATABASE_URL"
        value = local.database_url
      }
      env {
        name  = "REDIS_URL"
        value = local.redis_url
      }
      env {
        name  = "EVENT_BUS_DRIVER"
        value = "pubsub"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "PUBSUB_TOPIC_PREFIX"
        value = var.name_prefix
      }
      # Workers read S3_ACCESS_KEY/S3_SECRET_KEY/CDN_BASE_URL (not the *_ID/*_ACCESS_KEY/PUBLIC_URL_BASE
      # names services/api reads) — see the naming-mismatch note in render.yaml and this
      # directory's README.
      env {
        name  = "S3_ACCESS_KEY"
        value = google_storage_hmac_key.assets.access_id
      }
      env {
        name  = "S3_ENDPOINT"
        value = "https://storage.googleapis.com"
      }
      env {
        name  = "S3_REGION"
        value = "auto"
      }
      env {
        name  = "S3_BUCKET"
        value = google_storage_bucket.assets.name
      }
      env {
        name  = "CDN_BASE_URL"
        value = var.cdn_domain != "" ? "https://${var.cdn_domain}" : "https://storage.googleapis.com/${google_storage_bucket.assets.name}"
      }

      dynamic "env" {
        for_each = {
          ANTHROPIC_API_KEY = "anthropic-api-key"
          GEMINI_API_KEY    = "gemini-api-key"
        }
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.value].secret_id
              version = "latest"
            }
          }
        }
      }
      env {
        name = "S3_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["s3-secret-access-key"].secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi" # sharp/gltf-transform/three (thumbnails, asset-processing) benefit from headroom
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }
  }

  depends_on = [google_secret_manager_secret_version.this]
}

# ---- Web apps (one Cloud Run service per apps/*, all from the same web.Dockerfile + APP tag) ----

resource "google_cloud_run_v2_service" "web" {
  for_each = var.web_apps

  name     = "${local.name}-${each.key}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.web_min_instances
      max_instance_count = var.web_max_instances
    }

    containers {
      # Each app is a distinct image tag (infrastructure/docker/web.Dockerfile is built once per
      # APP build arg — see that Dockerfile and infrastructure/docker/README.md), not one shared
      # image switched by env var like the workers image.
      image = "${local.repo_prefix}/${each.key}:${var.image_tag}"

      ports {
        container_port = each.value.port
      }

      env {
        name  = "PORT"
        value = tostring(each.value.port)
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  for_each = var.web_apps

  name     = google_cloud_run_v2_service.web[each.key].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
