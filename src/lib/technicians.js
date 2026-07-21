import { ROLES } from './constants';
import { isUserAccountActive } from './api';

/**
 * Display name for a team member (job assignment / filter lists).
 */
export function teamMemberDisplayName(user) {
  if (!user) return '';
  const name = String(user.displayName || '').trim();
  if (name) return name;
  const email = String(user.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return '';
}

/**
 * Active team members with Tech role (set by Owner in Settings).
 */
export function techNamesFromTeam(users = []) {
  const names = [];
  const seen = new Set();
  for (const u of users) {
    if (!u || u.role !== ROLES.TECH) continue;
    if (!isUserAccountActive(u)) continue;
    const label = teamMemberDisplayName(u);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }
  return names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Manual extras from shop settings (people not on the app).
 */
export function extraTechNames(settingsTechnicians = []) {
  return (Array.isArray(settingsTechnicians) ? settingsTechnicians : [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
}

/**
 * Full list for job “Assigned tech” + dashboard filter:
 * team Techs first (by default), then any manual extras not already covered.
 */
export function mergeTechnicianOptions(users = [], settingsTechnicians = []) {
  const fromTeam = techNamesFromTeam(users);
  const teamKeys = new Set(fromTeam.map((n) => n.toLowerCase()));
  const extras = [];
  for (const n of extraTechNames(settingsTechnicians)) {
    if (teamKeys.has(n.toLowerCase())) continue;
    extras.push(n);
    teamKeys.add(n.toLowerCase());
  }
  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return [...fromTeam, ...extras];
}
