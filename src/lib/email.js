import { getAuthBearer, parseApiResponse } from './twilioClient';

/** Split "First Last" for Twilio {{ firstName }} / {{ lastName }} variables */
export function splitCustomerName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
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
  const { firstName, lastName } = splitCustomerName(customerName);
  return {
    firstName: firstName || 'there',
    lastName: lastName || '',
    customerName: (customerName || '').trim() || 'Customer',
    vehicle: (vehicle || '').trim() || 'your vehicle',
    roNumber: (roNumber || '').trim() || '—',
    status: (status || '').trim() || 'updated',
    shopName: (shopName || 'Your shop').trim(),
    shopPhone: (shopPhone || '').trim(),
  };
}

/**
 * Personalized HTML/text using Twilio template variables
 * ({{ firstName }}, {{ status }}, etc.)
 */
export function buildStatusEmailContent(vars) {
  const shop = vars.shopName || 'Your shop';
  const subject = `${shop}: {{ vehicle }} status — {{ status }}`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5; color: #0f172a;">
  <p>Hi {{ firstName | default: "there" }},</p>
  <p>
    This is an update from <strong>{{ shopName }}</strong> about your vehicle
    <strong>{{ vehicle }}</strong>${vars.roNumber && vars.roNumber !== '—' ? ' (RO {{ roNumber }})' : ''}.
  </p>
  <p style="font-size: 1.05rem;">
    <strong>Current status:</strong> {{ status }}
  </p>
  ${
    vars.shopPhone
      ? `<p>Questions? Call us at <a href="tel:${vars.shopPhone}">{{ shopPhone }}</a>.</p>`
      : '<p>Questions? Reply to this email or call the shop.</p>'
  }
  <p style="color: #64748b; font-size: 0.85rem;">— {{ shopName }}</p>
</body>
</html>`;

  const text = [
    `Hi {{ firstName | default: "there" }},`,
    ``,
    `Update from {{ shopName }} about {{ vehicle }}${vars.roNumber && vars.roNumber !== '—' ? ' (RO {{ roNumber }})' : ''}.`,
    `Current status: {{ status }}`,
    vars.shopPhone ? `Questions? Call {{ shopPhone }}.` : `Questions? Reply to this email or call the shop.`,
    ``,
    `— {{ shopName }}`,
  ].join('\n');

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
