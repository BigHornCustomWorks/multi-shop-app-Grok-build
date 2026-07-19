import { getFirebase } from './firebase';

/**
 * Build a short status SMS (aim for 1 segment when possible).
 */
export function buildStatusSms({ shopName, vehicle, roNumber, status, shopPhone }) {
  const shop = (shopName || 'Your shop').trim().slice(0, 40);
  const veh = (vehicle || 'your vehicle').trim().slice(0, 40);
  const ro = (roNumber || '').trim();
  const st = (status || 'updated').trim().slice(0, 40);
  const phone = (shopPhone || '').trim();

  let msg = `${shop}: ${veh}`;
  if (ro) msg += ` (RO ${ro})`;
  msg += ` status: ${st}.`;
  if (phone) msg += ` Call ${phone}.`;
  msg += ' Reply STOP to opt out.';
  return msg;
}

/**
 * Call Vercel /api/send-sms (Twilio on the server).
 * Requires the user to be signed in (Firebase ID token).
 */
export async function sendStatusSms({ to, message }) {
  const { auth } = getFirebase();
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('You must be signed in to send a text.');
  }
  const idToken = await user.getIdToken();

  const res = await fetch('/api/send-sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ to, message }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parts = [data.error || `SMS failed (${res.status})`];
    if (data.hint) parts.push(data.hint);
    throw new Error(parts.join(' '));
  }
  return data;
}

/** Whether shop feature + job opt-in + phone + status list allow a text. */
export function shouldNotifyCustomerOnSms(job, company, newStatus) {
  if (!company?.features?.customerStatusSms) return false;
  if (!job?.allowSmsUpdates) return false;
  const phone = String(job.customerPhone || '').replace(/\D/g, '');
  if (phone.length < 10) return false;
  const list = company.settings?.notifyStatuses || [];
  if (!list.length) return false;
  return list.includes(newStatus);
}
