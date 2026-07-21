/**
 * Vercel serverless: CCC / parts document scan via xAI (Grok vision).
 *
 * Put the key on the SERVER (not only VITE_):
 *   XAI_API_KEY=xai-...          ← preferred (never shipped to the browser)
 *   or VITE_XAI_API_KEY=xai-...  ← also works on the server if you already set this
 *
 * After changing either, Redeploy. XAI_API_KEY does not need a client rebuild to "bake in"
 * the way VITE_ does for browser code — but serverless still reads env from the deployment.
 *
 * Optional: XAI_VISION_MODEL=grok-4.5
 */

import { SCAN_MODES } from '../src/lib/invoicePrompt.js';

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';

// Vercel default body limit ~4.5MB; allow larger for base64 images when possible
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
  maxDuration: 60,
};

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
      if (data.length > 12e6) {
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
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, '').trim();
  return v;
}

function getXaiKey() {
  return env('XAI_API_KEY') || env('VITE_XAI_API_KEY') || env('GROK_API_KEY') || '';
}

function visionModel() {
  return env('XAI_VISION_MODEL') || env('VITE_XAI_VISION_MODEL') || 'grok-4.5';
}

async function verifyFirebaseIdToken(idToken) {
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
  if (!data?.users?.[0]?.localId) throw new Error('Invalid login token');
  return true;
}

function extractResponsesText(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text;
  }
  const out = result.output;
  if (Array.isArray(out)) {
    const chunks = [];
    for (const item of out) {
      if (typeof item?.text === 'string') chunks.push(item.text);
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string') chunks.push(c.text);
          if (typeof c?.output_text === 'string') chunks.push(c.output_text);
        }
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  if (result.choices?.[0]?.message?.content) {
    return result.choices[0].message.content;
  }
  return null;
}

async function tryResponsesApi(apiKey, model, scanMode, dataUrl) {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: scanMode.system },
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: dataUrl, detail: 'high' },
            { type: 'input_text', text: scanMode.prompt },
          ],
        },
      ],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      result?.error?.message || result?.error || `xAI error ${response.status}`;
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (
      response.status === 404 ||
      (/model|not found|not supported/i.test(str) && !/api key|unauthorized/i.test(str))
    ) {
      return { text: null, error: null };
    }
    return { text: null, error: str, status: response.status };
  }
  return { text: extractResponsesText(result), error: null };
}

async function tryChatCompletionsApi(apiKey, model, scanMode, dataUrl) {
  const response = await fetch(XAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: scanMode.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: scanMode.prompt },
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' },
            },
          ],
        },
      ],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      result?.error?.message || result?.error || `xAI error ${response.status}`;
    return {
      text: null,
      error: typeof msg === 'string' ? msg : JSON.stringify(msg),
      status: response.status,
    };
  }
  return {
    text: result.choices?.[0]?.message?.content || null,
    error: null,
  };
}

function parseInvoiceJson(raw) {
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return json(res, 204, {});
  }

  if (req.method === 'GET') {
    // Safe diagnostics — never return the key
    const key = getXaiKey();
    return json(res, 200, {
      ok: Boolean(key),
      hasXaiApiKey: Boolean(env('XAI_API_KEY')),
      hasViteXaiApiKey: Boolean(env('VITE_XAI_API_KEY')),
      keyLength: key ? key.length : 0,
      keyPrefix: key ? key.slice(0, 4) : null,
      model: visionModel(),
      hint: key
        ? 'Server has an xAI key. If scan still fails, the key may be revoked or wrong team.'
        : 'Add XAI_API_KEY (preferred) or VITE_XAI_API_KEY on Vercel → Redeploy.',
    });
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
      return json(res, 401, { error: 'Sign in required.' });
    }
    await verifyFirebaseIdToken(idToken);

    const apiKey = getXaiKey();
    if (!apiKey) {
      return json(res, 500, {
        error:
          'No xAI key on the server. In Vercel → Environment Variables add XAI_API_KEY (or VITE_XAI_API_KEY) for Production, then Redeploy.',
        hasXaiApiKey: false,
        hasViteXaiApiKey: Boolean(env('VITE_XAI_API_KEY')),
      });
    }

    const body = await readBody(req);
    const mode = body.mode === 'ccc_estimate' ? 'ccc_estimate' : 'parts_invoice';
    const scanMode = SCAN_MODES[mode] || SCAN_MODES.parts_invoice;
    const model = visionModel();

    let dataUrl = String(body.imageDataUrl || '').trim();
    if (!dataUrl && body.base64) {
      const mime = body.mimeType || 'image/jpeg';
      dataUrl = `data:${mime};base64,${String(body.base64).replace(/\s/g, '')}`;
    }
    if (!dataUrl.startsWith('data:')) {
      return json(res, 400, { error: 'Missing image (imageDataUrl or base64).' });
    }

    let text = null;
    let lastError = null;

    const r1 = await tryResponsesApi(apiKey, model, scanMode, dataUrl);
    if (r1.text) text = r1.text;
    else if (r1.error) lastError = r1.error;

    if (!text) {
      const r2 = await tryChatCompletionsApi(apiKey, model, scanMode, dataUrl);
      if (r2.text) text = r2.text;
      else if (r2.error) lastError = r2.error;
    }

    if (!text) {
      const authFail = /incorrect api key|invalid api key|unauthorized|401/i.test(
        String(lastError || '')
      );
      return json(res, 502, {
        error: lastError || 'No text returned from Grok vision.',
        keyPrefix: apiKey.slice(0, 4),
        keyLength: apiKey.length,
        model,
        hint: authFail
          ? 'xAI rejected this key. Create a new key at console.x.ai, paste into Vercel as XAI_API_KEY (and/or VITE_XAI_API_KEY), no quotes, Production checked, Redeploy. Delete any old duplicate env vars with the same name.'
          : undefined,
      });
    }

    let data;
    try {
      data = parseInvoiceJson(text);
    } catch {
      return json(res, 502, {
        error:
          'Could not parse scan result as JSON. Try a clearer full-page photo (good light, less blur).',
      });
    }

    return json(res, 200, { ok: true, data, model });
  } catch (err) {
    console.error('scan-document', err);
    return json(res, 500, { error: err.message || 'Scan failed' });
  }
}
