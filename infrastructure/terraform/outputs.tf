output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_urls" {
  value = { for k, svc in google_cloud_run_v2_service.web : k => svc.uri }
}

output "workers_internal_url" {
  description = "Internal-only (INGRESS_TRAFFIC_INTERNAL_ONLY) URL — not reachable from the public internet, only useful for the /healthz check from within the VPC/another Cloud Run service."
  value       = google_cloud_run_v2_service.workers.uri
}

output "database_instance_connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "database_private_ip" {
  value = google_sql_database_instance.main.private_ip_address
}

output "redis_host" {
  value = google_redis_instance.main.host
}

output "assets_bucket_name" {
  value = google_storage_bucket.assets.name
}

output "assets_cdn_ip" {
  description = "Point cdn_domain's DNS A record at this IP (and set var.cdn_domain to provision the managed cert + HTTPS listener)."
  value       = google_compute_global_address.assets_cdn.address
}

output "artifact_registry_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.gameworld.repository_id}"
}

output "pubsub_events_topic" {
  value = google_pubsub_topic.events.id
}

output "s3_access_key_id" {
  description = "S3-interoperability HMAC access id for the assets bucket (see integrations/storage/gcs-setup.md). The secret half lives in Secret Manager, not here."
  value       = google_storage_hmac_key.assets.access_id
}
