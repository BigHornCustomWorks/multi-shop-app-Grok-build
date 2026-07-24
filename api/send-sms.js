/**
 * Vercel serverless: send a status SMS via Twilio (per-shop From number).
 *
 * Multi-tenant rules:
 * - companyId is required
 * - Caller must belong to that company OR be platform_admin
 * - From number is ONLY company.twilioSmsNumber (no env TWILIO_FROM_NUMBER fallback)
 * - Outbound gated on twilioA2pStatus === 'registered'
 *
 * Platform env (Vercel):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN (or API key pair)
 *   FIREBASE_WEB_API_KEY / VITE_FIREBASE_API_KEY
 *   FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID
 * Optional: TWILIO_TRIAL_MODE, TWILIO_TRIAL_TEMPLATE
 */

import { env, isTruthyEnv, toE164 } from './_lib/env.js';
import {
  verifyFirebaseIdToken,
  getBearerToken,
  json,
  readBody,
} from './_lib/auth.js';
import {
  firestoreGet,
  assertCompanyAccess,
} from './_lib/firestore.js';
import { twilioAuthHeader } from './_lib/twilio.js';

const TRIAL_TEMPLATES = new Set([
  'sms_2fa',
  'sms_appointment_reminders',
  'sms_order_confirmation',
  'sms_delivery_updates',
  'sms_customer_support',
  'sms_marketing_promotions',
  'sms_event_notifications',
  'sms_account_alerts',
  'sms_feedback_surveys',
  'sms_internal_alerts',
]);

function trialTemplateId() {
  const t = env('TWILIO_TRIAL_TEMPLATE') || 'sms_delivery_updates';
  return TRIAL_TEMPLATES.has(t) ? t : 'sms_delivery_updates';
}

function looksLikeTrialTemplateError(msg, code) {
  const s = String(msg || '');
  return (
    /template/i.test(s) ||
    /predefined/i.test(s) ||
    /trial accounts can only/i.test(s) ||
    code === 21656 ||
    code === 21617
  );
}

function looksLikeUnverifiedError(msg, code) {
  const s = String(msg || '');
  return (
    code === 21219 ||
    code === 14111 ||
    /unverified/i.test(s) ||
    /not a verified/i.test(s) ||
    /verified caller/i.test(s)
  );
}

function companySendGate(company) {
  if (!company) {
    return { ok: false, status: 404, error: 'Shop not found.' };
  }
  const from = toE164(company.twilioSmsNumber);
  if (!from) {
    return {
      ok: false,
      status: 400,
      error:
        'This shop has no Twilio SMS number. Provision or assign one in Master Control. (No shared env From fallback.)',
    };
  }
  const numStatus = company.twilioNumberStatus || '';
  if (numStatus === 'released' || numStatus === 'failed' || numStatus === 'provisioning') {
    return {
      ok: false,
      status: 400,
      error: `Shop SMS number status is “${numStatus}”. Fix or re-provision in Master Control.`,
    };
  }
  if (company.twilioA2pStatus !== 'registered') {
    return {
      ok: false,
      status: 403,
      error:
        'A2P 10DLC is not marked registered for this shop. Complete registration in Twilio, then set A2P status to Registered in Master Control.',
    };
  }
  const messagingServiceSid = String(company.twilioMessagingServiceSid || '').trim();
  return { ok: true, from, messagingServiceSid };
}

async function createTwilioMessage({
  authorization,
  accountSid,
  to,
  from,
  messagingServiceSid,
  bodyText,
}) {
  const params = new URLSearchParams();
  params.set('To', to);
  if (messagingServiceSid) {
    params.set('MessagingServiceSid', messagingServiceSid);
  } else if (from) {
    params.set('From', from);
  }
  params.set('Body', bodyText);

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;

  let twilioRes;
  try {
    twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (err) {
    return {
      twilioRes: { ok: false, status: 0 },
      twilioData: {
        message: `Could not reach Twilio (${err.message || 'network error'}).`,
        code: 'NETWORK',
      },
    };
  }

  const raw = await twilioRes.text();
  let twilioData = {};
  try {
    twilioData = raw ? JSON.parse(raw) : {};
  } catch {
    twilioData = {
      message: `Twilio returned non-JSON (HTTP ${twilioRes.status}): ${raw.slice(0, 200)}`,
    };
  }
  return { twilioRes, twilioData };
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
      return json(res, 401, {
        error: 'Sign in required (missing Authorization bearer token).',
      });
    }

    const { uid } = await verifyFirebaseIdToken(idToken);
    const body = await readBody(req);

    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return json(res, 400, {
        error: 'companyId is required. SMS must send from the shop’s own Twilio number.',
      });
    }

    // MANDATORY: membership or platform admin — never send as another shop
    try {
      await assertCompanyAccess(idToken, uid, companyId);
    } catch (err) {
      const code = err.statusCode || 403;
      return json(res, code, { error: err.message || 'Forbidden' });
    }

    const company = await firestoreGet(`companies/${companyId}`, idToken);
    const gate = companySendGate(company);
    if (!gate.ok) {
      return json(res, gate.status, { error: gate.error });
    }

    const to = toE164(body.to);
    const customMessage = String(body.message || body.body || '').trim();
    const forceTrial = isTruthyEnv('TWILIO_TRIAL_MODE');
    const template = trialTemplateId();

    if (!to) {
      return json(res, 400, {
        error:
          'Customer phone is missing or invalid. Use a full mobile number (e.g. 5551234567).',
      });
    }
    if (!customMessage && !forceTrial) {
      return json(res, 400, { error: 'Message text is empty.' });
    }
    if (customMessage.length > 1600) {
      return json(res, 400, { error: 'Message is too long (max ~1600 characters).' });
    }

    const { authorization, accountSid } = twilioAuthHeader();
    const from = gate.from;
    const messagingServiceSid = gate.messagingServiceSid || '';

    const firstBody = forceTrial ? template : customMessage || template;

    let { twilioRes, twilioData } = await createTwilioMessage({
      authorization,
      accountSid,
      to,
      from,
      messagingServiceSid,
      bodyText: firstBody,
    });

    let usedTrialTemplate = forceTrial;
    let bodySent = firstBody;

    if (
      !twilioRes.ok &&
      !forceTrial &&
      looksLikeTrialTemplateError(twilioData?.message, twilioData?.code)
    ) {
      const retry = await createTwilioMessage({
        authorization,
        accountSid,
        to,
        from,
        messagingServiceSid,
        bodyText: template,
      });
      twilioRes = retry.twilioRes;
      twilioData = retry.twilioData;
      usedTrialTemplate = true;
      bodySent = template;
    }

    if (!twilioRes.ok) {
      const twilioMsg =
        twilioData?.message ||
        twilioData?.error_message ||
        `Twilio error ${twilioRes.status || ''}`.trim();

      let hint;
      if (
        /compliance profile|trust hub|kyc|not approved|customer profile/i.test(
          String(twilioMsg)
        )
      ) {
        hint =
          'Twilio Trust Hub / KYC is not approved yet. Complete Primary Customer Profile, then A2P 10DLC for this shop’s number.';
      } else if (looksLikeUnverifiedError(twilioMsg, twilioData?.code)) {
        hint =
          'Destination not allowed. On trial: Verified Caller IDs. On paid: check Geographic permissions and A2P 10DLC.';
      } else if (looksLikeTrialTemplateError(twilioMsg, twilioData?.code)) {
        hint =
          'Trial template restriction. Set TWILIO_TRIAL_MODE=false after upgrading, Redeploy.';
      } else if (
        twilioData?.code === 20003 ||
        /authenticate|401/i.test(String(twilioMsg) + String(twilioRes.status))
      ) {
        hint =
          'Auth failed. Re-copy TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN into Vercel and Redeploy.';
      } else if (/from|21212|21606|phone number/i.test(String(twilioMsg))) {
        hint =
          'Shop From number invalid or not SMS-capable. Re-provision or re-assign the number in Master Control.';
      }

      return json(res, 502, {
        error: twilioMsg,
        code: twilioData?.code,
        moreInfo: twilioData?.more_info,
        hint,
        companyId,
        from,
      });
    }

    return json(res, 200, {
      ok: true,
      sid: twilioData.sid,
      status: twilioData.status,
      to,
      from,
      companyId,
      trialTemplate: usedTrialTemplate,
      bodySent: usedTrialTemplate ? bodySent : undefined,
      note: usedTrialTemplate
        ? 'Twilio trial: sent a standard template (not your custom shop wording). Upgrade Twilio for full status text.'
        : undefined,
    });
  } catch (err) {
    console.error('send-sms', err);
    const code = err.statusCode || 500;
    return json(res, code, { error: err.message || 'Failed to send SMS' });
  }
}
