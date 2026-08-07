# Mizaniya AI v6.4 Safe Merge

This package merges the latest wallet/profile/logout application changes with the staging infrastructure configuration that previously deployed successfully.

Preserved/hardened deployment items:
- Root Dockerfile restored.
- Terraform remote GCS state preserved (`mizaniya-ai-staging-tfstate`).
- Terraform 1.15.5 workflow preserved.
- Existing Cloud Run service import guard preserved.
- Firestore, Artifact Registry, and `gemini-api-key` remain externally bootstrapped (not recreated by Terraform).
- Cloud Run does not set reserved `PORT` as an env var; container port remains 3000.
- VPC connector uses short valid names and explicit min/max instances.
- Staging CORS allowlist includes current Cloud Run URL and Firebase Hosting origins.
- CORS middleware is scoped to `/api/v1`, so frontend static assets cannot be blocked by API CORS rules.

Application additions retained:
- Default cash wallet creation during onboarding and zero-wallet listing.
- Wallet management UI and APIs.
- Wallet selection for transactions.
- Profile view/update flow.
- Header profile dropdown and Firebase logout.
- Wallet/profile validation tests plus static idempotency guardrails.

Verification performed in this environment:
- GitHub Actions YAML parsed successfully.
- Static deployment guard checks passed.
- Dockerfile exists at repository root.
- `npm ci` could not be completed because the execution environment's internal npm mirror does not contain `zod@4.4.3`; GitHub Actions must perform the authoritative lint/test/build verification.
