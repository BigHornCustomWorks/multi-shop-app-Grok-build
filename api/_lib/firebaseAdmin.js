/**
 * Firebase Admin (service account) for trusted server writes.
 * Required for /api/join-shop (sets companyId + role on users).
 *
 * Vercel env: FIREBASE_SERVICE_ACCOUNT_JSON
 *   - Full JSON of the service account key (string), OR
 *   - Base64-encoded JSON
 *
 * Create key: Firebase Console → Project settings → Service accounts → Generate new private key
 */

import admin from 'firebase-admin';
import { env } from './env.js';

let initialized = false;

function parseServiceAccount() {
  const raw = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) {
    throw new Error(
      'Missing FIREBASE_SERVICE_ACCOUNT_JSON on the server. ' +
        'Add the Firebase service account JSON (or base64) in Vercel env, then Redeploy. ' +
        'Required for shop join (setting companyId/role).'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64 JSON.'
      );
    }
  }
  if (parsed.private_key && typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key.'
    );
  }
  return parsed;
}

export function getFirebaseAdmin() {
  if (!initialized) {
    const sa = parseServiceAccount();
    const projectId =
      sa.project_id || env('FIREBASE_PROJECT_ID') || env('VITE_FIREBASE_PROJECT_ID');
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId,
      });
    }
    initialized = true;
  }
  return admin;
}

export function adminDb() {
  return getFirebaseAdmin().firestore();
}
