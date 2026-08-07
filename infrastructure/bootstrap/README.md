# Mizaniya AI Infrastructure Bootstrap & First Staging Deployment Guide

This directory provides the initial bootstrap resources and instructions required before deploying Mizaniya AI for the first time.

---

## Remote Terraform State Setup

Terraform uses Google Cloud Storage (`gcs`) to maintain persistent infrastructure state across ephemeral CI/CD runners.

### Step 1: Run Bootstrap Script
Execute `infrastructure/bootstrap/bootstrap.sh` or run the commands manually:

```bash
# 1. Enable Cloud APIs
gcloud services enable storage.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com --project="mizaniya-ai-staging"

# 2. Create Terraform State Bucket for Staging
gcloud storage buckets create "gs://mizaniya-ai-staging-tfstate" \
  --project="mizaniya-ai-staging" \
  --location="europe-west3" \
  --uniform-bucket-level-access

gcloud storage buckets update "gs://mizaniya-ai-staging-tfstate" --versioning

# 3. Create Terraform State Bucket for Production
gcloud storage buckets create "gs://mizaniya-ai-egypt-prod-tfstate" \
  --project="mizaniya-ai-egypt-prod" \
  --location="europe-west3" \
  --uniform-bucket-level-access

gcloud storage buckets update "gs://mizaniya-ai-egypt-prod-tfstate" --versioning
```

---

## Secret Manager Bootstrap (Gemini API Key)

Terraform creates the Secret Manager resource shell `gemini-api-key`, but intentionally **does NOT** store secret plaintext values inside state.

You **MUST** add at least one enabled secret version before Cloud Run deployment:

```bash
# Staging Secret Provisioning
printf '%s' "$STAGING_GEMINI_API_KEY" | \
  gcloud secrets versions add gemini-api-key \
  --data-file=- \
  --project="mizaniya-ai-staging"

# Production Secret Provisioning
printf '%s' "$PROD_GEMINI_API_KEY" | \
  gcloud secrets versions add gemini-api-key \
  --data-file=- \
  --project="mizaniya-ai-egypt-prod"
```

---

## Complete 19-Step First Staging Deployment Procedure

Follow these ordered steps to execute a clean initial deployment:

1. **Create/Verify Staging GCP & Firebase Project**: Ensure project `mizaniya-ai-staging` exists in Google Cloud Console.
2. **Enable Billing**: Verify billing is linked to `mizaniya-ai-staging`.
3. **Bootstrap Terraform State Bucket**: Run `gcloud storage buckets create gs://mizaniya-ai-staging-tfstate`.
4. **Configure Workload Identity Federation**: Set up Workload Identity Pool and Service Account `mizaniya-deploy-sa@mizaniya-ai-staging.iam.gserviceaccount.com`.
5. **Configure Firebase Authentication**: Enable Email/Password or Identity Providers in Firebase Console for `mizaniya-ai-egypt-staging`.
6. **Create Firebase Web App**: Register Web App in Firebase Console to obtain `appId` and credentials.
7. **Obtain Staging VITE_FIREBASE_* Values**: Add `STAGING_VITE_FIREBASE_API_KEY`, `STAGING_VITE_FIREBASE_APP_ID`, and `STAGING_VITE_FIREBASE_MESSAGING_SENDER_ID` to GitHub Secrets.
8. **Bootstrap Secret Manager gemini-api-key Version**: Add initial secret version via `gcloud secrets versions add gemini-api-key`.
9. **Bootstrap/Import Firestore Database**: Initialize native Firestore database `mizaniyaai-staging` or import if existing (`terraform import google_firestore_database.database projects/mizaniya-ai-egypt-staging/databases/mizaniyaai-staging`).
10. **Run CI Validation**: Push commit or PR to trigger `npm ci`, `npm run lint`, `npm run test`, `npm run build`, and `docker build`.
11. **Build Docker Image**: GitHub Action builds multi-stage Docker image with build args.
12. **Push Artifact Registry**: CI pushes immutable image tag `europe-west3-docker.pkg.dev/mizaniya-ai-egypt-staging/mizaniya-repo/mizaniya-app:<git-sha>`.
13. **Terraform Apply**: CI applies Terraform infrastructure using `environments/staging.tfvars`.
14. **Get Cloud Run URL**: Query deployed URL via `gcloud run services describe mizaniya-app-service`.
15. **Configure/Update Staging ALLOWED_ORIGINS**: Append the newly generated Cloud Run service URL to `allowed_origins` in `staging.tfvars` or environment variables.
16. **Terraform Apply Again**: Run `terraform apply` if CORS allowed origins were modified.
17. **Test /health Probe**: Verify `curl -f $SERVICE_URL/health` returns `200 OK`.
18. **Test /ready Probe**: Verify `curl -f $SERVICE_URL/ready` returns `200 OK`.
19. **Run E2E Beta Flow**: Perform automated/manual end-to-end smoke testing on the staging URL.
