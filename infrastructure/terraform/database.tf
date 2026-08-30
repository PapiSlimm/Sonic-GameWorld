# Cloud SQL for PostgreSQL 16, with a private IP (for Cloud Run via the VPC connector) and a
# public IP restricted to var.terraform_runner_cidr (used once by the `postgresql` provider below
# to enable the postgis + vector extensions CONTRACTS.md §10 requires — Terraform's google
# provider has no resource for `CREATE EXTENSION`).

resource "random_password" "postgres_root" {
  length  = 32
  special = false
}

resource "random_password" "gameworld_db_user" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "main" {
  name             = "${local.name}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  # A password on the built-in `postgres` superuser is required before Terraform can manage it as
  # a resource in newer provider versions; consumed only by the `postgresql` provider block.
  root_password = random_password.postgres_root.result

  settings {
    tier              = var.db_tier
    availability_type = var.db_high_availability ? "REGIONAL" : "ZONAL"
    disk_size         = var.db_disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "07:00"
    }

    ip_configuration {
      ipv4_enabled                                  = true # public IP, locked down below — needed for the one-time extension setup
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true

      authorized_networks {
        name  = "terraform-runner"
        value = var.terraform_runner_cidr
      }
    }

    database_flags {
      name  = "cloudsql.enable_pgvector"
      value = "on"
    }

    user_labels = var.labels
  }

  deletion_protection = var.environment == "prod"

  depends_on = [
    google_project_service.apis,
    google_service_networking_connection.private_vpc_connection,
  ]
}

resource "google_sql_database" "gameworld" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "gameworld" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.gameworld_db_user.result
}

# PostGIS ships with Cloud SQL's Postgres images and only needs `CREATE EXTENSION`; pgvector
# additionally needs the `cloudsql.enable_pgvector` database flag above before the extension is
# creatable. Both run once per environment against the freshly-created database.
resource "postgresql_extension" "postgis" {
  name     = "postgis"
  database = google_sql_database.gameworld.name

  depends_on = [google_sql_database.gameworld]
}

resource "postgresql_extension" "vector" {
  name     = "vector"
  database = google_sql_database.gameworld.name

  depends_on = [google_sql_database.gameworld]
}

# GRANT the app user full rights on its own database — Cloud SQL's `postgres` superuser owns the
# database by default otherwise.
resource "postgresql_grant" "gameworld_all" {
  database    = google_sql_database.gameworld.name
  role        = google_sql_user.gameworld.name
  schema      = "public"
  object_type = "schema"
  privileges  = ["CREATE", "USAGE"]

  depends_on = [google_sql_user.gameworld]
}
