/**
 * POST /api/provision-twilio-number
 * Platform admin only.
 *
 * Body:
 *   companyId (required)
 *   action: "purchase" | "assign" | "migrate"  (default purchase)
 *   areaCode?: preferred area code for purchase
 *   phoneNumber?: for assign (E.164 or 10-digit)
 *   phoneSid?: optional SID when assigning an already-owned number
 *
 * On purchase failure: shop kept, twilioNumberStatus=failed, error stored.
 * Reverse index: smsNumbers/{e164_...} → companyId
 *
 * migrate: one-time link of env TWILIO_FROM_NUMBER to the shop (no purchase).
 */

import { env, toE164, e164ToIndexId, areaCodeFromPhone } from './_lib/env.js';
import {
  verifyFirebaseIdToken,
  getBearerToken,
  json,
  readBody,
} from './_lib/auth.js';
import {
  firestoreGet,
  firestorePatch,
  firestoreSet,
  firestoreDelete,
  assertPlatformAdmin,
} from './_lib/firestore.js';
import {
  searchLocalNumber,
  purchaseNumber,
  twilioFetch,
} from './_lib/twilio.js';

async function writeReverseIndex(idToken, phoneNumber, companyId, phoneSid) {
  const indexId = e164ToIndexId(phoneNumber);
  if (!indexId) return;
  await firestoreSet(
    `smsNumbers/${indexId}`,
    {
      companyId,
      phoneNumber: toE164(phoneNumber),
      phoneSid: phoneSid || '',
      updatedAt: Date.now(),
    },
    idToken
  );
}

async function clearOldIndex(idToken, oldNumber, companyId) {
  const indexId = e164ToIndexId(oldNumber);
  if (!indexId) return;
  try {
    const existing = await firestoreGet(`smsNumbers/${indexId}`, idToken);
    if (existing && existing.companyId === companyId) {
      await firestoreDelete(`smsNumbers/${indexId}`, idToken);
    }
  } catch (e) {
    console.warn('clearOldIndex', e.message);
  }
}

async function findIncomingSidByNumber(phoneNumber) {
  const e164 = toE164(phoneNumber);
  if (!e164) return '';
  const qs = new URLSearchParams({ PhoneNumber: e164, PageSize: '1' });
  const { res, data } = await twilioFetch(
    `/IncomingPhoneNumbers.json?${qs.toString()}`,
    { method: 'GET' }
  );
  if (!res.ok) return '';
  const list = data.incoming_phone_numbers || [];
  return list[0]?.sid || '';
}

async function markFailed(idToken, companyId, errorMsg) {
  await firestorePatch(
    `companies/${companyId}`,
    {
      twilioNumberStatus: 'failed',
      twilioNumberError: String(errorMsg || 'Provision failed').slice(0, 500),
      updatedAt: Date.now(),
    },
    idToken
  );
}

async function markActive(idToken, companyId, { phoneNumber, phoneSid, areaCode }) {
  const company = await firestoreGet(`companies/${companyId}`, idToken);
  if (company?.twilioSmsNumber && company.twilioSmsNumber !== phoneNumber) {
    await clearOldIndex(idToken, company.twilioSmsNumber, companyId);
  }
  await firestorePatch(
    `companies/${companyId}`,
    {
      twilioSmsNumber: phoneNumber,
      twilioPhoneSid: phoneSid || '',
      twilioNumberStatus: 'active',
      twilioNumberAreaCode: areaCode || areaCodeFromPhone(phoneNumber) || '',
      twilioNumberError: '',
      updatedAt: Date.now(),
    },
    idToken
  );
  await writeReverseIndex(idToken, phoneNumber, companyId, phoneSid);
}

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

    const action = String(body.action || 'purchase').toLowerCase();

    // ── migrate: one-time link env TWILIO_FROM_NUMBER ─────────────────────
    if (action === 'migrate') {
      const envFrom = toE164(env('TWILIO_FROM_NUMBER'));
      if (!envFrom) {
        return json(res, 400, {
          error:
            'TWILIO_FROM_NUMBER is not set on the server. Add it temporarily to migrate the live shop, then remove silent use of it from send path (already enforced).',
        });
      }
      let phoneSid = String(body.phoneSid || company.twilioPhoneSid || '').trim();
      if (!phoneSid) {
        try {
          phoneSid = await findIncomingSidByNumber(envFrom);
        } catch (e) {
          console.warn('SID lookup failed', e.message);
        }
      }
      await markActive(idToken, companyId, {
        phoneNumber: envFrom,
        phoneSid,
        areaCode: areaCodeFromPhone(envFrom),
      });
      // Default A2P to pending if never set so admin must explicitly mark registered
      if (!company.twilioA2pStatus || company.twilioA2pStatus === 'none') {
        await firestorePatch(
          `companies/${companyId}`,
          { twilioA2pStatus: 'pending', updatedAt: Date.now() },
          idToken
        );
      }
      return json(res, 200, {
        ok: true,
        action: 'migrate',
        companyId,
        phoneNumber: envFrom,
        phoneSid: phoneSid || null,
        note:
          'Linked env TWILIO_FROM_NUMBER to this shop. Set A2P to Registered when campaign is approved. Send no longer falls back to env.',
      });
    }

    // ── assign: manual number already in Twilio account ───────────────────
    if (action === 'assign') {
      const phoneNumber = toE164(body.phoneNumber);
      if (!phoneNumber) {
        return json(res, 400, {
          error: 'phoneNumber is required for assign (E.164 or 10-digit US).',
        });
      }
      let phoneSid = String(body.phoneSid || '').trim();
      if (!phoneSid) {
        try {
          phoneSid = await findIncomingSidByNumber(phoneNumber);
        } catch (e) {
          console.warn('SID lookup', e.message);
        }
      }
      await markActive(idToken, companyId, {
        phoneNumber,
        phoneSid,
        areaCode: areaCodeFromPhone(phoneNumber),
      });
      return json(res, 200, {
        ok: true,
        action: 'assign',
        companyId,
        phoneNumber,
        phoneSid: phoneSid || null,
      });
    }

    // ── purchase: search + buy local number ───────────────────────────────
    if (company.twilioNumberStatus === 'active' && company.twilioSmsNumber) {
      return json(res, 409, {
        error:
          'Shop already has an active Twilio number. Release it first before provisioning another.',
        phoneNumber: company.twilioSmsNumber,
      });
    }

    await firestorePatch(
      `companies/${companyId}`,
      {
        twilioNumberStatus: 'provisioning',
        twilioNumberError: '',
        updatedAt: Date.now(),
      },
      idToken
    );

    const preferredArea =
      String(body.areaCode || '').replace(/\D/g, '').slice(0, 3) ||
      areaCodeFromPhone(company.settings?.shopPhone || company.contactPhone || '') ||
      '';

    try {
      const found = await searchLocalNumber(preferredArea);
      if (!found) {
        const msg = preferredArea
          ? `No SMS-capable local numbers available for area code ${preferredArea} (or US fallback).`
          : 'No SMS-capable US local numbers available right now.';
        await markFailed(idToken, companyId, msg);
        return json(res, 502, { error: msg, companyId, status: 'failed' });
      }

      const purchased = await purchaseNumber(found.phoneNumber, {
        // Inbound webhook deferred (Phase D); fields/index ready now
      });

      await markActive(idToken, companyId, {
        phoneNumber: purchased.phoneNumber,
        phoneSid: purchased.sid,
        areaCode: preferredArea || areaCodeFromPhone(purchased.phoneNumber),
      });

      // New numbers start A2P as pending until you register & mark registered
      if (!company.twilioA2pStatus || company.twilioA2pStatus === 'none') {
        await firestorePatch(
          `companies/${companyId}`,
          { twilioA2pStatus: 'pending', updatedAt: Date.now() },
          idToken
        );
      }

      return json(res, 200, {
        ok: true,
        action: 'purchase',
        companyId,
        phoneNumber: purchased.phoneNumber,
        phoneSid: purchased.sid,
        preferredAreaCode: preferredArea || null,
        usedAreaCode: found.usedAreaCode,
        note: 'Set A2P status to Registered in Master Control after 10DLC campaign is approved.',
      });
    } catch (err) {
      console.error('provision purchase', err);
      await markFailed(idToken, companyId, err.message || 'Purchase failed');
      return json(res, 502, {
        error: err.message || 'Provision failed',
        companyId,
        status: 'failed',
        note: 'Shop kept. Retry provision or manually assign a number in Master Control.',
      });
    }
  } catch (err) {
    console.error('provision-twilio-number', err);
    const code = err.statusCode || 500;
    return json(res, code, { error: err.message || 'Provision failed' });
  }
}
