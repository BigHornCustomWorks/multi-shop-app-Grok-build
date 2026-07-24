import { env } from './env.js';

function projectId() {
  return env('FIREBASE_PROJECT_ID') || env('VITE_FIREBASE_PROJECT_ID') || '';
}

function docUrl(path) {
  const pid = projectId();
  if (!pid) throw new Error('Missing FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID on server');
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${path}`;
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function decodeValue(fv) {
  if (!fv || typeof fv !== 'object') return null;
  if ('nullValue' in fv) return null;
  if ('stringValue' in fv) return fv.stringValue;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('timestampValue' in fv) return fv.timestampValue;
  if ('arrayValue' in fv) {
    return (fv.arrayValue.values || []).map(decodeValue);
  }
  if ('mapValue' in fv) {
    const out = {};
    const fields = fv.mapValue.fields || {};
    for (const [k, val] of Object.entries(fields)) {
      out[k] = decodeValue(val);
    }
    return out;
  }
  return null;
}

export function decodeDocument(doc) {
  if (!doc?.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = decodeValue(v);
  }
  // id from name: .../documents/companies/abc
  const name = doc.name || '';
  const parts = name.split('/');
  out.id = parts[parts.length - 1] || out.id;
  return out;
}

export async function firestoreGet(path, idToken) {
  const res = await fetch(docUrl(path), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Firestore GET failed (${res.status})`);
  }
  return decodeDocument(data);
}

/** Patch/merge fields on a document (creates if missing with merge semantics via patch) */
export async function firestorePatch(path, fields, idToken, { existOk = true } = {}) {
  const fieldPaths = Object.keys(fields);
  const qs = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = {
    fields: {},
  };
  for (const [k, v] of Object.entries(fields)) {
    body.fields[k] = encodeValue(v);
  }
  const res = await fetch(`${docUrl(path)}?${qs}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Firestore PATCH failed (${res.status})`);
  }
  return decodeDocument(data);
}

export async function firestoreDelete(path, idToken) {
  const res = await fetch(docUrl(path), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `Firestore DELETE failed (${res.status})`);
  }
}

export async function firestoreSet(path, fields, idToken) {
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    body.fields[k] = encodeValue(v);
  }
  // PATCH with all fields creates if not exists when using updateMask of all keys
  return firestorePatch(path, fields, idToken);
}

/**
 * Verify caller may act for companyId: same company membership OR platform_admin.
 */
export async function assertCompanyAccess(idToken, uid, companyId) {
  if (!companyId) throw new Error('companyId is required');
  const user = await firestoreGet(`users/${uid}`, idToken);
  if (!user) throw new Error('User profile not found');
  if (user.active === false) throw new Error('Account deactivated');
  if (user.role === 'platform_admin') {
    return { user, isPlatformAdmin: true };
  }
  if (user.companyId !== companyId) {
    const err = new Error('Forbidden: you do not belong to this shop.');
    err.statusCode = 403;
    throw err;
  }
  return { user, isPlatformAdmin: false };
}

export async function assertPlatformAdmin(idToken, uid) {
  const user = await firestoreGet(`users/${uid}`, idToken);
  if (!user || user.role !== 'platform_admin') {
    const err = new Error('Platform admin only.');
    err.statusCode = 403;
    throw err;
  }
  if (user.active === false) throw new Error('Account deactivated');
  return user;
}
