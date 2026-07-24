/**
 * POST /api/release-twilio-number
 * Platform admin only.
 *
 * Releases the shop’s Twilio number via API, clears company fields,
 * sets twilioNumberStatus = 'released', removes reverse index.
 *
 * Body: { companyId }
 * Optional: { force: true } — clear Firestore even if Twilio release fails
 */

import { toE164, e164ToIndexId } from './_lib/env.js';
import {
  verifyFirebaseIdToken,
  getBearerToken,
  json,
  readBody,
} from './_lib/auth.js';
import {
  firestoreGet,
  firestorePatch,
  firestoreDelete,
  assertPlatformAdmin,
} from './_lib/firestore.js';
import { releaseNumber } from './_lib/twilio.js';

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

    const { uid } = await verifyFirebaseIdToken(idToken);
    await assertPlatformAdmin(idToken, uid);

    const body = await readBody(req);
    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return json(res, 400, { error: 'companyId is required' });
    }

    const company = await firestoreGet(`companies/${companyId}`, idToken);
    if (!company) {
      return json(res, 404, { error: 'Shop not found' });
    }

    const phoneSid = String(company.twilioPhoneSid || '').trim();
    const phoneNumber = toE164(company.twilioSmsNumber || '');
    const force = Boolean(body.force);

    if (!phoneSid && !phoneNumber) {
      // Already clean
      await firestorePatch(
        `companies/${companyId}`,
        {
          twilioSmsNumber: '',
          twilioPhoneSid: '',
          twilioNumberStatus: 'released',
          twilioNumberError: '',
          updatedAt: Date.now(),
        },
        idToken
      );
      return json(res, 200, {
        ok: true,
        skipped: true,
        companyId,
        note: 'No number on this shop.',
      });
    }

    let twilioReleased = false;
    let twilioError = null;
    try {
      if (phoneSid) {
        await releaseNumber(phoneSid);
        twilioReleased = true;
      } else {
        // No SID — cannot release via API; clear local state only if force
        twilioError =
          'No twilioPhoneSid on shop; cannot call Twilio release. Use force:true to clear local fields only, or assign SID first.';
        if (!force) {
          return json(res, 400, {
            error: twilioError,
            companyId,
            phoneNumber: phoneNumber || null,
          });
        }
      }
    } catch (err) {
      twilioError = err.message || 'Twilio release failed';
      if (!force) {
        return json(res, 502, {
          error: twilioError,
          companyId,
          phoneNumber: phoneNumber || null,
          phoneSid: phoneSid || null,
          hint: 'Fix Twilio access or retry with force:true to clear app fields only (number may still bill in Twilio).',
        });
      }
    }

    if (phoneNumber) {
      const indexId = e164ToIndexId(phoneNumber);
      if (indexId) {
        try {
          const idx = await firestoreGet(`smsNumbers/${indexId}`, idToken);
          if (!idx || idx.companyId === companyId) {
            await firestoreDelete(`smsNumbers/${indexId}`, idToken);
          }
        } catch (e) {
          console.warn('index delete', e.message);
        }
      }
    }

    await firestorePatch(
      `companies/${companyId}`,
      {
        twilioSmsNumber: '',
        twilioPhoneSid: '',
        twilioNumberStatus: 'released',
        twilioNumberAreaCode: '',
        twilioNumberError: twilioError || '',
        updatedAt: Date.now(),
      },
      idToken
    );

    return json(res, 200, {
      ok: true,
      companyId,
      releasedNumber: phoneNumber || null,
      releasedSid: phoneSid || null,
      twilioReleased,
      twilioError,
    });
  } catch (err) {
    console.error('release-twilio-number', err);
    const code = err.statusCode || 500;
    return json(res, code, { error: err.message || 'Release failed' });
  }
}
