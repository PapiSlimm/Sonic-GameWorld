# VPC + private services access (for Cloud SQL/Memorystore private IPs) + a Serverless VPC
# Access connector (so Cloud Run can reach both over the private network instead of Cloud SQL's
# public IP / Memorystore not being reachable at all from serverless without one).

resource "google_compute_network" "vpc" {
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.apis]
}

resource "google_compute_global_address" "private_services_range" {
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges  = [google_compute_global_address.private_services_range.name]

  depends_on = [google_project_service.apis]
}

resource "google_compute_subnetwork" "connector_subnet" {
  name          = "${local.name}-connector-subnet"
  ip_cidr_range = var.vpc_cidr
  region        = var.region
  network       = google_compute_network.vpc.id
}

resource "google_vpc_access_connector" "connector" {
  name          = "${var.name_prefix}-${substr(var.environment, 0, 4)}-vpc"
  region        = var.region
  subnet {
    name = google_compute_subnetwork.connector_subnet.name
  }
  min_instances = 2
  max_instances = 3

  depends_on = [google_project_service.apis]
}

# Note: Cloud SQL's public-IP ingress is controlled by `authorized_networks` on the instance
# itself (database.tf), NOT by this VPC's firewall rules — traffic to a Cloud SQL public IP
# never traverses this VPC, so a `google_compute_firewall` resource here would have no effect on
# it. `var.terraform_runner_cidr` is consumed directly by database.tf instead.
