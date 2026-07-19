/**
 * Vercel serverless: send a status SMS via Twilio.
 * Secrets stay on the server — never put TWILIO_* in VITE_ client env.
 *
 * Required env (Vercel → Settings → Environment Variables):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN          (primary auth token)
 *   TWILIO_FROM_NUMBER         (E.164, e.g. +15551234567)
 * Optional (instead of auth token):
 *   TWILIO_API_KEY_SID
 *   TWILIO_API_KEY_SECRET
 * Auth:
 *   FIREBASE_WEB_API_KEY or VITE_FIREBASE_API_KEY  (to verify the caller’s Firebase ID token)
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
  // Vercel/UI paste sometimes includes surrounding quotes
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function twilioConfigStatus() {
  return {
    hasAccountSid: Boolean(env('TWILIO_ACCOUNT_SID')),
    hasAuthToken: Boolean(env('TWILIO_AUTH_TOKEN')),
    hasApiKeySid: Boolean(env('TWILIO_API_KEY_SID')),
    hasApiKeySecret: Boolean(env('TWILIO_API_KEY_SECRET')),
    hasFromNumber: Boolean(env('TWILIO_FROM_NUMBER')),
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

  // API Key auth (SID starts with SK…) still needs Account SID for the URL
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
    const message = String(body.message || body.body || '').trim();
    const from = toE164(env('TWILIO_FROM_NUMBER'));

    if (!to) {
      return json(res, 400, {
        error: 'Customer phone is missing or invalid. Use a full mobile number (e.g. 5551234567).',
      });
    }
    if (!message) {
      return json(res, 400, { error: 'Message text is empty.' });
    }
    if (message.length > 1600) {
      return json(res, 400, { error: 'Message is too long (max ~1600 characters).' });
    }
    if (!from) {
      return json(res, 500, {
        error: 'TWILIO_FROM_NUMBER is not set on the server (your Twilio trial number in E.164, e.g. +15551234567).',
      });
    }

    const { authorization, accountSid } = twilioAuthHeader();
    if (!accountSid) {
      return json(res, 500, { error: 'TWILIO_ACCOUNT_SID is not set on the server.' });
    }

    const params = new URLSearchParams();
    params.set('To', to);
    params.set('From', from);
    params.set('Body', message);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      accountSid
    )}/Messages.json`;

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const twilioData = await twilioRes.json().catch(() => ({}));

    if (!twilioRes.ok) {
      const twilioMsg =
        twilioData?.message ||
        twilioData?.error_message ||
        `Twilio error ${twilioRes.status}`;
      // Trial accounts often fail until the destination is verified
      return json(res, 502, {
        error: twilioMsg,
        code: twilioData?.code,
        moreInfo: twilioData?.more_info,
        hint:
          twilioData?.code === 21219 || /unverified|trial/i.test(String(twilioMsg))
            ? 'Twilio trial: verify this phone number in Twilio Console → Phone Numbers → Verified Caller IDs, then try again.'
            : undefined,
      });
    }

    return json(res, 200, {
      ok: true,
      sid: twilioData.sid,
      status: twilioData.status,
      to,
      from,
    });
  } catch (err) {
    console.error('send-sms', err);
    return json(res, 500, { error: err.message || 'Failed to send SMS' });
  }
}
