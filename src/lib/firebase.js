import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FIREBASE_CONFIG_KEY } from '../config';

let app = null;
let auth = null;
let db = null;
let storage = null;

/**
 * Accepts:
 * - Strict JSON: {"apiKey":"...","projectId":"..."}
 * - Firebase console JS snippet: const firebaseConfig = { apiKey: "...", ... };
 * - Bare object: { apiKey: "...", projectId: "..." }
 */
export function parseFirebaseConfigText(raw) {
  let text = String(raw || '').trim();
  if (!text) throw new Error('Paste is empty.');

  // Strip markdown fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:js|javascript|json)?\s*/i, '').replace(/\s*```$/i, '');
  }

  // Pull out object from "const firebaseConfig = { ... };" or similar
  const assign = text.match(
    /(?:const|let|var)\s+\w+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m
  );
  if (assign) {
    text = assign[1];
  } else {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  // Try strict JSON first
  try {
    const asJson = JSON.parse(text);
    return normalizeFirebaseConfig(asJson);
  } catch {
    /* fall through — convert JS object literal to JSON */
  }

  // Quote unquoted keys: apiKey: → "apiKey":
  let jsLike = text.replace(/([,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  // Single-quoted strings → double-quoted
  jsLike = jsLike.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => {
    return `"${inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  // Trailing commas before } or ]
  jsLike = jsLike.replace(/,(\s*[}\]])/g, '$1');

  try {
    const parsed = JSON.parse(jsLike);
    return normalizeFirebaseConfig(parsed);
  } catch (e) {
    throw new Error(
      'Could not read that config. Paste the whole firebaseConfig object from Firebase Project settings → Your apps → Web → Config.'
    );
  }
}

function normalizeFirebaseConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config must be an object.');
  }
  const apiKey = parsed.apiKey || parsed.api_key;
  const projectId = parsed.projectId || parsed.project_id;
  if (!apiKey || !projectId) {
    throw new Error('Missing apiKey or projectId in the config.');
  }
  return {
    apiKey: String(apiKey),
    authDomain: parsed.authDomain || parsed.auth_domain || `${projectId}.firebaseapp.com`,
    projectId: String(projectId),
    storageBucket: parsed.storageBucket || parsed.storage_bucket || '',
    messagingSenderId: String(
      parsed.messagingSenderId || parsed.messaging_sender_id || ''
    ),
    appId: String(parsed.appId || parsed.app_id || ''),
    ...(parsed.measurementId || parsed.measurement_id
      ? { measurementId: String(parsed.measurementId || parsed.measurement_id) }
      : {}),
  };
}

export function loadFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load Firebase config', e);
  }
  return null;
}

export function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

export function clearFirebaseConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
}

export function initFirebase(config) {
  if (!config) return getFirebase();
  if (app) return getFirebase();

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  return { app, auth, db, storage };
}

export function getFirebase() {
  if (!app) {
    const config = loadFirebaseConfig();
    if (config) initFirebase(config);
  }
  return { app, auth, db, storage };
}

export function isFirebaseReady() {
  const { app: a } = getFirebase();
  return Boolean(a);
}
