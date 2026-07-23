import { getAuthBearer, parseApiResponse } from './twilioClient';
import { formatCustomerNameLastFirst } from './invoiceScan';

/**
 * Split customer name for greeting.
 * Supports "Last, First" (shop standard) and "First Last".
 */
export function splitCustomerName(fullName) {
  const s = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!s) return { firstName: '', lastName: '' };

  if (s.includes(',')) {
    const [last, ...rest] = s.split(',').map((p) => p.trim()).filter(Boolean);
    return {
      lastName: last || '',
      firstName: rest.join(' ') || '',
    };
  }

  const parts = s.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function buildStatusEmailVariables({
  customerName,
  vehicle,
  roNumber,
  status,
  shopName,
  shopPhone,
}) {
  const formatted = formatCustomerNameLastFirst(customerName) || customerName;
  const { firstName, lastName } = splitCustomerName(formatted);
  return {
    firstName: firstName || 'there',
    lastName: lastName || '',
    customerName: (formatted || '').trim() || 'Customer',
    vehicle: (vehicle || '').trim() || 'your vehicle',
    roNumber: (roNumber || '').trim() || '—',
    status: (status || '').trim() || 'updated',
    shopName: (shopName || 'Your shop').trim(),
    shopPhone: (shopPhone || '').trim(),
  };
}

/**
 * Status email for multi-shop.
 * From: platform verified sender (TWILIO_EMAIL_FROM) with display name = shop name
 * Reply-To: shop contact email so replies go to the shop (not the app)
 */
export function buildStatusEmailContent(vars) {
  const shop = vars.shopName || 'Your shop';
  const subject = `${shop}: Your vehicle status is now ${vars.status || '{{ status }}'}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.55; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p style="margin: 0 0 12px;">Hi {{ firstName | default: "there" }},</p>
  <p style="margin: 0 0 12px;">
    <strong>Great news</strong> — the status on your vehicle has been updated.
  </p>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;">Vehicle</p>
    <p style="margin: 0 0 12px; font-weight: 600;">{{ vehicle }}</p>
    ${
      vars.roNumber && vars.roNumber !== '—'
        ? `<p style="margin: 0 0 12px; font-size: 14px; color: #475569;">RO {{ roNumber }}</p>`
        : ''
    }
    <p style="margin: 0 0 4px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700;">New status</p>
    <p style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a;">{{ status }}</p>
  </div>
  <p style="margin: 0 0 12px;">
    For questions, call <strong>{{ shopName }}</strong>${
      vars.shopPhone
        ? ` at <a href="tel:${String(vars.shopPhone).replace(/[^\d+]/g, '')}" style="color: #2563eb; font-weight: 700;">{{ shopPhone }}</a>`
        : ''
    }.
  </p>
  <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
    You can reply to this email to reach {{ shopName }}${
      vars.shopPhone ? ', or call the number above' : ''
    }.
  </p>
  <p style="margin: 24px 0 0; font-size: 12px; color: #94a3b8;">— {{ shopName }}</p>
</body>
</html>`;

  const text = [
    `Hi {{ firstName | default: "there" }},`,
    ``,
    `Great news — the status on your vehicle has been updated.`,
    ``,
    `Vehicle: {{ vehicle }}`,
    vars.roNumber && vars.roNumber !== '—' ? `RO: {{ roNumber }}` : null,
    `New status: {{ status }}`,
    ``,
    vars.shopPhone
      ? `For questions, call {{ shopName }} at {{ shopPhone }}.`
      : `For questions, call {{ shopName }}.`,
    `You can reply to this email to reach the shop.`,
    ``,
    `— {{ shopName }}`,
  ]
    .filter((line) => line != null)
    .join('\n');

  return { subject, html, text };
}

export async function sendStatusEmail({
  to,
  variables,
  subject,
  html,
  text,
  replyTo,
  fromName,
}) {
  const idToken = await getAuthBearer();
  let res;
  try {
    res = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        to,
        variables,
        subject,
        html,
        text,
        replyTo,
        fromName,
      }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach Email API (${err.message || 'network'}). Use the live Vercel URL and check your connection.`
    );
  }
  return parseApiResponse(res, 'Email');
}
