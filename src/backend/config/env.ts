/**
 * Backend Environment Variable Validation
 *
 * Validates required production backend environment variables.
 * Call on backend startup in production mode to fail fast if unconfigured.
 */
export function validateBackendEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const requiredBackendVars = [
    'FIREBASE_PROJECT_ID',
    'FIRESTORE_DATABASE_ID',
    'GCP_PROJECT',
    'REDIS_HOST',
    'REDIS_PORT',
    'GEMINI_API_KEY',
    'ALLOWED_ORIGINS',
  ];

  const missing = requiredBackendVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `[CRITICAL BACKEND CONFIG ERROR] Missing required production environment variables: ${missing.join(', ')}`
    );
  }
}
