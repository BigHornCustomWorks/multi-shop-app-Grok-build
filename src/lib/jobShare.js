/**
 * Build a plain-text summary of a job for email / copy / share.
 */
export function buildJobSummary(job, companyName = '') {
  const lines = [];
  const shop = companyName ? `${companyName}` : 'Shop';

  lines.push(`${shop} — Job summary`);
  lines.push('='.repeat(40));
  lines.push(`Customer: ${job.customerName || '—'}`);
  if (job.customerEmail) lines.push(`Email:    ${job.customerEmail}`);
  if (job.customerPhone) lines.push(`Phone:    ${job.customerPhone}`);
  if (job.allowSmsUpdates) lines.push('Text updates: allowed');
  if (job.allowEmailUpdates) lines.push('Email updates: allowed');
  lines.push(`Vehicle:  ${job.vehicle || '—'}`);
  if (job.damageSummary) lines.push(`Damage:   ${job.damageSummary}`);
  if (job.arrivalDate) lines.push(`Arrived:  ${job.arrivalDate}`);
  lines.push(`RO:       ${job.roNumber || '—'}`);
  lines.push(`Status:   ${job.repairStatus || '—'}`);
  lines.push(`Location: ${job.vehicleLocation || '—'}`);
  lines.push(`Tech:     ${job.assignedTech || 'Unassigned'}`);
  if (job.isArchived) lines.push('Archived: yes');
  lines.push('');

  const parts = job.parts || [];
  if (parts.length) {
    lines.push(`Parts (${parts.length})`);
    lines.push('-'.repeat(40));
    parts.forEach((p, i) => {
      const ret = p.isReturning
        ? ` [NEEDS RETURN${p.returnReason ? `: ${p.returnReason}` : ''}]`
        : '';
      lines.push(
        `${i + 1}. ${p.description || 'Part'}${p.partNumber ? ` (#${p.partNumber})` : ''}  qty ${p.quantity || 1}`
      );
      lines.push(
        `   Status: ${p.status || '—'}  ·  Location: ${p.location || '—'}${ret}`
      );
    });
    lines.push('');
  } else {
    lines.push('Parts: none');
    lines.push('');
  }

  const notes = job.notes || [];
  if (notes.length) {
    lines.push(`Notes (${notes.length})`);
    lines.push('-'.repeat(40));
    notes.forEach((n) => {
      const when = n.createdAt ? new Date(n.createdAt).toLocaleString() : '';
      const who = n.createdByName || 'User';
      lines.push(`[${when}] ${who}`);
      lines.push(n.text || '');
      lines.push('');
    });
  } else {
    lines.push('Notes: none');
    lines.push('');
  }

  const photos = job.photos || [];
  if (photos.length) {
    lines.push(`Photos (${photos.length}) — open links to view`);
    lines.push('-'.repeat(40));
    photos.forEach((p, i) => {
      const when = p.createdAt ? new Date(p.createdAt).toLocaleString() : '';
      const cap = (p.caption || '').trim();
      lines.push(`${i + 1}. ${when || 'Photo'}${cap ? ` — ${cap}` : ''}`);
      if (p.url) lines.push(`   ${p.url}`);
    });
    lines.push('');
  }

  lines.push('—');
  lines.push('Sent from Custom Shop Management');
  return lines.join('\n');
}

export function jobEmailSubject(job, companyName = '') {
  const ro = job.roNumber ? `RO ${job.roNumber}` : 'Job';
  const who = job.customerName || 'Customer';
  const shop = companyName ? `${companyName}: ` : '';
  return `${shop}${ro} — ${who}`;
}

/** Open the device mail app with a prefilled message */
export function openMailto({ to, subject, body }) {
  const safeTo = String(to || '')
    .trim()
    .replace(/[^\w.@+-]/g, '');
  const parts = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  const href = `mailto:${safeTo}${parts.length ? `?${parts.join('&')}` : ''}`;
  window.location.href = href;
  return href;
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}
