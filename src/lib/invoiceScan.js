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
 * @param {string} apiKey
 * @param {File} file
 * @param {'parts_invoice'|'ccc_estimate'} mode
 */
export async function scanDocumentWithGrok(apiKey, file, mode = 'parts_invoice') {
  const scanMode = SCAN_MODES[mode] || SCAN_MODES.parts_invoice;
  const { base64, mimeType } = await fileToBase64(file);
  const model = visionModel();
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Prefer Responses API (current docs for image understanding with grok-4.5)
  let text = await tryResponsesApi(apiKey, model, scanMode, dataUrl);
  if (!text) {
    text = await tryChatCompletionsApi(apiKey, model, scanMode, dataUrl);
  }
  if (!text || typeof text !== 'string') {
    throw new Error('No text returned from Grok vision.');
  }

  return parseInvoiceJson(text);
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
    // Fall through to chat API for older key/model combos
    if (response.status === 404 || /model|not found/i.test(String(result?.error?.message || ''))) {
      return null;
    }
    const msg =
      result?.error?.message ||
      result?.error ||
      `Document scan failed (${response.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
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
 * Map scan JSON → app parts[] entries.
 */
export function invoiceJsonToParts(data, emptyPart, defaults = {}) {
  const items = Array.isArray(data?.line_items) ? data.line_items : [];
  return items.map((item) => {
    const type = String(item.type || 'part').toLowerCase();
    let description = String(item.description || '').trim() || 'Line item';
    if (type && type !== 'part') {
      description = `[${type}] ${description}`;
    }
    const qty = Number(item.quantity);
    return {
      ...emptyPart(defaults),
      description,
      partNumber: item.part_number != null ? String(item.part_number).toUpperCase() : '',
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unitPrice: numOrNull(item.unit_price),
      totalPrice: numOrNull(item.total_price),
      lineType: type,
    };
  });
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
  const force = Boolean(options.force || options.mode === 'ccc_estimate');
  const mode = options.mode || data?.document_type || '';
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

  let name = data?.customer_name && String(data.customer_name).trim();
  // CCC and body-shop convention: Last, First
  if (name && (mode === 'ccc_estimate' || force || data?.document_type === 'ccc_estimate')) {
    name = formatCustomerNameLastFirst(name);
  } else if (name) {
    // Parts invoices: still prefer Last, First when name looks like "First Last"
    name = formatCustomerNameLastFirst(name);
  }
  setIf('customerName', name);

  const phone = data?.customer_phone && String(data.customer_phone).trim();
  setIf('customerPhone', phone);

  const email = data?.customer_email && String(data.customer_email).trim();
  setIf('customerEmail', email);

  const damage = data?.damage_description && String(data.damage_description).trim();
  setIf('damageSummary', damage);

  const ro =
    (data?.ro_number && String(data.ro_number).trim()) ||
    (data?.estimate_number && String(data.estimate_number).trim()) ||
    (data?.invoice_number && String(data.invoice_number).trim());
  setIf('roNumber', ro);

  const v = data?.vehicle_info || {};
  const year = v.year != null && v.year !== '' ? String(v.year) : '';
  const make = v.make ? String(v.make).trim() : '';
  const model = v.model ? String(v.model).trim() : '';
  const vehicleStr = [year, make, model].filter(Boolean).join(' ').trim();
  setIf('vehicle', vehicleStr);

  return patches;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
