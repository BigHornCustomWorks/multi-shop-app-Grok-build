/**
 * Shared JSON shape for all document scans (parts invoices + CCC estimates).
 * Keep one schema so mapping code stays simple.
 */
export const SCAN_JSON_SHAPE = `{
  "document_type": "parts_invoice" | "ccc_estimate" | "other",
  "invoice_number": "string or null",
  "estimate_number": "string or null",
  "ro_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "customer_name": "string or null — ALWAYS format as Last, First (e.g. Smith, John). Never First Last.",
  "customer_phone": "string or null",
  "customer_email": "string or null",
  "damage_description": "short summary of damage / loss for the tech list, or null",
  "vehicle_info": {
    "year": number or null,
    "make": "string or null",
    "model": "string or null",
    "vin": "string or null"
  },
  "line_items": [
    {
      "part_number": "string or null",
      "description": "full description string",
      "quantity": number,
      "unit_price": number or null,
      "total_price": number or null,
      "type": "part" | "labor" | "sublet" | "paint" | "other"
    }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "notes": "any additional relevant notes or null"
}`;

/**
 * Vendor / packing-slip style parts invoices (receiving).
 */
export const PARTS_INVOICE_PROMPT = `You are an expert auto body shop parts-invoice parser. Extract line items and header info from this PARTS INVOICE / packing slip image with high accuracy.

This is NOT a CCC ONE estimate — it is a vendor invoice for ordered parts.

Return ONLY a valid JSON object with this exact structure. Do not add any extra text, markdown, or code fences.

${SCAN_JSON_SHAPE}

Rules:
- Set document_type to "parts_invoice".
- customer_name: if a customer/insured name is present, use "Last, First" order (body-shop convention).
- Be extremely accurate with part numbers — alphanumeric (e.g. "12345-AB", "OEM-456").
- Combine multi-line descriptions into one clean description field.
- Prefer type "part" for physical parts; use labor/sublet/other only when clearly labeled.
- quantity must be a number (default 1 if missing).
- unit_price and total_price: numbers without currency symbols, or null.
- Extract EVERY clear part line — do not skip rows because the page is dense.
- Only extract real data — never invent part numbers or quantities.
- Handle messy scans, handwriting, and rotated text. If the page is blurry, still extract what is readable.
`;

/**
 * CCC ONE estimate layout (consistent shop estimate PDF / printout).
 * Tuned for auto-populating a repair job (customer, vehicle, damage, parts).
 */
export const CCC_ESTIMATE_PROMPT = `You are an expert CCC ONE collision estimate parser for auto body shops. Extract customer, vehicle, damage, and line items from this CCC ONE ESTIMATE image/PDF printout with high accuracy.

CCC ONE estimates usually have:
- Header with shop / estimate or claim / RO-style reference numbers
- Customer / insured name and often phone
- Vehicle year, make, model, VIN in a vehicle block
- Loss / damage / notes text describing what is damaged
- A line-item area with operations and parts (part numbers, descriptions, labor hours or qty, amounts)

Return ONLY a valid JSON object with this exact structure. Do not add any extra text, markdown, or code fences.

${SCAN_JSON_SHAPE}

Rules:
- Set document_type to "ccc_estimate".
- Map estimate/claim/workfile numbers into estimate_number and/or ro_number when present.
- customer_name = insured / customer / owner name on the estimate.
  CRITICAL: CCC prints names as LAST, FIRST — always return customer_name as "Last, First"
  (example: "Stussi, Clint" not "Clint Stussi"). If the page shows "Last, First" keep that order.
  If it only shows First Last, convert to Last, First.
- damage_description = short shop-floor summary (e.g. "LF fender, door, headlamp") from loss description and major ops — NOT a full essay.
- vehicle_info from the vehicle section; include VIN when visible.
- line_items: include PARTS and clear replace/R&I type ops as type "part"; labor/refinish as "labor" or "paint"; sublet as "sublet".
- Prefer part lines that have OEM part numbers; still include clear replace operations.
- Be extremely accurate with part numbers (OEM-style alphanumeric).
- Combine multi-line descriptions into one clean description.
- quantity: for parts use qty; for labor lines you may use hours as quantity when that is what the line shows (still a number).
- Only extract real printed data — never invent VINs, part numbers, or prices.
- If a field is not on the page, use null.
- Handle multi-column CCC layouts and dense tables.
- Read the FULL page; do not stop after the header — fill customer, vehicle, damage, AND line_items when present.
`;

export const SCAN_MODES = {
  parts_invoice: {
    id: 'parts_invoice',
    label: 'Parts invoice',
    shortLabel: 'Parts invoice',
    hint: 'Vendor packing slip / parts bill — adds line items to Parts.',
    prompt: PARTS_INVOICE_PROMPT,
    system:
      'You extract data from auto body parts invoices. Respond with valid JSON only — no markdown fences.',
  },
  ccc_estimate: {
    id: 'ccc_estimate',
    label: 'CCC estimate',
    shortLabel: 'CCC estimate',
    hint: 'CCC ONE estimate — fills customer, vehicle, damage, RO, and parts when possible.',
    prompt: CCC_ESTIMATE_PROMPT,
    system:
      'You extract data from CCC ONE collision estimates. Respond with valid JSON only — no markdown fences.',
  },
};

/** Prefer Grok/xAI; accept older env names for convenience */
export function getInvoiceApiKey() {
  return (
    import.meta.env.VITE_XAI_API_KEY ||
    import.meta.env.VITE_GROK_API_KEY ||
    import.meta.env.VITE_GEMINI_API_KEY ||
    ''
  );
}

export function invoiceApiKeyHint() {
  return 'Set VITE_XAI_API_KEY (or VITE_GROK_API_KEY) in a .env file and restart the dev server.';
}
