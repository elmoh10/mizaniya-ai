# Mizaniya AI — First Staging Bootstrap

The main Terraform configuration intentionally **does not create or recreate** the existing Firestore database, Artifact Registry repository, or Gemini secret shell.

Canonical staging values:

- GCP/Firebase project: `mizaniya-ai-staging`
- Region: `europe-west3`
- Firestore database: `(default)` (already created manually)
- Terraform state bucket: `mizaniya-ai-staging-tfstate`
- Artifact Registry repository: `mizaniya-repo`
- Gemini secret: `gemini-api-key`

## One-time bootstrap

From an authenticated Google Cloud Shell or local `gcloud` session:

```bash
bash infrastructure/bootstrap/bootstrap.sh
```

This creates only the staging bootstrap resources that must exist before CI can push an image or initialize Terraform remote state.

## Add Gemini secret value securely

The bootstrap creates only the Secret Manager **resource shell**, never the key value.

```bash
export GEMINI_API_KEY='YOUR_REAL_KEY'
printf '%s' "$GEMINI_API_KEY" | \
  gcloud secrets versions add gemini-api-key \
    --data-file=- \
    --project=mizaniya-ai-staging
```

Verify an enabled version exists:

```bash
gcloud secrets versions list gemini-api-key \
  --project=mizaniya-ai-staging
```

Do not place the Gemini key in GitHub source code, Terraform variables, Docker build arguments, or `VITE_*` variables.

## Existing Firestore database

The database already exists and is externally managed:

```text
projects/mizaniya-ai-staging/databases/(default)
location: europe-west3
```

Do **not** run Terraform code that attempts to create another Firestore database.

## CI prerequisites

GitHub Actions requires:

- `GCP_SA_KEY` (temporary deployment credential currently being used)
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`

The workflow deliberately fails when the TF state bucket, Artifact Registry repository, or enabled Gemini secret version is missing. It never falls back to local Terraform state.
