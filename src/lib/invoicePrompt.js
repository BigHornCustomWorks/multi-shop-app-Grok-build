/**
 * CCC ONE document extraction schema — Estimate + Parts List.
 * Aligned with shop workflow: RO, Last/First name, full vehicle line, Cell only, physical parts.
 */

export const CCC_JSON_SHAPE = `{
  "document_type": "ccc_estimate" | "ccc_parts_list" | "parts_invoice" | "other",
  "ro_number": "string or null",
  "customer_name": "string or null — ALWAYS \\"LAST, FIRST\\" as printed on CCC",
  "last_name": "string or null — split from customer_name on the comma",
  "first_name": "string or null — split from customer_name on the comma",
  "vehicle_description": "string or null — full bold vehicle line above VIN, verbatim",
  "vehicle_info": {
    "year": "number or null — only if clearly readable; optional",
    "make": "string or null",
    "model": "string or null",
    "vin": "string or null"
  },
  "cell_phone": "string or null — ONLY a phone labeled Cell under Owner (never Business/Evening)",
  "email": "string or null — only if an address with @ appears on the page",
  "damage_description": "short shop-floor damage summary or null (estimates only)",
  "estimate_number": "string or null",
  "invoice_number": "string or null",
  "parts": [
    {
      "section": "string or null — section header above this part (e.g. FRONT DOOR), not a part itself",
      "description": "string",
      "part_number": "string — required for inclusion",
      "quantity": "integer — default 1 if blank but part number present"
    }
  ],
  "extraction_warnings": ["string notes about illegible fields or name conflicts"]
}`;

const CCC_SHARED_RULES = `
FIELDS TO EXTRACT

1. ro_number
   - Label "RO Number:" appears directly under the title on either document type.
   - Not always present (some preliminary estimates have no RO Number, only a Workfile ID
     printed top-right — do NOT use Workfile ID as a substitute; leave ro_number null if
     "RO Number:" isn't printed).

2. customer_name / last_name / first_name
   - On the Estimate: "Customer: LAST, FIRST" near the top, and again as "Owner: LAST, FIRST"
     in the three-column block.
   - On the Parts List: "Customer: LAST, FIRST" or "Owner: LAST, FIRST" near the top.
   - Format is "LAST, FIRST" — set customer_name to that full string, and also split into
     last_name and first_name on the comma. Keep CCC order: Last, First (never First Last).
   - If both documents are supplied and the names differ, keep the Estimate's version and add
     a note to extraction_warnings.

3. vehicle_description
   - The bold line above "VIN:" on either document, e.g.
     "2019 TOYO Camry XLE Automatic 4D SED 4-2.5L Gasoline Port/Direct Injection"
   - Return the full line verbatim as vehicle_description. Do not invent a shorter paraphrase.
   - Optionally also fill vehicle_info year/make/model/vin when clearly labeled; never invent.

4. cell_phone
   - Found ONLY on the Estimate, under the "Owner:" column, as one or more phone lines each
     tagged with a label (Cell, Business, Evening, etc.).
   - Extract the number specifically labeled "Cell". If no line is labeled "Cell", return
     null — do not substitute a Business or Evening number.
   - The Parts List does not contain phone numbers; do not expect to find this field there.

5. email
   - Not present in standard CCC ONE Estimate or Parts List layouts observed so far. Look
     for any line containing "@" anywhere on the page (sometimes appended manually near the
     owner block) and capture it if found; otherwise return null. Do not guess or construct
     an email from the name.

6. parts (array)
   - Table columns: Line | Description | Part Number | Quantity | Extended Price (Parts List)
     or Line | Oper | Description | Part Number | Qty | ... (Estimate line items).
   - Section header rows (e.g. "WHEELS", "FRONT DOOR", "REAR BUMPER") occupy a Line number
     but have no description/part number/quantity of their own — do NOT extract these as
     parts. Use them only to tag the part rows that follow with a \`section\` value.
   - Only include rows that have an actual part_number. Skip labor-only rows (R&I, Rpr, O/H,
     "Add for Clear Coat", "Overlap", sublet/hazmat/cover-car line items) since those aren't
     physical parts.
   - For each qualifying row return: { "section": string|null, "description": string,
     "part_number": string, "quantity": integer }.
   - Quantity defaults to 1 if the column is blank but a part number is present.

GENERAL RULES
- Never invent a value — return null (or [] for parts) if a field isn't present on the page.
- Preserve exact capitalization/spacing of names, VINs, and part numbers as printed.
- If a required region is present but illegible, return null for that field and add a note
  to extraction_warnings describing which field.
- Output valid JSON only — no commentary, no markdown fences.
`;

/**
 * CCC ONE Preliminary Estimate / Estimate of Record.
 */
export const CCC_ESTIMATE_PROMPT = `You are a document-extraction engine for CCC ONE auto body PDFs.
This image is a CCC ONE "Estimate" (titled "Preliminary Estimate" or "Estimate of Record").

Extract ONLY the fields below and return a single JSON object — no commentary, no markdown fences.

Return JSON with this structure:
${CCC_JSON_SHAPE}

Set document_type to "ccc_estimate".

${CCC_SHARED_RULES}

Estimate-specific:
- Prefer header fields (RO, Customer, Owner/Cell, vehicle line) from the Estimate layout.
- For parts: extract equivalent line items that have a part_number (physical parts only).
- damage_description: short summary from loss / damage area when present (shop floor note).
`;

/**
 * CCC ONE Parts List for the same job.
 */
export const CCC_PARTS_LIST_PROMPT = `You are a document-extraction engine for CCC ONE auto body PDFs.
This image is a CCC ONE "Parts List" document (not a vendor packing slip).

Extract ONLY the fields below and return a single JSON object — no commentary, no markdown fences.

Return JSON with this structure:
${CCC_JSON_SHAPE}

Set document_type to "ccc_parts_list".

${CCC_SHARED_RULES}

Parts List-specific:
- Prioritize the Parts List table for the parts array (every row with a real part_number).
- Header: Customer/Owner LAST, FIRST; vehicle line above VIN; RO Number if printed.
- cell_phone is usually absent on Parts List — return null (do not invent).
- damage_description may be null on Parts List.
`;

/**
 * Vendor packing slip / non-CCC parts invoice (receiving).
 */
export const PARTS_INVOICE_PROMPT = `You are an expert auto body shop parts-invoice parser for vendor packing slips / supplier invoices (NOT CCC ONE Parts List).

Return ONLY a valid JSON object with this structure (no markdown fences):
${CCC_JSON_SHAPE}

Set document_type to "parts_invoice".

Rules:
- customer_name: if present, format as "LAST, FIRST".
- vehicle_description: full vehicle string if printed; else null.
- cell_phone: only if clearly a cell number; else null.
- email: only if @ present.
- parts: only physical part lines with a part_number. quantity default 1.
- section: use category headers when present.
- Never invent part numbers or quantities.
- Handle messy scans and dense tables; extract every clear part row.
`;

export const SCAN_MODES = {
  ccc_estimate: {
    id: 'ccc_estimate',
    label: 'CCC estimate',
    shortLabel: 'CCC estimate',
    hint: 'CCC ONE Preliminary / Estimate of Record — RO, Last First, vehicle line, Cell phone, part # lines.',
    prompt: CCC_ESTIMATE_PROMPT,
    system:
      'You are a CCC ONE estimate extraction engine. Respond with valid JSON only — no markdown fences, no commentary.',
  },
  parts_invoice: {
    id: 'parts_invoice',
    label: 'CCC / parts list',
    shortLabel: 'Parts list',
    hint: 'CCC ONE Parts List (or vendor packing slip) — physical parts with part numbers only.',
    prompt: CCC_PARTS_LIST_PROMPT,
    system:
      'You are a CCC ONE Parts List extraction engine. Respond with valid JSON only — no markdown fences, no commentary.',
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
