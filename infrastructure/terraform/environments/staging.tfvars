environment           = "staging"
gcp_project_id        = "mizaniya-ai-staging"
gcp_region            = "europe-west3"
firestore_database_id = "(default)"
# Firebase Hosting origins are pre-approved. The Cloud Run service's own origin is
# also allowed dynamically by server.ts for same-origin browser traffic.
allowed_origins       = "https://mizaniya-ai-staging.web.app,https://mizaniya-ai-staging.firebaseapp.com"
