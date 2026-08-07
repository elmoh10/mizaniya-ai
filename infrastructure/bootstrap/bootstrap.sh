#!/usr/bin/env bash
set -euo pipefail

# Mizaniya AI First-Time Infrastructure & Environment Bootstrap Script

STAGING_PROJECT="mizaniya-ai-egypt-staging"
PROD_PROJECT="mizaniya-ai-egypt-prod"
REGION="europe-west3"

echo "=== MIZANIYA AI BOOTSTRAP START ==="

# 1. Enable Storage API on both projects
echo "[1/4] Enabling Google Cloud Storage APIs..."
gcloud services enable storage.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com --project="$STAGING_PROJECT"
gcloud services enable storage.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com --project="$PROD_PROJECT"

# 2. Provision Staging State Bucket
echo "[2/4] Provisioning Staging TF State Bucket..."
if ! gcloud storage buckets describe "gs://${STAGING_PROJECT}-tfstate" --project="$STAGING_PROJECT" &>/dev/null; then
  gcloud storage buckets create "gs://${STAGING_PROJECT}-tfstate" \
    --project="$STAGING_PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
  gcloud storage buckets update "gs://${STAGING_PROJECT}-tfstate" --versioning
  echo "Created gs://${STAGING_PROJECT}-tfstate"
else
  echo "gs://${STAGING_PROJECT}-tfstate already exists."
fi

# 3. Provision Production State Bucket
echo "[3/4] Provisioning Production TF State Bucket..."
if ! gcloud storage buckets describe "gs://${PROD_PROJECT}-tfstate" --project="$PROD_PROJECT" &>/dev/null; then
  gcloud storage buckets create "gs://${PROD_PROJECT}-tfstate" \
    --project="$PROD_PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
  gcloud storage buckets update "gs://${PROD_PROJECT}-tfstate" --versioning
  echo "Created gs://${PROD_PROJECT}-tfstate"
else
  echo "gs://${PROD_PROJECT}-tfstate already exists."
fi

# 4. Artifact Registry Repositories
echo "[4/4] Ensuring Artifact Registry Repositories exist..."
gcloud artifacts repositories describe mizaniya-repo --location="$REGION" --project="$STAGING_PROJECT" &>/dev/null || \
  gcloud artifacts repositories create mizaniya-repo --repository-format=docker --location="$REGION" --project="$STAGING_PROJECT" --description="Mizaniya AI Staging Docker Repo"

gcloud artifacts repositories describe mizaniya-repo --location="$REGION" --project="$PROD_PROJECT" &>/dev/null || \
  gcloud artifacts repositories create mizaniya-repo --repository-format=docker --location="$REGION" --project="$PROD_PROJECT" --description="Mizaniya AI Production Docker Repo"

echo "=== MIZANIYA AI BOOTSTRAP COMPLETE ==="
