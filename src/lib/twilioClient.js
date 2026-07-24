import { getFirebase } from './firebase';

/**
 * Parse API response — detects when Vite/SPA HTML is returned instead of JSON
 * (usually means /api is not on the deployed host or rewrite swallowed the route).
 */
export async function parseApiResponse(res, label = 'Request') {
  const raw = await res.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      const looksHtml = /^\s*</.test(raw) || /<!DOCTYPE/i.test(raw);
      if (looksHtml || res.status === 404) {
        throw new Error(
          `${label}: API route not found (got HTML page). Confirm you are on the Vercel site URL (not only localhost without vercel dev), redeploy after adding /api files, and that vercel.json does not rewrite /api to index.html.`
        );
      }
      throw new Error(
        `${label}: server returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 160)}`
      );
    }
  }
  if (!res.ok) {
    const parts = [data.error || `${label} failed (HTTP ${res.status})`];
    if (data.hint) parts.push(data.hint);
    if (data.code) parts.push(`(code ${data.code})`);
    throw new Error(parts.join(' '));
  }
  return data;
}

export async function getAuthBearer() {
  const { auth } = getFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('You must be signed in.');
  return user.getIdToken();
}

/** GET /api/twilio-status — env + credential check (no message sent) */
export async function checkTwilioStatus() {
  const idToken = await getAuthBearer();
  const res = await fetch('/api/twilio-status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return parseApiResponse(res, 'Twilio status check');
}

/** POST /api/provision-twilio-number — platform admin */
export async function provisionTwilioNumber({
  companyId,
  action = 'purchase',
  areaCode,
  phoneNumber,
  phoneSid,
} = {}) {
  const idToken = await getAuthBearer();
  const res = await fetch('/api/provision-twilio-number', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      companyId,
      action,
      areaCode,
      phoneNumber,
      phoneSid,
    }),
  });
  return parseApiResponse(res, 'Provision number');
}

/** POST /api/release-twilio-number — platform admin */
export async function releaseTwilioNumber({ companyId, force = false } = {}) {
  const idToken = await getAuthBearer();
  const res = await fetch('/api/release-twilio-number', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ companyId, force }),
  });
  return parseApiResponse(res, 'Release number');
}
