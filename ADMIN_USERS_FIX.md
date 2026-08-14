# Admin User Directory Fix

The Admin dashboard user count comes from Firestore, while the detailed user directory comes from Firebase Authentication via `auth.listUsers()`.

The Cloud Run runtime service account previously had Firestore access but no Firebase Authentication read permission. This patch grants the least-privilege predefined role `roles/firebaseauth.viewer` to the runtime service account.

The Admin UI now also shows the backend error instead of silently displaying an empty directory when the API call fails.

After pushing to `main`, Terraform should add the IAM binding automatically during the staging deployment. Log out/in if needed, then reopen the Admin dashboard.
