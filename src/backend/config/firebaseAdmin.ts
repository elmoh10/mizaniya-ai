import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';

let firebaseApp: App;

let fileProjectId = '';
let fileDatabaseId = '';

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const cfg = JSON.parse(raw);
    if (cfg.projectId) fileProjectId = cfg.projectId;
    if (cfg.firestoreDatabaseId) fileDatabaseId = cfg.firestoreDatabaseId;
  }
} catch (e) {
  // ignore config read warning
}

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCP_PROJECT ||
  fileProjectId ||
  (process.env.NODE_ENV === 'test' ? 'mizaniya-ai-test' : '');

const databaseId =
  process.env.FIRESTORE_DATABASE_ID ||
  fileDatabaseId ||
  '(default)';

if (!projectId) {
  throw new Error(
    '[FIREBASE ADMIN CONFIG ERROR] FIREBASE_PROJECT_ID or GCP_PROJECT is required.'
  );
}

const existingApps = getApps();
if (!existingApps.length) {
  firebaseApp = initializeApp({
    projectId,
  });
} else {
  firebaseApp = existingApps[0]!;
}

export const db: Firestore = databaseId && databaseId !== '(default)'
  ? getFirestore(firebaseApp, databaseId)
  : getFirestore(firebaseApp);

export const auth: Auth = getAuth(firebaseApp);

console.log(`[Firebase Admin Initialized] Project: ${projectId}, Database: ${databaseId}`);

export default firebaseApp;
