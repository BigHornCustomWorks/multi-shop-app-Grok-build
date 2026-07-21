import { SCAN_MODES } from './invoicePrompt';

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses';

/**
 * Current vision-capable model (grok-2-vision-1212 was retired).
 * Override with VITE_XAI_VISION_MODEL if xAI renames again.
 */
function visionModel() {
  return (
    import.meta.env.VITE_XAI_VISION_MODEL ||
    import.meta.env.VITE_GROK_VISION_MODEL ||
    'grok-4.5'
  );
}

/**
 * Call xAI Grok vision and return parsed document JSON.
 * On Vercel, prefers /api/scan-document (server-side XAI_API_KEY — not baked into the phone app).
 * Local dev can still use a browser key via VITE_XAI_API_KEY if the API route is unavailable.
 *
 * @param {string} apiKey — optional client key (local only)
 * @param {File} file
 * @param {'parts_invoice'|'ccc_estimate'} mode
 */
export async function scanDocumentWithGrok(apiKey, file, mode = 'parts_invoice') {
  const { base64, mimeType } = await fileToBase64(file);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // 1) Server proxy — uses XAI_API_KEY / VITE_XAI_API_KEY from Vercel server env
  try {
    return await scanViaServer(dataUrl, mode);
  } catch (err) {
    const msg = String(err?.message || err || '');
    // If API missing (local vite without vercel dev), fall back to client key
    const canFallback =
      /api route not found|got html|failed to fetch|network/i.test(msg) && apiKey;
    if (!canFallback) throw err;
    console.warn('scan-document API unavailable, trying client key', msg);
  }

  // 2) Direct browser call (local .env only — not recommended for production)
  let key = String(apiKey || '').trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (!key) {
    throw new Error(
      'Scan API failed and no browser key is available. On Vercel set XAI_API_KEY (preferred) or VITE_XAI_API_KEY and Redeploy.'
    );
  }

  const scanMode = SCAN_MODES[mode] || SCAN_MODES.parts_invoice;
  const model = visionModel();

  let text;
  try {
    text = await tryResponsesApi(key, model, scanMode, dataUrl);
  } catch (err) {
    if (isAuthError(err)) throw formatAuthError(err);
    text = null;
  }
  if (!text) {
    try {
      text = await tryChatCompletionsApi(key, model, scanMode, dataUrl);
    } catch (err) {
      if (isAuthError(err)) throw formatAuthError(err);
      throw err;
    }
  }
  if (!text || typeof text !== 'string') {
    throw new Error('No text returned from Grok vision.');
  }

  return parseInvoiceJson(text);
}

async function scanViaServer(dataUrl, mode) {
  const { getFirebase } = await import('./firebase');
  const { auth } = getFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('You must be signed in to scan documents.');
  const idToken = await user.getIdToken();

  const res = await fetch('/api/scan-document', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ mode, imageDataUrl: dataUrl }),
  });

  const raw = await res.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    if (/^\s*</.test(raw) || res.status === 404) {
      throw new Error(
        'Scan API route not found (got HTML). Redeploy so /api/scan-document is live on Vercel.'
      );
    }
    throw new Error(`Scan API returned non-JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const parts = [body.error || `Scan failed (HTTP ${res.status})`];
    if (body.hint) parts.push(body.hint);
    if (body.keyLength != null) {
      parts.push(`(server key length ${body.keyLength}, prefix ${body.keyPrefix || '?'})`);
    }
    throw new Error(parts.join('\n'));
  }

  if (!body.data) throw new Error('Scan API returned no data.');
  return body.data;
}

function isAuthError(err) {
  const m = String(err?.message || err || '');
  return /incorrect api key|invalid api key|unauthorized|401|authentication/i.test(m);
}

function formatAuthError(err) {
  const m = String(err?.message || err || 'Incorrect API key');
  return new Error(
    `${m}\n\n` +
      'Fix checklist:\n' +
      '1) Prefer server key: Vercel env NAME = XAI_API_KEY (Value = xai-… only)\n' +
      '2) You can also set VITE_XAI_API_KEY — both work on the server now\n' +
      '3) No quotes/spaces; Production checked; Redeploy\n' +
      '4) Delete duplicate old keys in Vercel if you recreated them\n' +
      '5) Confirm key at https://console.x.ai has credits\n' +
      '6) Open https://YOUR-SITE/api/scan-document while signed out — should return JSON about key status (GET)'
  );
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
        {
          role: 'system',
          content: scanMode.system,
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: dataUrl,
              detail: 'high',
            },
            {
              type: 'input_text',
              text: scanMode.prompt,
            },
          ],
        },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      result?.error?.message ||
      result?.error ||
      `Document scan failed (${response.status})`;
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    // Fall through to chat API for model/route issues only
    if (
      response.status === 404 ||
      (/model|not found|not supported/i.test(str) && !/api key|unauthorized/i.test(str))
    ) {
      return null;
    }
    throw new Error(str);
  }

  return extractResponsesText(result);
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
        {
          role: 'system',
          content: scanMode.system,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: scanMode.prompt },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: 'high',
              },
            },
          ],
        },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg =
      result?.error?.message ||
      result?.error ||
      `Document scan failed (${response.status})`;
    const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
    if (/model not found|does not exist/i.test(str)) {
      throw new Error(
        `${str} — Update the app (uses grok-4.5 for vision) or set VITE_XAI_VISION_MODEL on Vercel to a current model from console.x.ai.`
      );
    }
    throw new Error(str);
  }

  return result.choices?.[0]?.message?.content || null;
}

function extractResponsesText(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text;
  }
  // output: [{ content: [{ type: 'output_text', text: '...' }] }]
  const out = result.output;
  if (Array.isArray(out)) {
    const chunks = [];
    for (const item of out) {
      const content = item?.content;
      if (typeof item?.text === 'string') chunks.push(item.text);
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string') chunks.push(c.text);
          if (typeof c?.output_text === 'string') chunks.push(c.output_text);
        }
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  // Rare: chat-shaped nested
  if (result.choices?.[0]?.message?.content) {
    return result.choices[0].message.content;
  }
  return null;
}

/** @deprecated use scanDocumentWithGrok */
export async function scanInvoiceWithGrok(apiKey, file) {
  return scanDocumentWithGrok(apiKey, file, 'parts_invoice');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      resolve({
        base64,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

/** Strip ```json fences if the model adds them, then JSON.parse */
export function parseInvoiceJson(raw) {
  let text = String(raw).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Could not parse scan result as JSON. Try a clearer photo (full page, good light, less blur).'
    );
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid scan JSON');
  }
  return data;
}

/**
 * Normalize scan payload to a common shape (supports new CCC schema + older line_items).
 */
export function normalizeScanPayload(data) {
  if (!data || typeof data !== 'object') return {};
  const warnings = Array.isArray(data.extraction_warnings)
    ? data.extraction_warnings.map(String)
    : [];

  // Name: prefer explicit last/first, then customer_name
  let last = data.last_name != null ? String(data.last_name).trim() : '';
  let first = data.first_name != null ? String(data.first_name).trim() : '';
  let customerName = data.customer_name != null ? String(data.customer_name).trim() : '';
  if (last && first) {
    customerName = `${last}, ${first}`;
  } else if (customerName) {
    customerName = formatCustomerNameLastFirst(customerName);
  }

  // Phone: Cell only from new schema; fall back to customer_phone
  const cell =
    (data.cell_phone != null && String(data.cell_phone).trim()) ||
    (data.customer_phone != null && String(data.customer_phone).trim()) ||
    '';

  const email =
    (data.email != null && String(data.email).trim()) ||
    (data.customer_email != null && String(data.customer_email).trim()) ||
    '';

  // Parts: new `parts` array preferred; else filter physical lines from line_items
  let parts = [];
  if (Array.isArray(data.parts) && data.parts.length) {
    parts = data.parts;
  } else if (Array.isArray(data.line_items)) {
    parts = data.line_items.filter((item) => {
      const pn = item?.part_number != null ? String(item.part_number).trim() : '';
      const type = String(item?.type || 'part').toLowerCase();
      if (!pn) return false;
      if (['labor', 'paint', 'sublet'].includes(type)) return false;
      return true;
    });
  }

  return {
    ...data,
    customer_name: customerName || null,
    last_name: last || null,
    first_name: first || null,
    cell_phone: cell || null,
    email: email || null,
    parts,
    extraction_warnings: warnings,
  };
}

/**
 * Map scan JSON → app parts[] entries (physical parts with part numbers only).
 */
export function invoiceJsonToParts(data, emptyPart, defaults = {}) {
  const norm = normalizeScanPayload(data);
  const items = Array.isArray(norm.parts) ? norm.parts : [];

  return items
    .map((item) => {
      const partNumber =
        item.part_number != null ? String(item.part_number).trim().toUpperCase() : '';
      if (!partNumber) return null;

      const section = item.section != null ? String(item.section).trim() : '';
      let description = String(item.description || '').trim() || 'Part';
      if (section) {
        description = `[${section}] ${description}`;
      }

      const qty = Number(item.quantity);
      return {
        ...emptyPart(defaults),
        description,
        partNumber,
        quantity: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
        unitPrice: numOrNull(item.unit_price ?? item.extended_price),
        totalPrice: numOrNull(item.total_price ?? item.extended_price),
        lineType: 'part',
        section: section || '',
      };
    })
    .filter(Boolean);
}

/**
 * Normalize customer name for body shops / CCC:
 * Prefer "Last, First" (how CCC prints insured names).
 */
export function formatCustomerNameLastFirst(raw) {
  if (raw == null) return '';
  let s = String(raw).trim().replace(/\s+/g, ' ');
  if (!s) return '';

  // Already Last, First
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',').map((p) => p.trim()).filter(Boolean);
    if (last && rest.length) return `${last}, ${rest.join(' ')}`;
    return s;
  }

  // "First Last" or "First Middle Last" → "Last, First Middle"
  const parts = s.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

/**
 * Fill job header fields from scan.
 * @param {object} data
 * @param {object} currentJob
 * @param {{ force?: boolean, mode?: string }} options
 *   force=true (CCC): overwrite empty-looking fields more aggressively
 */
export function invoiceJsonToJobPatches(data, currentJob = {}, options = {}) {
  const force = Boolean(
    options.force ||
      options.mode === 'ccc_estimate' ||
      options.mode === 'parts_invoice' ||
      data?.document_type === 'ccc_estimate' ||
      data?.document_type === 'ccc_parts_list'
  );
  const norm = normalizeScanPayload(data);
  const patches = {};

  const setIf = (key, value) => {
    if (value == null || value === '') return;
    const cur = currentJob[key];
    const empty =
      cur == null ||
      String(cur).trim() === '' ||
      (force && String(cur).trim().toLowerCase() === 'new repair');
    if (empty) patches[key] = value;
  };

  // Customer: Last, First
  let name = norm.customer_name || '';
  if (!name && norm.last_name) {
    name = norm.first_name
      ? `${norm.last_name}, ${norm.first_name}`
      : norm.last_name;
  }
  if (name) name = formatCustomerNameLastFirst(name);
  setIf('customerName', name);

  // Cell only (never Business/Evening substitutes — model instructed; we only map cell_phone)
  setIf('customerPhone', norm.cell_phone);

  setIf('customerEmail', norm.email);

  const damage =
    norm.damage_description != null ? String(norm.damage_description).trim() : '';
  setIf('damageSummary', damage);

  // RO Number only — never Workfile ID (model instructed)
  const ro = norm.ro_number != null ? String(norm.ro_number).trim() : '';
  setIf('roNumber', ro);

  // Prefer full CCC vehicle line verbatim
  const vehicleDesc =
    norm.vehicle_description != null ? String(norm.vehicle_description).trim() : '';
  if (vehicleDesc) {
    setIf('vehicle', vehicleDesc);
  } else {
    const v = norm.vehicle_info || {};
    const year = v.year != null && v.year !== '' ? String(v.year) : '';
    const make = v.make ? String(v.make).trim() : '';
    const model = v.model ? String(v.model).trim() : '';
    const vehicleStr = [year, make, model].filter(Boolean).join(' ').trim();
    setIf('vehicle', vehicleStr);
  }

  // Surface extraction warnings into a temp field callers may log
  if (norm.extraction_warnings?.length) {
    patches._scanWarnings = norm.extraction_warnings;
  }

  return patches;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
