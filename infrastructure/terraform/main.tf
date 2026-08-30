locals {
  name = "${var.name_prefix}-${var.environment}"

  # CONTRACTS.md §7 — every DomainEvent type. Only materialized into topics when
  # var.create_per_event_type_topics is true (see pubsub.tf's design note and variables.tf).
  event_types = [
    "USER_REGISTERED", "CREATOR_ACTIVATED", "ORG_CREATED",
    "ASSET_UPLOADED", "ASSET_PROCESSED", "ASSET_REJECTED", "ASSET_PUBLISHED",
    "WORLD_CREATED", "WORLD_UPDATED", "WORLD_PUBLISHED", "WORLD_SNAPSHOT_CREATED",
    "GAME_CREATED", "GAME_PUBLISHED", "GAME_SESSION_STARTED", "GAME_SESSION_ENDED",
    "PRODUCT_LISTED", "PRODUCT_UPDATED", "PRODUCT_DELISTED",
    "ORDER_CREATED", "ORDER_PAID", "PLAYER_PURCHASED_ASSET", "ORDER_REFUNDED",
    "ROYALTY_ACCRUED", "PAYOUT_REQUESTED", "PAYOUT_SENT",
    "AI_TOOL_REQUESTED", "AI_TOOL_EXECUTED", "AI_TOOL_DENIED",
    "MISSION_CREATED", "NPC_CREATED", "REVIEW_CREATED",
    "MODERATION_FLAGGED", "MODERATION_RESOLVED", "FRAUD_SIGNAL",
    "ANALYTICS_EVENT",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "storage.googleapis.com",
    "compute.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy         = false
}

resource "google_artifact_registry_repository" "gameworld" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  description   = "Docker images for the Sonic GameWorld API, workers, and web apps (infrastructure/docker)."
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}
