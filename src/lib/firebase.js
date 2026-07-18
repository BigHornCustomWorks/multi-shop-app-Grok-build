import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FIREBASE_CONFIG_KEY } from '../config';

let app = null;
let auth = null;
let db = null;
let storage = null;

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
