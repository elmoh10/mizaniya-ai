import localConfig from '../../firebase-applet-config.json';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Validates and retrieves Firebase Client configuration for Vite Frontend Browser Runtime.
 *
 * In Production: Configuration MUST come exclusively from VITE_FIREBASE_* env vars.
 * Throws a clear configuration error if any required variable is missing.
 *
 * In Development: Falls back to firebase-applet-config.json for AI Studio preview.
 */
export function getFirebaseClientConfig(): FirebaseClientConfig {
  const metaEnv = (import.meta as any).env || {};
  const isProd = Boolean(metaEnv.PROD) || metaEnv.MODE === 'production';

  const apiKey = metaEnv.VITE_FIREBASE_API_KEY;
  const projectId = metaEnv.VITE_FIREBASE_PROJECT_ID;
  const authDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
  const storageBucket = metaEnv.VITE_FIREBASE_STORAGE_BUCKET;
  const appId = metaEnv.VITE_FIREBASE_APP_ID;
  const messagingSenderId = metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID;

  if (isProd) {
    const missing: string[] = [];
    if (!apiKey) missing.push('VITE_FIREBASE_API_KEY');
    if (!projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
    if (!authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
    if (!storageBucket) missing.push('VITE_FIREBASE_STORAGE_BUCKET');
    if (!appId) missing.push('VITE_FIREBASE_APP_ID');
    if (!messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID');

    if (missing.length > 0) {
      throw new Error(
        `[CRITICAL CONFIG ERROR] Production build is missing required Firebase environment variables: ${missing.join(
          ', '
        )}. Production MUST pass VITE_FIREBASE_* variables at build time.`
      );
    }

    return {
      apiKey,
      projectId,
      authDomain,
      storageBucket,
      appId,
      messagingSenderId,
    };
  }

  // Development mode fallback
  return {
    apiKey: apiKey || localConfig.apiKey || '',
    authDomain: authDomain || localConfig.authDomain || '',
    projectId: projectId || localConfig.projectId || '',
    storageBucket: storageBucket || localConfig.storageBucket || '',
    messagingSenderId: messagingSenderId || localConfig.messagingSenderId || '',
    appId: appId || localConfig.appId || '',
  };
}
