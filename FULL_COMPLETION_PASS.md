# Mizaniya AI — Full Completion Pass

This batch was built on the latest uploaded baseline and focuses on production wiring rather than adding duplicate features.

## Completed in this pass

- Remote Feature Flags are now loaded by the main app and actually control Voice Assistant, OCR, Emergency Mode, and Family Wallet availability.
- Admin flag changes update the live application state immediately without requiring a full page reload.
- Admin Dashboard now includes a read-only Firebase Authentication user directory with role, disabled state, and last sign-in metadata.
- Admin metrics surface wallets, bills, environment, and uptime in addition to users and transactions.
- Optional Firebase App Check browser integration was added. When `VITE_FIREBASE_APP_CHECK_SITE_KEY` is configured, API requests automatically attach `X-Firebase-AppCheck`.
- Firestore rules now explicitly cover subscriptions and persisted smart notifications as owner-readable/backend-write-only collections.
- Feature-flag UI defaults were aligned with backend defaults.

## App Check activation

1. Configure Firebase App Check for the Web app with reCAPTCHA v3.
2. Add `VITE_FIREBASE_APP_CHECK_SITE_KEY` to the frontend build environment.
3. Deploy and confirm authenticated API calls include an App Check token.
4. Only then set backend `ENFORCE_APP_CHECK=true`.

Do not enable backend enforcement before the frontend key is deployed.

## Smoke test

- Sign in as a normal user: Admin button must remain hidden.
- Sign in as admin: Admin panel loads metrics and registered users.
- Toggle `voiceAssistant`: voice buttons disappear/reappear without manual code changes.
- Toggle `ocrReceiptScanner`: OCR entry points are disabled/enabled.
- Toggle `familyWallet`: Family page switches between locked and enabled state.
- Confirm notifications still load and mark read.
- If App Check is configured, verify API requests continue to succeed before enabling enforcement.
