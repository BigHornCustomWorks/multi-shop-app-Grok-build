import React, { useState } from 'react';
import { Database, ShieldAlert } from 'lucide-react';
import { APP_NAME } from '../config';
import { saveFirebaseConfig, initFirebase } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export default function FirebaseSetup() {
  const { connectFirebase } = useAuth();
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error('Missing apiKey or projectId');
      }
      saveFirebaseConfig(parsed);
      initFirebase(parsed);
      connectFirebase(parsed);
      window.location.reload();
    } catch {
      setError('Paste a valid Firebase web config JSON (must include apiKey and projectId).');
    }
  };

  return (
    <div className="app-shell flex items-center justify-center p-6 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800">
      <div className="app-card p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/60 rounded-2xl text-blue-600 dark:text-blue-400">
            <Database size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black">{APP_NAME}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              First-time setup
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          Create a <b>new</b> Firebase project for this product, then paste the web app config JSON
          below. See <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">SETUP.md</code>{' '}
          for steps.
        </p>

        <textarea
          className="field h-48 text-xs font-mono mb-4"
          placeholder='{"apiKey":"...","authDomain":"...","projectId":"...", ...}'
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100 dark:border-red-900">
            <ShieldAlert size={14} /> {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg active:scale-[0.99]"
        >
          Connect Firebase
        </button>
      </div>
    </div>
  );
}
