import { getAuthBearer, parseApiResponse } from './twilioClient';

/**
 * Status SMS — each shop sends from its own Twilio number (server-side From).
 * Message still identifies the shop so customers know who to call.
 *
 * Keep under ~160 chars when possible (1 SMS segment).
 */
export function buildStatusSms({ shopName, vehicle, roNumber, status, shopPhone }) {
  const shop = (shopName || 'your shop').trim();
  const veh = (vehicle || 'your vehicle').trim();
  const vehShort =
    veh.length > 48 ? veh.split(/\s+/).slice(0, 5).join(' ').slice(0, 48) : veh;
  const st = (status || 'updated').trim();
  const phone = (shopPhone || '').trim();
  const ro = (roNumber || '').trim();

  let msg = `Do not reply. Great news — your vehicle status is now: ${st}.`;
  if (ro) msg += ` (RO ${ro})`;
  msg += ` For questions, call ${shop}`;
  if (phone) msg += ` at ${phone}`;
  msg += '.';

  if (vehShort && msg.length < 120) {
    msg = `Do not reply. Great news — status for ${vehShort} is now: ${st}.`;
    if (ro) msg += ` (RO ${ro})`;
    msg += ` For questions, call ${shop}`;
    if (phone) msg += ` at ${phone}`;
    msg += '.';
  }

  if (!/STOP/i.test(msg)) {
    msg += ' Reply STOP to opt out.';
  }

  return msg;
}

/**
 * Call Vercel /api/send-sms (Twilio on the server).
 * companyId is required — membership verified server-side; From is the shop number.
 */
export async function sendStatusSms({ to, message, companyId }) {
  if (!companyId) {
    throw new Error(
      'companyId is required to send SMS (each shop uses its own Twilio number).'
    );
  }
  const idToken = await getAuthBearer();
  let res;
  try {
    res = await fetch('/api/send-sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ to, message, companyId }),
    });
  } catch (err) {
    throw new Error(
      `Could not reach SMS API (${err.message || 'network'}). Use the live Vercel URL and check your connection.`
    );
  }
  return parseApiResponse(res, 'SMS');
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
