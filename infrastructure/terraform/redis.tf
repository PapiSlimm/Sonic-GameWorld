# Memorystore for Redis — backs BullMQ queues (workers/*), ioredis caching, and the `redis`
# EVENT_BUS_DRIVER. Private-IP only; reachable from Cloud Run via the VPC connector (network.tf).

resource "google_redis_instance" "main" {
  name           = "${local.name}-redis"
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  region         = var.region

  redis_version      = "REDIS_7_2"
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  transit_encryption_mode = "SERVER_AUTHENTICATION"
  auth_enabled            = true

  labels = var.labels

  depends_on = [
    google_project_service.apis,
    google_service_networking_connection.private_vpc_connection,
  ]
}
