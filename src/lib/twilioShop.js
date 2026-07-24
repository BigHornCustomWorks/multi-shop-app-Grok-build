/**
 * Company-level Twilio SMS fields (multi-tenant).
 * shopPhone in settings remains the "call us" business line in message body.
 */

export const TWILIO_NUMBER_STATUSES = [
  'none',
  'provisioning',
  'active',
  'failed',
  'released',
];

export const TWILIO_A2P_STATUSES = ['none', 'pending', 'registered', 'failed'];

export function emptyTwilioShopFields() {
  return {
    twilioSmsNumber: '',
    twilioPhoneSid: '',
    twilioNumberStatus: 'none',
    twilioNumberAreaCode: '',
    twilioNumberError: '',
    twilioA2pStatus: 'none',
    twilioMessagingServiceSid: '',
  };
}

export function companyCanSendSms(company) {
  if (!company) return { ok: false, reason: 'Shop not found' };
  const num = String(company.twilioSmsNumber || '').trim();
  if (!num) {
    return {
      ok: false,
      reason:
        'This shop has no Twilio SMS number. Provision or assign one in Master Control.',
    };
  }
  if (company.twilioNumberStatus === 'released' || company.twilioNumberStatus === 'failed') {
    return {
      ok: false,
      reason: `Shop SMS number status is “${company.twilioNumberStatus}”. Fix in Master Control.`,
    };
  }
  if (company.twilioA2pStatus !== 'registered') {
    return {
      ok: false,
      reason:
        'A2P 10DLC not marked registered for this shop. Complete registration in Twilio, then set A2P status to Registered in Master Control.',
    };
  }
  return { ok: true, from: num };
}

export function e164ToIndexId(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (!digits) return '';
  return `e164_${digits}`;
}
