terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    # Used only to run `CREATE EXTENSION` on the freshly-created Cloud SQL instance (see
    # database.tf) — Terraform's google provider can create the instance/database but has no
    # resource for enabling Postgres extensions inside it.
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.23"
    }
  }

  # Uncomment and point at a real GCS bucket before running this in a team setting — local state
  # is fine for a first solo apply, not for anything shared.
  # backend "gcs" {
  #   bucket = "gameworld-terraform-state"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Talks to the Cloud SQL instance over its public IP using the one-time setup password generated
# in database.tf, purely to run `CREATE EXTENSION`. Requires the machine running `terraform apply`
# to be allow-listed — see database.tf's `authorized_networks` / var.terraform_runner_cidr.
provider "postgresql" {
  host            = google_sql_database_instance.main.public_ip_address
  port            = 5432
  username        = "postgres"
  password        = random_password.postgres_root.result
  sslmode         = "require"
  connect_timeout = 15
  superuser       = false
}
