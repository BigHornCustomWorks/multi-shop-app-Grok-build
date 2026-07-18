import React, { useState } from 'react';
import { Building2, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { findCompanyByInviteCode, setUserCompany } from '../lib/api';
import { ROLES } from '../lib/constants';
import { APP_NAME } from '../config';

/**
 * For shop staff who signed up but are not yet linked to a company.
 * Platform admin never sees this — they go to Master Control.
 */
export default function JoinShop() {
  const { user, profile, logout } = useAuth();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const company = await findCompanyByInviteCode(code);
      if (!company) {
        setError('No shop found with that code. Ask your admin for the invite code.');
        setBusy(false);
        return;
      }
      if (company.active === false) {
        setError('That shop is inactive. Contact the platform admin.');
        setBusy(false);
        return;
      }

      await setUserCompany({
        uid: user.uid,
        companyId: company.id,
        role: ROLES.TECH,
        displayName: displayName.trim(),
        email: user.email,
      });

      window.location.reload();
    } catch (err) {
      setError(err.message || 'Could not join shop');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell flex items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800">
      <div className="app-card p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black">{APP_NAME}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Join your shop</p>
          </div>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          Enter the invite code from your shop administrator to access your company’s jobs.
        </p>

        <form onSubmit={join} className="space-y-4">
          <div>
            <label className="lbl">Your name</label>
            <input
              className="field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Name shown on notes"
            />
          </div>
          <div>
            <label className="lbl">Invite code</label>
            <input
              required
              className="field font-mono tracking-widest uppercase text-center text-lg"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-xl text-xs font-bold flex gap-2 border border-red-100 dark:border-red-900">
              <ShieldAlert size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg active:scale-[0.99]"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Join shop
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="w-full mt-4 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </div>
  );
}
