/**
 * Vercel serverless: send a status SMS via Twilio.
 * Secrets stay on the server — never put TWILIO_* in VITE_ client env.
 *
 * Required env (Vercel → Settings → Environment Variables):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN          (primary auth token)
 *   TWILIO_FROM_NUMBER         (E.164, e.g. +15551234567)
 *
 * Trial accounts (Twilio 30-day trial):
 *   Custom message text is blocked. Body must be a predefined template id, e.g.:
 *   sms_delivery_updates, sms_account_alerts, sms_order_confirmation, …
 *   Set TWILIO_TRIAL_MODE=true  (recommended while on trial)
 *   Optional: TWILIO_TRIAL_TEMPLATE=sms_delivery_updates
 *
 * After you upgrade Twilio, set TWILIO_TRIAL_MODE=false (or remove it) for full
 * custom shop status text.
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
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

/** US-friendly → E.164. Leaves numbers that already start with + alone. */
function toE164(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return '';
}

async function verifyFirebaseIdToken(idToken) {
  const apiKey =
    process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  if (!apiKey) {
    throw new Error(
      'Server missing FIREBASE_WEB_API_KEY (or VITE_FIREBASE_API_KEY) to verify logins.'
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
    const msg = data?.error?.message || 'Invalid or expired login token';
    throw new Error(msg);
  }
  const user = data?.users?.[0];
  if (!user?.localId) throw new Error('Invalid login token');
  return { uid: user.localId, email: user.email || '' };
}

/** Read env and strip quotes/whitespace people often paste from consoles */
function env(name) {
  let v = process.env[name];
  if (v == null) return '';
  v = String(v).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function isTruthyEnv(name) {
  const v = env(name).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Allowed Body values while Twilio account is still on free trial */
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

function twilioConfigStatus() {
  return {
    hasAccountSid: Boolean(env('TWILIO_ACCOUNT_SID')),
    hasAuthToken: Boolean(env('TWILIO_AUTH_TOKEN')),
    hasApiKeySid: Boolean(env('TWILIO_API_KEY_SID')),
    hasApiKeySecret: Boolean(env('TWILIO_API_KEY_SECRET')),
    hasFromNumber: Boolean(env('TWILIO_FROM_NUMBER')),
    trialMode: isTruthyEnv('TWILIO_TRIAL_MODE'),
  };
}

function twilioAuthHeader() {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const apiKeySid = env('TWILIO_API_KEY_SID');
  const apiKeySecret = env('TWILIO_API_KEY_SECRET');
  const status = twilioConfigStatus();

  if (!accountSid) {
    throw new Error(
      'Twilio not configured on the server: missing TWILIO_ACCOUNT_SID. ' +
        'Add it in Vercel → Project → Settings → Environment Variables, then Redeploy. ' +
        `Seen: ${JSON.stringify(status)}`
    );
  }

  if (apiKeySid && apiKeySecret) {
    const token = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
    return { authorization: `Basic ${token}`, accountSid };
  }
  if (authToken) {
    const token = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    return { authorization: `Basic ${token}`, accountSid };
  }

  throw new Error(
    'Twilio not configured on the server: set TWILIO_AUTH_TOKEN (primary Auth Token) ' +
      'OR both TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET in Vercel env, then Redeploy. ' +
      `Seen: ${JSON.stringify(status)}`
  );
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
  // Prefer Messaging Service when set; else From number
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
    const fake = {
      ok: false,
      status: 0,
    };
    return {
      twilioRes: fake,
      twilioData: {
        message: `Could not reach Twilio (${err.message || 'network error'}). Check Vercel logs / internet path to api.twilio.com.`,
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
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const idToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!idToken) {
      return json(res, 401, { error: 'Sign in required (missing Authorization bearer token).' });
    }

    await verifyFirebaseIdToken(idToken);

    const body = await readBody(req);
    const to = toE164(body.to);
    const customMessage = String(body.message || body.body || '').trim();
    const from = toE164(env('TWILIO_FROM_NUMBER'));
    const messagingServiceSid = env('TWILIO_MESSAGING_SERVICE_SID');
    const forceTrial = isTruthyEnv('TWILIO_TRIAL_MODE');
    const template = trialTemplateId();

    if (!to) {
      return json(res, 400, {
        error: 'Customer phone is missing or invalid. Use a full mobile number (e.g. 5551234567).',
      });
    }
    if (!customMessage && !forceTrial) {
      return json(res, 400, { error: 'Message text is empty.' });
    }
    if (customMessage.length > 1600) {
      return json(res, 400, { error: 'Message is too long (max ~1600 characters).' });
    }
    if (!from && !messagingServiceSid) {
      return json(res, 500, {
        error:
          'TWILIO_FROM_NUMBER is not set on the server (E.164, e.g. +15551234567). Or set TWILIO_MESSAGING_SERVICE_SID.',
      });
    }

    const { authorization, accountSid } = twilioAuthHeader();

    // Paid accounts: custom body. Trial: template id only.
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

    // Auto-fallback if they forgot TWILIO_TRIAL_MODE but still on trial
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
      if (looksLikeUnverifiedError(twilioMsg, twilioData?.code)) {
        hint =
          'Destination not allowed. On trial: Verified Caller IDs. On paid: check Geographic permissions and A2P 10DLC registration.';
      } else if (looksLikeTrialTemplateError(twilioMsg, twilioData?.code)) {
        hint =
          'Trial template restriction. Set TWILIO_TRIAL_MODE=false after upgrading, Redeploy, and send again for custom status text.';
      } else if (/authenticate|20003|401/i.test(String(twilioMsg) + String(twilioData?.code))) {
        hint =
          'Auth failed. Re-copy TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN from Twilio → Account → API keys & tokens into Vercel (no quotes), Redeploy.';
      } else if (/from|21212|21606|phone number/i.test(String(twilioMsg))) {
        hint =
          'From number invalid or not SMS-capable. Set TWILIO_FROM_NUMBER to your Twilio number as +1… exactly as shown in Console.';
      }

      return json(res, 502, {
        error: twilioMsg,
        code: twilioData?.code,
        moreInfo: twilioData?.more_info,
        hint,
      });
    }

    return json(res, 200, {
      ok: true,
      sid: twilioData.sid,
      status: twilioData.status,
      to,
      from,
      trialTemplate: usedTrialTemplate,
      bodySent: usedTrialTemplate ? bodySent : undefined,
      note: usedTrialTemplate
        ? 'Twilio trial: sent a standard template (not your custom shop wording). Upgrade Twilio to send full status text with RO / vehicle / shop name.'
        : undefined,
    });
  } catch (err) {
    console.error('send-sms', err);
    return json(res, 500, { error: err.message || 'Failed to send SMS' });
  }
}
