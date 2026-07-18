import { SCAN_MODES } from './invoicePrompt';

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions';
/** Vision-capable Grok model for document images */
const XAI_VISION_MODEL = 'grok-2-vision-1212';

/**
 * Call xAI Grok vision and return parsed document JSON.
 * @param {string} apiKey
 * @param {File} file
 * @param {'parts_invoice'|'ccc_estimate'} mode
 */
export async function scanDocumentWithGrok(apiKey, file, mode = 'parts_invoice') {
  const scanMode = SCAN_MODES[mode] || SCAN_MODES.parts_invoice;
  const { base64, mimeType } = await fileToBase64(file);

  const response = await fetch(XAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: XAI_VISION_MODEL,
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
                url: `data:${mimeType};base64,${base64}`,
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
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  const text = result.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('No text returned from Grok vision.');
  }

  return parseInvoiceJson(text);
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
  const data = JSON.parse(text);
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
 * Fill job header fields from scan.
 * @param {object} data
 * @param {object} currentJob
 * @param {{ force?: boolean, mode?: string }} options
 *   force=true (CCC): overwrite empty-looking fields more aggressively
 */
export function invoiceJsonToJobPatches(data, currentJob = {}, options = {}) {
  const force = Boolean(options.force || options.mode === 'ccc_estimate');
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

  const name = data?.customer_name && String(data.customer_name).trim();
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
