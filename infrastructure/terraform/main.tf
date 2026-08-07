# MIZANIYA AI — Staging/Production GCP Infrastructure
# Firestore, Artifact Registry and the Gemini Secret are intentionally treated
# as externally bootstrapped resources to avoid duplicate-ownership conflicts.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  backend "gcs" {}
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

variable "environment" {
  type        = string
  description = "Deployment environment name (staging or production)"
  default     = "staging"
}

variable "gcp_project_id" {
  type        = string
  description = "Canonical GCP / Firebase project ID"
}

variable "gcp_region" {
  type        = string
  default     = "europe-west3"
  description = "Primary Cloud Run deployment region"
}

variable "firestore_database_id" {
  type        = string
  description = "Existing canonical Firestore database ID"
}

variable "container_image" {
  type        = string
  description = "Immutable Docker image tag for Cloud Run deployment"
}

variable "allowed_origins" {
  type        = string
  description = "Comma-separated browser origins allowed by CORS"
}

# 1. Required APIs
resource "google_project_service" "required_services" {
  for_each = toset([
    "run.googleapis.com",
    "compute.googleapis.com",
    "firestore.googleapis.com",
    "redis.googleapis.com",
    "vpcaccess.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "bigquery.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com"
  ])

  project            = var.gcp_project_id
  service            = each.key
  disable_on_destroy = false
}

# Artifact Registry is bootstrapped before application CI pushes an image.
# It is deliberately not created here to avoid CI/Terraform ownership conflicts.

# The Gemini Secret resource and its first enabled version are bootstrapped
# outside this module. Terraform only reads the existing resource.
data "google_secret_manager_secret" "gemini_api_key" {
  project   = var.gcp_project_id
  secret_id = "gemini-api-key"
  depends_on = [google_project_service.required_services]
}

# 2. VPC & Serverless connector for Memorystore
resource "google_compute_network" "vpc_network" {
  name                    = "mizaniya-vpc-network-${var.environment}"
  auto_create_subnetworks = true
  depends_on              = [google_project_service.required_services]
}

resource "google_vpc_access_connector" "vpc_connector" {
  name          = "mizaniya-vpc-connector-staging"
  region        = var.gcp_region
  network       = google_compute_network.vpc_network.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 3
}

# 3. Runtime service account
resource "google_service_account" "app_sa" {
  account_id   = "mizaniya-app-sa-${var.environment}"
  display_name = "Mizaniya AI Application Service Account (${var.environment})"
  depends_on   = [google_project_service.required_services]
}

resource "google_project_iam_member" "firestore_user" {
  project = var.gcp_project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "pubsub_publisher" {
  project = var.gcp_project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "cloudtasks_enqueuer" {
  project = var.gcp_project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "bigquery_data_editor" {
  project = var.gcp_project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_key_accessor" {
  project   = var.gcp_project_id
  secret_id = data.google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_sa.email}"
}

# 4. Memorystore Redis — mandatory shared dependency in staging/production
resource "google_redis_instance" "cache" {
  name               = "mizaniya-redis-${var.environment}"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.gcp_region
  authorized_network = google_compute_network.vpc_network.id
  depends_on         = [google_project_service.required_services]
}

# 5. Event infrastructure
resource "google_pubsub_topic" "financial_events" {
  name       = "mizaniya-financial-events"
  depends_on = [google_project_service.required_services]
}

resource "google_pubsub_subscription" "financial_events_sub" {
  name  = "mizaniya-financial-events-sub"
  topic = google_pubsub_topic.financial_events.name
}

resource "google_cloud_tasks_queue" "async_tasks" {
  name       = "mizaniya-async-tasks"
  location   = var.gcp_region
  depends_on = [google_project_service.required_services]
}

resource "google_bigquery_dataset" "analytics" {
  dataset_id  = "mizaniya_analytics_${var.environment}"
  description = "Anonymized Mizaniya AI Product Analytics (${var.environment})"
  location    = "EU"
  depends_on  = [google_project_service.required_services]
}

# Firestore is intentionally externally managed. The existing staging database is:
# project: mizaniya-ai-staging, database: (default), location: europe-west3.
# Never create or recreate it from this module.

# 6. Cloud Run
resource "google_cloud_run_v2_service" "mizaniya_app" {
  name     = "mizaniya-app-service"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  depends_on = [
    google_project_service.required_services,
    google_redis_instance.cache,
    google_secret_manager_secret_iam_member.gemini_key_accessor
  ]

  template {
    service_account = google_service_account.app_sa.email

    vpc_access {
      connector = google_vpc_access_connector.vpc_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "2000m"
          memory = "2Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "APP_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.gcp_project_id
      }
      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }
      env {
        name  = "GCP_PROJECT"
        value = var.gcp_project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.gcp_region
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.cache.host
      }
      env {
        name  = "REDIS_PORT"
        value = tostring(google_redis_instance.cache.port)
      }
      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = data.google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_binding" "public_access" {
  location = google_cloud_run_v2_service.mizaniya_app.location
  name     = google_cloud_run_v2_service.mizaniya_app.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

output "cloud_run_url" {
  value       = google_cloud_run_v2_service.mizaniya_app.uri
  description = "URL of the deployed Cloud Run application"
}

output "redis_host" {
  value       = google_redis_instance.cache.host
  description = "Private Redis host used by Cloud Run"
  sensitive   = true
}
