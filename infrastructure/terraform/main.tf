# MIZANIYA AI Enterprise GCP Infrastructure Setup

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Remote State Storage in Google Cloud Storage
  # Configure via 'terraform init -backend-config="bucket=<GCS_TFSTATE_BUCKET>" -backend-config="prefix=<ENVIRONMENT>"'
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
  description = "The canonical GCP / Firebase project ID"
}

variable "gcp_region" {
  type        = string
  default     = "europe-west3"
  description = "Primary Cloud Run deployment region"
}

variable "firestore_database_id" {
  type        = string
  description = "Canonical Firestore database ID"
}

variable "container_image" {
  type        = string
  description = "Immutable Docker image tag for Cloud Run deployment (e.g. europe-west3-docker.pkg.dev/.../mizaniya-app:<commit-sha>)"
}

variable "allowed_origins" {
  type        = string
  description = "Allowed origins for CORS policy (e.g. https://mizaniya.example.com)"
}

# 1. Enable Required Google Cloud APIs
resource "google_project_service" "required_services" {
  for_each = toset([
    "run.googleapis.com",
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

# 2. Artifact Registry Repository
resource "google_artifact_registry_repository" "mizaniya_repo" {
  location      = var.gcp_region
  repository_id = "mizaniya-repo"
  description   = "Docker container repository for Mizaniya AI Application"
  format        = "DOCKER"
  depends_on    = [google_project_service.required_services]
}

# 3. VPC Network & Serverless VPC Connector for Redis
resource "google_compute_network" "vpc_network" {
  name                    = "mizaniya-vpc-network-${var.environment}"
  auto_create_subnetworks = true
  depends_on              = [google_project_service.required_services]
}

resource "google_vpc_access_connector" "vpc_connector" {
  name          = "mizaniya-vpc-${var.environment}"
  region        = var.gcp_region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc_network.name
  depends_on    = [google_project_service.required_services]
}

# 4. Service Account with Least Privilege
resource "google_service_account" "app_sa" {
  account_id   = "mizaniya-app-sa-${var.environment}"
  display_name = "Mizaniya AI Application Service Account (${var.environment})"
  depends_on   = [google_project_service.required_services]
}

# Service Account IAM Roles
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

resource "google_project_iam_member" "bigquery_editor" {
  project = var.gcp_project_id
  role    = "roles/bigquery.dataEditor"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_key_accessor" {
  secret_id = google_secret_manager_secret.gemini_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_sa.email}"
}

# 5. Cloud Run Service (Canonical Service Name: mizaniya-app-service)
resource "google_cloud_run_v2_service" "mizaniya_app" {
  name       = "mizaniya-app-service"
  location   = var.gcp_region
  ingress    = "INGRESS_TRAFFIC_ALL"
  depends_on = [google_project_service.required_services]

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
        value = var.environment == "production" ? "production" : "staging"
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
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

# Allow Public Web Traffic for Cloud Run
resource "google_cloud_run_v2_service_iam_binding" "public_access" {
  location = google_cloud_run_v2_service.mizaniya_app.location
  name     = google_cloud_run_v2_service.mizaniya_app.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

# 6. Firestore Database
resource "google_firestore_database" "database" {
  project     = var.gcp_project_id
  name        = var.firestore_database_id
  location_id = "eur3"
  type        = "FIRESTORE_NATIVE"
  depends_on  = [google_project_service.required_services]
}

# 7. Memorystore (Redis)
resource "google_redis_instance" "cache" {
  name               = "mizaniya-redis-${var.environment}"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.gcp_region
  authorized_network = google_compute_network.vpc_network.id
  depends_on         = [google_project_service.required_services]
}

# 8. Pub/Sub Topics & Subscriptions
resource "google_pubsub_topic" "financial_events" {
  name       = "mizaniya-financial-events"
  depends_on = [google_project_service.required_services]
}

resource "google_pubsub_subscription" "financial_events_sub" {
  name  = "mizaniya-financial-events-sub"
  topic = google_pubsub_topic.financial_events.name
}

# 9. Cloud Tasks Queue
resource "google_cloud_tasks_queue" "async_tasks" {
  name       = "mizaniya-async-tasks"
  location   = var.gcp_region
  depends_on = [google_project_service.required_services]
}

# 10. BigQuery Analytics Dataset
resource "google_bigquery_dataset" "analytics" {
  dataset_id  = "mizaniya_analytics_${var.environment}"
  description = "Anonymized Mizaniya AI Product Analytics (${var.environment})"
  location    = "EU"
  depends_on  = [google_project_service.required_services]
}

# 11. Secret Manager Secrets
resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id  = "gemini-api-key"
  depends_on = [google_project_service.required_services]
  replication {
    auto {}
  }
}

output "cloud_run_url" {
  value       = google_cloud_run_v2_service.mizaniya_app.uri
  description = "The URL of the deployed Cloud Run application."
}
