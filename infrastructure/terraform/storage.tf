# GCS bucket for GameWorld assets + Cloud CDN in front of it. See integrations/storage/gcs-setup.md
# for the manual/gcloud equivalent of everything below, and for the S3-compatibility HMAC key
# `services/api`/workers actually authenticate with (S3_ACCESS_KEY_ID/S3_ACCESS_KEY etc. — GCS's
# native IAM is used here for the *bucket and CDN infrastructure*; the HMAC key for application
# auth is provisioned out-of-band per that doc, not by Terraform, since it's tied to a service
# account key rather than a resource Terraform should own long-term).

resource "google_storage_bucket" "assets" {
  name                        = var.assets_bucket_name
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = var.environment != "prod"

  cors {
    origin          = ["https://*.sonicgameworld.com", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "http://localhost:3004", "http://localhost:3005"]
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "ETag", "x-goog-meta-*"]
    max_age_seconds = 3600
  }

  versioning {
    enabled = var.environment == "prod"
  }

  labels = var.labels

  depends_on = [google_project_service.apis]
}

resource "google_service_account" "assets_hmac" {
  account_id   = "${local.name}-assets-hmac"
  display_name = "GameWorld assets HMAC (S3-interop) service account"
}

resource "google_storage_hmac_key" "assets" {
  service_account_email = google_service_account.assets_hmac.email
}

resource "google_storage_bucket_iam_member" "assets_hmac_writer" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.assets_hmac.email}"
}

# ---- Cloud CDN (backend bucket + global external HTTPS LB) ----

resource "google_compute_backend_bucket" "assets_cdn" {
  name        = "${local.name}-assets-backend"
  bucket_name = google_storage_bucket.assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    client_ttl        = 3600
    default_ttl       = 3600
    max_ttl           = 86400
    negative_caching  = true
  }
}

resource "google_compute_url_map" "assets_cdn" {
  name            = "${local.name}-assets-urlmap"
  default_service = google_compute_backend_bucket.assets_cdn.id
}

resource "google_compute_managed_ssl_certificate" "assets_cdn" {
  count = var.cdn_domain != "" ? 1 : 0
  name  = "${local.name}-assets-cert"

  managed {
    domains = [var.cdn_domain]
  }
}

resource "google_compute_target_https_proxy" "assets_cdn" {
  count            = var.cdn_domain != "" ? 1 : 0
  name             = "${local.name}-assets-https-proxy"
  url_map          = google_compute_url_map.assets_cdn.id
  ssl_certificates = [google_compute_managed_ssl_certificate.assets_cdn[0].id]
}

# HTTP proxy + rule kept even with a custom domain so http:// still resolves (redirect is set up
# manually via the LB's forwarding rule / a small url_map redirect if desired — omitted here to
# keep this skeleton to the essentials).
resource "google_compute_target_http_proxy" "assets_cdn" {
  name    = "${local.name}-assets-http-proxy"
  url_map = google_compute_url_map.assets_cdn.id
}

resource "google_compute_global_address" "assets_cdn" {
  name = "${local.name}-assets-cdn-ip"
}

resource "google_compute_global_forwarding_rule" "assets_cdn_https" {
  count                 = var.cdn_domain != "" ? 1 : 0
  name                  = "${local.name}-assets-cdn-https"
  ip_address            = google_compute_global_address.assets_cdn.address
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_target_https_proxy.assets_cdn[0].id
  load_balancing_scheme = "EXTERNAL"
}

resource "google_compute_global_forwarding_rule" "assets_cdn_http" {
  name                  = "${local.name}-assets-cdn-http"
  ip_address            = google_compute_global_address.assets_cdn.address
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.assets_cdn.id
  load_balancing_scheme = "EXTERNAL"
}
