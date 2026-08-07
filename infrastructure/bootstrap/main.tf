# Mizaniya AI Infrastructure Bootstrap Terraform Config
# Used to provision remote state GCS buckets prior to running main application Terraform.

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
  default     = "mizaniya-ai-egypt-staging"
  description = "GCP Project ID for Staging environment"
}

variable "prod_project_id" {
  type        = string
  default     = "mizaniya-ai-egypt-prod"
  description = "GCP Project ID for Production environment"
}

variable "gcp_region" {
  type        = string
  default     = "europe-west3"
  description = "Primary GCP region for state buckets"
}

# Staging Remote Terraform State GCS Bucket
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
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 5
    }
  }

  labels = {
    environment = "staging"
    managed_by  = "terraform-bootstrap"
  }
}

# Production Remote Terraform State GCS Bucket
resource "google_storage_bucket" "prod_tfstate" {
  project                     = var.prod_project_id
  name                        = "${var.prod_project_id}-tfstate"
  location                    = var.gcp_region
  force_destroy               = false
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 10
    }
  }

  labels = {
    environment = "production"
    managed_by  = "terraform-bootstrap"
  }
}

output "staging_tfstate_bucket" {
  value       = google_storage_bucket.staging_tfstate.name
  description = "GCS bucket name for Staging Terraform Remote State"
}

output "prod_tfstate_bucket" {
  value       = google_storage_bucket.prod_tfstate.name
  description = "GCS bucket name for Production Terraform Remote State"
}
