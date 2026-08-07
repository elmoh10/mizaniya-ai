#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap for the CURRENT staging environment only.
PROJECT="${GCP_PROJECT_ID:-mizaniya-ai-staging}"
REGION="${GCP_REGION:-europe-west3}"
TFSTATE_BUCKET="${PROJECT}-tfstate"
ARTIFACT_REPO="mizaniya-repo"
SECRET_NAME="gemini-api-key"

echo "=== MIZANIYA AI STAGING BOOTSTRAP ==="

gcloud config set project "$PROJECT"

echo "[1/4] Enabling bootstrap APIs..."
gcloud services enable \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  --project="$PROJECT"

echo "[2/4] Ensuring remote Terraform state bucket exists..."
if ! gcloud storage buckets describe "gs://${TFSTATE_BUCKET}" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${TFSTATE_BUCKET}" \
    --project="$PROJECT" \
    --location="$REGION" \
    --uniform-bucket-level-access
  gcloud storage buckets update "gs://${TFSTATE_BUCKET}" --versioning
fi

echo "[3/4] Ensuring Artifact Registry repository exists..."
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT" \
    --description="Mizaniya AI Staging Docker Repository"
fi

echo "[4/4] Ensuring Secret Manager shell exists..."
if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME" \
    --replication-policy="automatic" \
    --project="$PROJECT"
fi

cat <<INFO

Bootstrap resources are ready.

NEXT REQUIRED MANUAL STEP:
Add at least one ENABLED Gemini secret version WITHOUT committing the key anywhere:

  printf '%s' \"\$GEMINI_API_KEY\" | \\
    gcloud secrets versions add ${SECRET_NAME} \\
      --data-file=- \\
      --project=${PROJECT}

Then confirm:

  gcloud secrets versions list ${SECRET_NAME} --project=${PROJECT}

Firestore is EXTERNALLY MANAGED and is NOT created by Terraform.
Expected staging Firestore database: projects/${PROJECT}/databases/(default)
INFO
