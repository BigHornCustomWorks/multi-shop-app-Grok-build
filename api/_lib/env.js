export function env(name) {
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

export function isTruthyEnv(name) {
  const v = env(name).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** US-friendly → E.164 */
export function toE164(raw) {
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

/** Safe doc id for reverse index: +15551234567 → e164_15551234567 */
export function e164ToIndexId(e164) {
  const n = toE164(e164);
  if (!n) return '';
  return `e164_${n.replace(/\D/g, '')}`;
}

export function areaCodeFromPhone(raw) {
  const n = toE164(raw);
  const d = n.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) return d.slice(1, 4);
  if (d.length === 10) return d.slice(0, 3);
  return '';
}
