/**
 * Vercel serverless: send a status email via Twilio Emails API
 * POST https://comms.twilio.com/v1/Emails
 *
 * Env (Vercel — never VITE_*):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_EMAIL_FROM          verified sender address (required)
 *   TWILIO_EMAIL_FROM_NAME     e.g. "Custom Shop Management" (optional)
 *
 * Optional reply-to is passed per request (shop contact email).
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
    throw new Error(data?.error?.message || 'Invalid or expired login token');
  }
  const user = data?.users?.[0];
  if (!user?.localId) throw new Error('Invalid login token');
  return { uid: user.localId, email: user.email || '' };
}

function twilioBasicAuth() {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const apiKeySid = env('TWILIO_API_KEY_SID');
  const apiKeySecret = env('TWILIO_API_KEY_SECRET');

  if (!accountSid) {
    throw new Error(
      'Missing TWILIO_ACCOUNT_SID on the server. Add it in Vercel env and Redeploy.'
    );
  }
  if (apiKeySid && apiKeySecret) {
    return Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
  }
  if (authToken) {
    return Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  }
  throw new Error(
    'Missing TWILIO_AUTH_TOKEN (or API key SID/secret) on the server. Add in Vercel and Redeploy.'
  );
}

function isEmail(s) {
  const e = String(s || '').trim();
  return e.includes('@') && e.includes('.') && e.length > 5;
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
    const to = String(body.to || '').trim().toLowerCase();
    const variables =
      body.variables && typeof body.variables === 'object' ? body.variables : {};
    const subject =
      String(body.subject || '').trim() ||
      'Hello {{ firstName | default: "there" }} — vehicle update';
    const html =
      String(body.html || '').trim() ||
      '<p>Hey {{ firstName | default: "there" }}, your vehicle status has been updated.</p>';
    const text =
      String(body.text || '').trim() ||
      'Hey {{ firstName | default: "there" }}, your vehicle status has been updated.';

    const fromAddress = env('TWILIO_EMAIL_FROM');
    // Display name = shop name so inbox shows "Big Horn Body Shop" not the app
    const fromName =
      String(body.fromName || '').trim() ||
      String(variables.shopName || '').trim() ||
      env('TWILIO_EMAIL_FROM_NAME') ||
      'Shop updates';
    const replyTo = String(body.replyTo || '').trim();

    if (!isEmail(to)) {
      return json(res, 400, { error: 'Customer email is missing or invalid.' });
    }
    if (!isEmail(fromAddress)) {
      return json(res, 500, {
        error:
          'TWILIO_EMAIL_FROM is not set (or invalid) on the server. Use a sender address verified in Twilio Email (e.g. updates@bhcustomworks.com), then Redeploy.',
      });
    }

    const payload = {
      from: {
        address: fromAddress,
        name: fromName,
      },
      to: [
        {
          address: to,
          variables: {
            firstName: String(variables.firstName || ''),
            lastName: String(variables.lastName || ''),
            customerName: String(variables.customerName || ''),
            vehicle: String(variables.vehicle || ''),
            roNumber: String(variables.roNumber || ''),
            status: String(variables.status || ''),
            shopName: String(variables.shopName || fromName || ''),
            shopPhone: String(variables.shopPhone || ''),
          },
        },
      ],
      content: {
        subject,
        html,
        text,
      },
    };

    /**
     * Reply-To = shop contact email so customer replies go to the shop,
     * not the platform noreply address. True "from shop@their-domain.com"
     * needs each shop's domain verified in Twilio (not practical multi-tenant);
     * From display name + Reply-To is the standard approach.
     */
    if (isEmail(replyTo)) {
      payload.reply_to = { address: replyTo, name: fromName };
      payload.replyTo = { address: replyTo, name: fromName };
    }

    const authorization = twilioBasicAuth();
    let twilioRes;
    try {
      twilioRes = await fetch('https://comms.twilio.com/v1/Emails', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return json(res, 502, {
        error: `Could not reach Twilio Email API (${err.message || 'network error'})`,
        hint: 'Network path from Vercel to comms.twilio.com failed. Retry; confirm Email is enabled on your Twilio account.',
      });
    }

    const raw = await twilioRes.text();
    let twilioData = {};
    try {
      twilioData = raw ? JSON.parse(raw) : {};
    } catch {
      twilioData = { message: raw?.slice(0, 300) || `HTTP ${twilioRes.status}` };
    }

    if (!twilioRes.ok) {
      const msg =
        twilioData?.message ||
        twilioData?.error_message ||
        twilioData?.error ||
        (Array.isArray(twilioData?.errors) && twilioData.errors[0]?.message) ||
        (typeof twilioData === 'string' ? twilioData : null) ||
        `Twilio Email error ${twilioRes.status}`;
      const msgStr = String(msg);
      let hint;
      if (/sender|from|verif|domain|not allowed|identity/i.test(msgStr)) {
        hint =
          'Verify TWILIO_EMAIL_FROM in Twilio Console → Email (domain or single sender). Example values in Twilio samples are placeholders, not real addresses.';
      } else if (/authenticate|401|unauthorized|20003/i.test(msgStr + twilioRes.status)) {
        hint =
          'Auth failed for Email API. Confirm TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN on Vercel match the account where Email is enabled, then Redeploy.';
      } else if (twilioRes.status === 404 || /not found|not enabled/i.test(msgStr)) {
        hint =
          'Twilio Email may not be fully set up on this account. Finish Email onboarding in the Twilio Console, then retry.';
      }
      return json(res, 502, {
        error: msgStr,
        details: twilioData,
        httpStatus: twilioRes.status,
        hint,
      });
    }

    return json(res, 200, {
      ok: true,
      id: twilioData.id || twilioData.sid || null,
      to,
      from: fromAddress,
    });
  } catch (err) {
    console.error('send-email', err);
    return json(res, 500, { error: err.message || 'Failed to send email' });
  }
}
