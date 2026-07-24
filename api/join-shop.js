/**
 * POST /api/join-shop
 *
 * Trusted server join: links the signed-in user to a shop via invite code.
 * Writes users/{uid}.companyId + role=tech with Admin SDK (clients cannot set those fields).
 *
 * Body: { code, displayName? }
 * Requires: Authorization Bearer <Firebase ID token>
 * Server env: FIREBASE_SERVICE_ACCOUNT_JSON (+ API key for token verify)
 */

import {
  verifyFirebaseIdToken,
  getBearerToken,
  json,
  readBody,
} from './_lib/auth.js';
import { adminDb } from './_lib/firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return json(res, 204, {});
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const idToken = getBearerToken(req);
    if (!idToken) {
      return json(res, 401, { error: 'Sign in required.' });
    }

    const { uid, email } = await verifyFirebaseIdToken(idToken);
    const body = await readBody(req);
    const code = String(body.code || body.inviteCode || '')
      .trim()
      .toUpperCase();
    const displayName = String(body.displayName || '').trim();

    if (!code) {
      return json(res, 400, { error: 'Invite code is required.' });
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? userSnap.data() : {};

    if (existing.active === false) {
      return json(res, 403, { error: 'This account has been deactivated.' });
    }

    if (existing.role === 'platform_admin') {
      return json(res, 400, {
        error: 'Platform admin accounts do not join shops.',
      });
    }

    if (existing.companyId) {
      return json(res, 409, {
        error: 'You are already linked to a shop. Sign out or ask an admin to move you.',
        companyId: existing.companyId,
        code: 'ALREADY_JOINED',
      });
    }

    const invSnap = await db.collection('inviteCodes').doc(code).get();
    if (!invSnap.exists) {
      return json(res, 404, {
        error: 'No shop found with that code. Ask your admin for the invite code.',
        code: 'INVALID_CODE',
      });
    }

    const companyId = String(invSnap.data()?.companyId || '').trim();
    if (!companyId) {
      return json(res, 404, {
        error: 'Invite code is not linked to a shop. Ask the platform admin to re-index it.',
        code: 'INVALID_CODE',
      });
    }

    const companySnap = await db.collection('companies').doc(companyId).get();
    if (!companySnap.exists) {
      return json(res, 404, {
        error: 'Shop for that invite code no longer exists.',
        code: 'INVALID_CODE',
      });
    }

    const company = companySnap.data() || {};
    if (company.active === false) {
      return json(res, 403, {
        error: 'That shop is inactive. Contact the platform admin.',
        code: 'SHOP_INACTIVE',
      });
    }

    const now = Date.now();
    const patch = {
      companyId,
      role: 'tech',
      email: (email || existing.email || '').toLowerCase(),
      updatedAt: now,
      active: true,
    };
    if (displayName) {
      patch.displayName = displayName;
    } else if (!existing.displayName) {
      patch.displayName = '';
    }

    // Merge so we don't wipe jobFilter / createdAt
    await userRef.set(patch, { merge: true });

    return json(res, 200, {
      ok: true,
      companyId,
      companyName: company.name || '',
      role: 'tech',
      uid,
    });
  } catch (err) {
    console.error('join-shop', err);
    const msg = err.message || 'Failed to join shop';
    // Surface missing service account clearly
    if (/FIREBASE_SERVICE_ACCOUNT_JSON|service account/i.test(msg)) {
      return json(res, 500, {
        error: msg,
        hint: 'Platform owner: add Firebase service account JSON to Vercel as FIREBASE_SERVICE_ACCOUNT_JSON and Redeploy.',
      });
    }
    return json(res, 500, { error: msg });
  }
}
