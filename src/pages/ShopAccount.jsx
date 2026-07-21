import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  LogOut,
  Moon,
  Sun,
  Users,
  Copy,
  Check,
  UserCog,
  Mail,
  MessageSquarePlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { APP_NAME, PLATFORM_ADMIN_EMAIL } from '../config';
import {
  DEFAULT_BRANDING,
  ROLES,
  countActiveSeats,
  roleLabel,
  OWNER_ASSIGNABLE_ROLES,
} from '../lib/constants';
import {
  listCompanyUsers,
  setUserActive,
  removeUserFromCompany,
  setUserRole,
  isUserAccountActive,
  updateCompany,
} from '../lib/api';
import EditableList from '../components/EditableList';

/**
 * Shop-side account: appearance, and (for Owners) staff invite / roles / remove.
 */
export default function ShopAccount({ onBack }) {
  const { user, profile, company, logout, isShopAdmin, canManageTeam } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const seatLimit = company?.seatLimit ?? 5;

  const [users, setUsers] = useState([]);
  const [userBusyId, setUserBusyId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [staffMsg, setStaffMsg] = useState('');
  const [technicians, setTechnicians] = useState(company?.settings?.technicians || []);
  const [techBusy, setTechBusy] = useState(false);

  const reloadUsers = () => {
    if (!company?.id) return;
    listCompanyUsers(company.id).then(setUsers).catch(console.error);
  };

  useEffect(() => {
    if (canManageTeam && company?.id) reloadUsers();
  }, [canManageTeam, company?.id]);

  const activeSeats = countActiveSeats(users);
  const overSeats = canManageTeam && activeSeats > Number(seatLimit || 0);

  useEffect(() => {
    setTechnicians(company?.settings?.technicians || []);
  }, [company?.id, company?.settings?.technicians]);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(company?.inviteCode || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const saveTechNames = async (list) => {
    setTechnicians(list);
    if (!company?.id) return;
    setTechBusy(true);
    try {
      await updateCompany(company.id, {
        settings: {
          ...(company.settings || {}),
          technicians: list,
        },
      });
      setStaffMsg('Technician list saved.');
      setTimeout(() => setStaffMsg(''), 2500);
    } catch (err) {
      setStaffMsg(err.message || 'Could not save tech names');
    } finally {
      setTechBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-frame app-frame--wide flex flex-col">
      <header className="app-header sticky top-0 z-30">
        <div className="app-page-pad py-3 lg:py-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="font-bold lg:text-lg">
          {canManageTeam ? 'Account & team' : 'Account & appearance'}
        </div>
        </div>
      </header>

      <div className="app-page-pad py-4 space-y-4 pb-10 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
        <div className="app-card p-5 flex items-center gap-4">
          {company?.branding?.logoUrl ? (
            <img
              src={company.branding.logoUrl}
              alt=""
              className="h-14 w-14 rounded-2xl object-cover border border-slate-200 dark:border-slate-600"
            />
          ) : (
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-md"
              style={{ backgroundColor: primary }}
            >
              {(company?.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-lg truncate">{company?.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              {APP_NAME}
              {canManageTeam ? ' · Owner' : ''}
            </div>
          </div>
        </div>

        {/* Owner: invite + staff roles */}
        {canManageTeam && (
          <>
            {overSeats && (
              <div className="app-card p-4 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 text-xs leading-relaxed lg:col-span-2">
                <b>Seat notice:</b> {activeSeats} active users (plan soft limit {seatLimit}). You can
                still add people; the platform may bill for overage later. Deactivate staff who left
                to free seats.
              </div>
            )}
            <div className="app-card p-5 space-y-3">
              <div className="section-title">
                <UserCog size={14} /> Invite employees
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                New staff open the app, <b>Sign Up</b> with their email, then enter this invite code.
                They join as <b>Tech</b> — you can change their role below (Tech or Parts manager).
                Only the platform admin can assign another Owner.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono font-black tracking-widest text-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-center">
                  {company?.inviteCode || '—'}
                </code>
                <button
                  type="button"
                  onClick={copyInvite}
                  className="p-3 rounded-xl text-white shadow-md"
                  style={{ backgroundColor: primary }}
                  title="Copy invite code"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="app-card p-5">
              <h3 className="section-title mb-2">
                <Users size={14} /> Team ({users.length})
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                Set role, deactivate (blocks login), or remove from this shop. You cannot change
                other Owners — contact platform support for that.
              </p>
              {staffMsg && (
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                  {staffMsg}
                </p>
              )}
              {users.length === 0 ? (
                <p className="text-sm text-slate-400">No linked users yet.</p>
              ) : (
                <ul className="space-y-2">
                  {users.map((u) => {
                    const accountOn = isUserAccountActive(u);
                    const busy = userBusyId === u.id;
                    const isSelf = u.id === user?.uid;
                    const isOtherOwner = u.role === ROLES.SHOP_ADMIN && !isSelf;
                    const isStaff =
                      u.role === ROLES.TECH ||
                      u.role === ROLES.PARTS_MANAGER ||
                      !u.role;
                    return (
                      <li
                        key={u.id}
                        className={`p-3 rounded-xl text-sm border space-y-2 ${
                          accountOn
                            ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700'
                            : 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              {u.displayName || u.email}
                              {isSelf ? ' (you)' : ''}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[10px] font-bold uppercase text-slate-400">
                              {roleLabel(u.role)}
                            </div>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                accountOn
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200'
                              }`}
                            >
                              {accountOn ? 'Active' : 'Off'}
                            </span>
                          </div>
                        </div>
                        {!isSelf && isStaff && (
                          <div className="space-y-2">
                            <div>
                              <label className="lbl">Role</label>
                              <select
                                className="field text-xs font-bold py-2"
                                disabled={busy}
                                value={
                                  OWNER_ASSIGNABLE_ROLES.includes(u.role)
                                    ? u.role
                                    : ROLES.TECH
                                }
                                onChange={async (e) => {
                                  const role = e.target.value;
                                  setUserBusyId(u.id);
                                  try {
                                    await setUserRole(u.id, role, { allowOwner: false });
                                    setStaffMsg(
                                      `${u.displayName || u.email} → ${roleLabel(role)}`
                                    );
                                    reloadUsers();
                                  } catch (err) {
                                    setStaffMsg(err.message || 'Could not change role');
                                  } finally {
                                    setUserBusyId(null);
                                  }
                                }}
                              >
                                <option value={ROLES.TECH}>Tech</option>
                                <option value={ROLES.PARTS_MANAGER}>Parts manager</option>
                              </select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {accountOn ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    if (
                                      !confirm(
                                        `Deactivate ${u.displayName || u.email}? They lose access immediately.`
                                      )
                                    ) {
                                      return;
                                    }
                                    setUserBusyId(u.id);
                                    try {
                                      await setUserActive(u.id, false);
                                      setStaffMsg(`Deactivated ${u.displayName || u.email}`);
                                      reloadUsers();
                                    } catch (err) {
                                      setStaffMsg(err.message || 'Failed');
                                    } finally {
                                      setUserBusyId(null);
                                    }
                                  }}
                                  className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    setUserBusyId(u.id);
                                    try {
                                      await setUserActive(u.id, true);
                                      setStaffMsg(`Reactivated ${u.displayName || u.email}`);
                                      reloadUsers();
                                    } catch (err) {
                                      setStaffMsg(err.message || 'Failed');
                                    } finally {
                                      setUserBusyId(null);
                                    }
                                  }}
                                  className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                                >
                                  Reactivate
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `Remove ${u.displayName || u.email} from this shop?`
                                    )
                                  ) {
                                    return;
                                  }
                                  setUserBusyId(u.id);
                                  try {
                                    await removeUserFromCompany(u.id);
                                    setStaffMsg('Removed from shop');
                                    reloadUsers();
                                  } catch (err) {
                                    setStaffMsg(err.message || 'Failed');
                                  } finally {
                                    setUserBusyId(null);
                                  }
                                }}
                                className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                        {isOtherOwner && (
                          <p className="text-[10px] text-slate-400 font-semibold">
                            Owner — managed only in Master Control (platform).
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className={techBusy ? 'opacity-60 pointer-events-none' : ''}>
              <EditableList
                title="Technician names (for job assignment)"
                items={technicians}
                onChange={saveTechNames}
                placeholder="Tech name as shown on jobs"
              />
              <p className="text-[10px] text-slate-400 mt-1 px-1">
                These names appear on the dashboard filter and job “Assigned tech” list. Match them
                to how techs are labeled on the floor.
              </p>
            </div>
          </>
        )}

        {/* Dark mode */}
        <div className="app-card p-5">
          <div className="section-title mb-3">Appearance</div>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3 text-left">
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${primary}22`, color: primary }}
              >
                {isDark ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div>
                <div className="text-sm font-bold">Dark mode</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Easier on the eyes in the shop bay
                </div>
              </div>
            </div>
            <div
              className={`relative h-7 w-12 rounded-full transition-colors ${
                isDark ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  isDark ? 'translate-x-5' : ''
                }`}
              />
            </div>
          </button>
        </div>

        <div className="app-card p-5 space-y-3 text-sm">
          <div className="section-title mb-1">Signed in</div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase">
              Email
            </span>
            <span className="font-semibold text-right break-all">{user?.email}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase">
              Name
            </span>
            <span className="font-semibold">{profile?.displayName || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase">
              Role
            </span>
            <span className="font-semibold uppercase text-xs tracking-wider">
              {roleLabel(profile?.role)}
            </span>
          </div>
        </div>

        {!canManageTeam && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-950 dark:text-amber-100">
            <p className="font-bold mb-1">Need a change?</p>
            <p className="text-amber-900/80 dark:text-amber-100/80 text-xs leading-relaxed">
              Ask your shop <b>Owner</b> for invite codes, roles, or account access. Only the
              platform admin can appoint a new Owner.
            </p>
          </div>
        )}

        <div className="app-card p-5 lg:col-span-2">
          <div className="section-title mb-2">
            <MessageSquarePlus size={14} /> Ideas & support
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
            Have a suggestion or found a problem? Email the app maker — we read every message.
          </p>
          <a
            href={
              `mailto:${PLATFORM_ADMIN_EMAIL}` +
              '?subject=' +
              encodeURIComponent('Custom Shop Management — suggestion') +
              '&body=' +
              encodeURIComponent(
                'Shop: \nWhat I like / what I need:\n\n'
              )
            }
            className="inline-flex items-center gap-2 text-sm font-bold px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            style={{ color: primary }}
          >
            <Mail size={18} />
            {PLATFORM_ADMIN_EMAIL}
          </a>
        </div>

        <div className="lg:col-span-2">
        <button
          type="button"
          onClick={logout}
          className="w-full lg:max-w-md flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-[0.99] transition-transform"
          style={{ backgroundColor: primary, color: '#ffffff' }}
        >
          <LogOut size={16} color="#ffffff" /> Sign out
        </button>
        </div>
      </div>
      </div>
    </div>
  );
}
