import { env } from './env.js';

export async function verifyFirebaseIdToken(idToken) {
  const apiKey = env('FIREBASE_WEB_API_KEY') || env('VITE_FIREBASE_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Server missing VITE_FIREBASE_API_KEY (or FIREBASE_WEB_API_KEY) to verify logins.'
    );
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Invalid or expired login token');
  }
  const user = data?.users?.[0];
  if (!user?.localId) throw new Error('Invalid login token');
  return { uid: user.localId, email: user.email || '' };
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return '';
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2e6) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}
