import { env, toE164 } from './env.js';

export function twilioAuthHeader() {
  const accountSid = env('TWILIO_ACCOUNT_SID');
  const authToken = env('TWILIO_AUTH_TOKEN');
  const apiKeySid = env('TWILIO_API_KEY_SID');
  const apiKeySecret = env('TWILIO_API_KEY_SECRET');

  if (!accountSid) {
    throw new Error('Missing TWILIO_ACCOUNT_SID on the server.');
  }
  if (apiKeySid && apiKeySecret) {
    const token = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
    return { authorization: `Basic ${token}`, accountSid };
  }
  if (authToken) {
    const token = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    return { authorization: `Basic ${token}`, accountSid };
  }
  throw new Error('Missing TWILIO_AUTH_TOKEN (or API key) on the server.');
}

export async function twilioFetch(path, { method = 'GET', body } = {}) {
  const { authorization, accountSid } = twilioAuthHeader();
  const url = path.startsWith('http')
    ? path
    : `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}${path}`;

  const headers = { Authorization: authorization };
  let payload = body;
  if (body && typeof body === 'object' && !(body instanceof URLSearchParams)) {
    payload = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v != null && v !== '') payload.set(k, String(v));
    }
  }
  if (payload) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: payload ? payload.toString() : undefined,
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw?.slice(0, 300) };
  }
  return { res, data, accountSid };
}

/** Search local numbers; prefer areaCode, then nearby, then any US local. */
export async function searchLocalNumber(areaCode) {
  const preferred = String(areaCode || '').replace(/\D/g, '').slice(0, 3);
  const attempts = [];
  if (preferred.length === 3) attempts.push({ AreaCode: preferred });
  // Nearby: try without area code (any US local) as fallback
  attempts.push({ SmsEnabled: true });

  for (const params of attempts) {
    const qs = new URLSearchParams({
      SmsEnabled: 'true',
      VoiceEnabled: 'true',
      PageSize: '5',
      ...params,
    });
    // When second attempt, only SmsEnabled
    if (!params.AreaCode) {
      qs.delete('AreaCode');
    }
    const { res, data, accountSid } = await twilioFetch(
      `/AvailablePhoneNumbers/US/Local.json?${qs.toString()}`,
      { method: 'GET' }
    );
    if (!res.ok) {
      throw new Error(data.message || data.error_message || `Twilio search failed (${res.status})`);
    }
    const list = data.available_phone_numbers || [];
    if (list.length) {
      return {
        phoneNumber: list[0].phone_number,
        friendlyName: list[0].friendly_name,
        lata: list[0].lata,
        accountSid,
        usedAreaCode: params.AreaCode || null,
      };
    }
  }
  return null;
}

export async function purchaseNumber(phoneNumber, { smsUrl, statusCallback } = {}) {
  const body = {
    PhoneNumber: phoneNumber,
  };
  if (smsUrl) body.SmsUrl = smsUrl;
  if (statusCallback) body.StatusCallback = statusCallback;

  const { res, data } = await twilioFetch('/IncomingPhoneNumbers.json', {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    throw new Error(data.message || data.error_message || `Twilio purchase failed (${res.status})`);
  }
  return {
    phoneNumber: data.phone_number,
    sid: data.sid,
    friendlyName: data.friendly_name,
  };
}

export async function releaseNumber(phoneSid) {
  if (!phoneSid) return { ok: true, skipped: true };
  const { res, data } = await twilioFetch(`/IncomingPhoneNumbers/${encodeURIComponent(phoneSid)}.json`, {
    method: 'DELETE',
  });
  // 404 = already gone
  if (res.ok || res.status === 204 || res.status === 404) {
    return { ok: true };
  }
  throw new Error(data.message || data.error_message || `Twilio release failed (${res.status})`);
}

export { toE164 };
