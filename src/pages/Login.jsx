import React, { useState } from 'react';
import { Building2, Loader2, ShieldAlert, CheckCircle2, ArrowLeft, KeyRound } from 'lucide-react';
import { APP_NAME } from '../config';
import { useAuth } from '../context/AuthContext';

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code === 'auth/invalid-email') return 'Invalid email address.';
  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential'
  ) {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/email-already-in-use') return 'That email is already registered. Try logging in.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/operation-not-allowed') {
    return 'Enable Email/Password in Firebase Console → Authentication.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (code === 'auth/missing-email') return 'Enter your email address.';
  return err?.message || 'Something went wrong.';
}

export default function Login() {
  const { login, signup, resetPassword, error: authError, setError: setAuthError } = useAuth();
  const [mode, setMode] = useState('login'); // login | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const displayError = error || authError || '';

  const goMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setAuthError?.(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    setAuthError?.(null);
    try {
      if (mode === 'login') {
        await login(email, password);
        // If account is deactivated, AuthContext signs out and sets authError
      } else if (mode === 'signup') {
        await signup(email, password, displayName);
      } else if (mode === 'reset') {
        try {
          await resetPassword(email);
        } catch (err) {
          // Don't reveal whether the email exists (same UX either way)
          if (err?.code !== 'auth/user-not-found' && err?.code !== 'auth/invalid-credential') {
            throw err;
          }
        }
        setInfo(
          'If that email is registered, Firebase sent a password reset link. Check inbox and spam, then come back here to log in.'
        );
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell flex items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 dark:from-black dark:via-slate-950 dark:to-slate-900">
      <div className="app-card p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400">
            {mode === 'reset' ? <KeyRound size={24} /> : <Building2 size={24} />}
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">{APP_NAME}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              {mode === 'reset' ? 'Reset password' : 'Cars · Parts · Notes · Photos'}
            </p>
          </div>
        </div>

        {mode !== 'reset' ? (
          <div className="flex gap-2 my-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {[
              { id: 'login', label: 'Log In' },
              { id: 'signup', label: 'Sign Up' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => goMode(m.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  mode === m.id
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => goMode('login')}
            className="my-5 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-blue-600"
          >
            <ArrowLeft size={14} /> Back to log in
          </button>
        )}

        {mode === 'reset' && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Enter the email for the account. We’ll send a link to choose a new password. The link comes
            from Firebase (Google).
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="lbl">Your Name</label>
              <input
                className="field"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name"
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="lbl">Email</label>
            <input
              type="email"
              required
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@shop.com"
              autoComplete="email"
            />
          </div>
          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="lbl mb-0">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => goMode('reset')}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
          )}

          {displayError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-xl text-xs font-bold flex items-start gap-2 border border-red-100 dark:border-red-900">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              {displayError}
            </div>
          )}

          {info && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-start gap-2 border border-emerald-100 dark:border-emerald-900">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99]"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'login' && 'Log In'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Send reset link'}
          </button>
        </form>

        {mode === 'reset' && info && (
          <button
            type="button"
            onClick={() => goMode('login')}
            className="w-full mt-3 py-3 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
          >
            Return to log in
          </button>
        )}

        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center mt-6 leading-relaxed">
          {mode === 'reset' ? (
            <>
              Admin tip: you can also reset a user in Firebase Console → Authentication → user →
              reset password.
            </>
          ) : (
            <>
              Shop staff: log in with the account your admin created for you.
              <br />
              Platform owner: use your admin email for Master Control.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
