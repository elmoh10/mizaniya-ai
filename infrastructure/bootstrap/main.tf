terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "staging_project_id" {
  type        = string
  default     = "mizaniya-ai-staging"
  description = "GCP Project ID for the staging environment"
}

variable "gcp_region" {
  type        = string
  default     = "europe-west3"
  description = "Region for the Terraform state bucket"
}

provider "google" {
  project = var.staging_project_id
  region  = var.gcp_region
}

resource "google_storage_bucket" "staging_tfstate" {
  project                     = var.staging_project_id
  name                        = "${var.staging_project_id}-tfstate"
  location                    = var.gcp_region
  force_destroy               = false
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition { num_newer_versions = 10 }
  }

  labels = {
    environment = "staging"
    managed_by  = "terraform-bootstrap"
  }
}

output "staging_tfstate_bucket" {
  value       = google_storage_bucket.staging_tfstate.name
  description = "GCS bucket name for Staging Terraform Remote State"
}
