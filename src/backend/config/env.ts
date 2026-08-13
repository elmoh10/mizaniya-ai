/**
 * Backend Environment Configuration
 * ---------------------------------
 * Centralized environment-variable validation for Mizaniya AI backend.
 *
 * IMPORTANT:
 * - Never hardcode secrets in this file.
 * - Secrets must come from Cloud Run / Secret Manager.
 * - Production/staging deployments fail fast when required variables are missing.
 */

type BackendEnv = {
  NODE_ENV: string;

  // Firebase / GCP
  FIREBASE_PROJECT_ID: string;
  FIRESTORE_DATABASE_ID: string;
  GCP_PROJECT: string;

  // Redis
  REDIS_HOST: string;
  REDIS_PORT: string;

  // Gemini
  GEMINI_API_KEY: string;

  // Telegram
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_WEBHOOK_URL: string;

  // Security / CORS
  ALLOWED_ORIGINS: string;

  // Runtime
  PORT: string;
};

/**
 * Read an environment variable safely.
 */
function getEnv(name: string, fallback = ''): string {
  return String(process.env[name] ?? fallback).trim();
}

/**
 * Required backend environment variables.
 *
 * Keep every variable here ONLY ONCE.
 */
const requiredBackendVars = [
  'FIREBASE_PROJECT_ID',
  'FIRESTORE_DATABASE_ID',
  'GCP_PROJECT',

  'REDIS_HOST',
  'REDIS_PORT',

  'GEMINI_API_KEY',

  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',

  'ALLOWED_ORIGINS',
] as const;

/**
 * Validate backend environment variables.
 *
 * In production/staging Cloud Run deployments we fail fast
 * instead of allowing the application to start with an
 * incomplete configuration.
 */
export function validateBackendEnv(): void {
  const missing = requiredBackendVars.filter((name) => {
    const value = process.env[name];

    return (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    );
  });

  if (missing.length > 0) {
    throw new Error(
      `[CRITICAL BACKEND CONFIG ERROR] Missing required production environment variables: ${missing.join(
        ', ',
      )}`,
    );
  }

  /**
   * Validate Redis port.
   */
  const redisPort = Number(getEnv('REDIS_PORT'));

  if (
    !Number.isInteger(redisPort) ||
    redisPort <= 0 ||
    redisPort > 65535
  ) {
    throw new Error(
      '[CRITICAL BACKEND CONFIG ERROR] REDIS_PORT must be a valid TCP port.',
    );
  }

  /**
   * Telegram webhook secret requirements.
   *
   * Telegram accepts:
   * A-Z
   * a-z
   * 0-9
   * _
   * -
   *
   * Maximum length: 256 characters.
   */
  const telegramWebhookSecret = getEnv(
    'TELEGRAM_WEBHOOK_SECRET',
  );

  if (
    !/^[A-Za-z0-9_-]{1,256}$/.test(
      telegramWebhookSecret,
    )
  ) {
    throw new Error(
      '[CRITICAL BACKEND CONFIG ERROR] TELEGRAM_WEBHOOK_SECRET contains invalid characters.',
    );
  }

  /**
   * Validate allowed origins.
   */
  const allowedOrigins = getEnv('ALLOWED_ORIGINS');

  if (!allowedOrigins) {
    throw new Error(
      '[CRITICAL BACKEND CONFIG ERROR] ALLOWED_ORIGINS cannot be empty.',
    );
  }
}

/**
 * Parsed backend configuration.
 *
 * Other backend files should preferably import this object
 * instead of reading process.env repeatedly.
 */
export const backendEnv: BackendEnv = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),

  // Firebase / GCP
  FIREBASE_PROJECT_ID: getEnv(
    'FIREBASE_PROJECT_ID',
  ),

  FIRESTORE_DATABASE_ID: getEnv(
    'FIRESTORE_DATABASE_ID',
    '(default)',
  ),

  GCP_PROJECT: getEnv('GCP_PROJECT'),

  // Redis
  REDIS_HOST: getEnv('REDIS_HOST'),

  REDIS_PORT: getEnv('REDIS_PORT', '6379'),

  // Gemini
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY'),

  // Telegram
  TELEGRAM_BOT_TOKEN: getEnv(
    'TELEGRAM_BOT_TOKEN',
  ),

  TELEGRAM_WEBHOOK_SECRET: getEnv(
    'TELEGRAM_WEBHOOK_SECRET',
  ),

  TELEGRAM_WEBHOOK_URL: getEnv(
    'TELEGRAM_WEBHOOK_URL',
    'https://mizaniyaai.online/telegram/webhook',
  ),

  // Security / CORS
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS'),

  // Cloud Run injects PORT automatically.
  PORT: getEnv('PORT', '3000'),
};

/**
 * Run validation automatically for deployed environments.
 *
 * Cloud Run should never start with an incomplete production
 * configuration.
 */
const isProductionLike =
  backendEnv.NODE_ENV === 'production' ||
  backendEnv.NODE_ENV === 'staging';

if (isProductionLike) {
  validateBackendEnv();
}

export default backendEnv;
