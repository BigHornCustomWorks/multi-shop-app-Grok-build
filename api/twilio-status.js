/**
 * GET /api/twilio-status
 * Checks which Twilio env vars are present and whether Account SID + Auth Token
 * can authenticate against api.twilio.com (does not send SMS/email).
 *
 * Requires Firebase login (Bearer token).
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

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

async function verifyFirebaseIdToken(idToken) {
  const apiKey =
    process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
  if (!apiKey) {
    throw new Error('Missing FIREBASE_WEB_API_KEY / VITE_FIREBASE_API_KEY on server');
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
  if (!res.ok) throw new Error(data?.error?.message || 'Invalid login token');
  if (!data?.users?.[0]?.localId) throw new Error('Invalid login token');
  return true;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return json(res, 204, {});
  }

  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const idToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
    if (!idToken) {
      return json(res, 401, { error: 'Sign in required' });
    }
    await verifyFirebaseIdToken(idToken);

    const accountSid = env('TWILIO_ACCOUNT_SID');
    const authToken = env('TWILIO_AUTH_TOKEN');
    const apiKeySid = env('TWILIO_API_KEY_SID');
    const apiKeySecret = env('TWILIO_API_KEY_SECRET');
    const fromNumber = env('TWILIO_FROM_NUMBER');
    const emailFrom = env('TWILIO_EMAIL_FROM');
    const messagingServiceSid = env('TWILIO_MESSAGING_SERVICE_SID');

    const config = {
      hasAccountSid: Boolean(accountSid),
      accountSidPrefix: accountSid ? accountSid.slice(0, 4) + '…' : null,
      hasAuthToken: Boolean(authToken),
      hasApiKey: Boolean(apiKeySid && apiKeySecret),
      hasFromNumber: Boolean(fromNumber),
      fromNumberHint: fromNumber
        ? fromNumber.replace(/(\+\d{1,3})\d+(\d{4})/, '$1***$2')
        : null,
      hasMessagingService: Boolean(messagingServiceSid),
      hasEmailFrom: Boolean(emailFrom),
      emailFromHint: emailFrom || null,
      trialMode: isTruthyEnv('TWILIO_TRIAL_MODE'),
      hasFirebaseWebKey: Boolean(
        process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY
      ),
    };

    const checks = [];

    // Auth check against classic Twilio REST API
    if (accountSid && (authToken || (apiKeySid && apiKeySecret))) {
      const user = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
      const pass = apiKeySid && apiKeySecret ? apiKeySecret : authToken;
      const basic = Buffer.from(`${user}:${pass}`).toString('base64');
      try {
        const twilioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
          {
            method: 'GET',
            headers: { Authorization: `Basic ${basic}` },
          }
        );
        const data = await twilioRes.json().catch(() => ({}));
        if (twilioRes.ok) {
          checks.push({
            name: 'twilio_account_api',
            ok: true,
            status: data.status || 'active',
            friendlyName: data.friendly_name || null,
          });
        } else {
          checks.push({
            name: 'twilio_account_api',
            ok: false,
            httpStatus: twilioRes.status,
            error: data.message || data.error_message || `HTTP ${twilioRes.status}`,
            code: data.code,
            hint:
              twilioRes.status === 401
                ? 'Wrong Account SID or Auth Token on Vercel. Copy again from Twilio Console → Account → API keys & tokens, then Redeploy.'
                : undefined,
          });
        }
      } catch (err) {
        checks.push({
          name: 'twilio_account_api',
          ok: false,
          error: err.message || 'Network error reaching api.twilio.com',
          hint: 'Vercel could not reach Twilio. Retry; if it persists, check Twilio status.',
        });
      }
    } else {
      checks.push({
        name: 'twilio_account_api',
        ok: false,
        error: 'Missing TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN on Vercel',
        hint: 'Add both under Vercel → Settings → Environment Variables (Production + Preview), Redeploy.',
      });
    }

    // Lightweight ping of Email API (OPTIONS or empty will fail auth-wise — skip actual send)
    if (config.hasAccountSid && config.hasAuthToken && config.hasEmailFrom) {
      checks.push({
        name: 'email_config',
        ok: true,
        note: 'TWILIO_EMAIL_FROM is set. Sender must be verified in Twilio Email console or sends will fail.',
      });
    } else if (!config.hasEmailFrom) {
      checks.push({
        name: 'email_config',
        ok: false,
        error: 'TWILIO_EMAIL_FROM not set',
        hint: 'Required for status emails. Use an address/domain verified in Twilio Email.',
      });
    }

    if (!config.hasFromNumber && !config.hasMessagingService) {
      checks.push({
        name: 'sms_from',
        ok: false,
        error: 'No TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID',
        hint: 'Add your Twilio phone as +1… in TWILIO_FROM_NUMBER.',
      });
    } else {
      checks.push({ name: 'sms_from', ok: true });
    }

    if (config.trialMode) {
      checks.push({
        name: 'trial_mode',
        ok: false,
        error: 'TWILIO_TRIAL_MODE is still true',
        hint: 'You paid for Twilio — set TWILIO_TRIAL_MODE=false or delete it, then Redeploy, for real status text.',
      });
    }

    const allOk = checks.every((c) => c.ok);
    return json(res, 200, {
      ok: allOk,
      config,
      checks,
      nextSteps: allOk
        ? [
            'Credentials look good. If a status send still fails, open the job’s Recent texts/emails error line for Twilio’s message.',
            'Email: verify sender domain/address in Twilio Console → Email.',
            'US SMS volume: register A2P 10DLC if carriers start blocking.',
          ]
        : checks.filter((c) => !c.ok).map((c) => c.hint || c.error),
    });
  } catch (err) {
    console.error('twilio-status', err);
    return json(res, 500, { error: err.message || 'Status check failed' });
  }
}
