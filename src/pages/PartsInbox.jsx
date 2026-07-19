import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  Check,
  Clock,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribePartRequests,
  updatePartRequest,
} from '../lib/api';
import { DEFAULT_BRANDING } from '../lib/constants';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'received', label: 'Received' },
  { id: 'all', label: 'All' },
];

export default function PartsInbox({ onBack, onOpenJob }) {
  const { company, profile, user } = useAuth();
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('open');
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!company?.id) return undefined;
    return subscribePartRequests(
      company.id,
      setRequests,
      (err) => {
        console.error(err);
        setError(err.message || 'Could not load requests');
      }
    );
  }, [company?.id]);

  const filtered = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const setStatus = async (req, status) => {
    if (!company?.id) return;
    setBusyId(req.id);
    try {
      await updatePartRequest(company.id, req.id, {
        status,
        resolvedAt: status === 'open' ? null : Date.now(),
        resolvedByName: profile?.displayName || user?.email || '',
      });
    } catch (err) {
      alert(err.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-frame app-frame--wide flex flex-col">
        <header className="app-header sticky top-0 z-20">
          <div className="app-page-pad py-3 lg:py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-black text-base lg:text-lg flex items-center gap-2">
                <Package size={20} style={{ color: primary }} />
                Parts requests
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {filtered.length} shown
              </p>
            </div>
          </div>
          <div className="app-page-pad pb-3 flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                  filter === f.id
                    ? 'text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}
                style={filter === f.id ? { backgroundColor: primary } : undefined}
              >
                {f.label}
              </button>
            ))}
          </div>
        </header>

        <main className="app-page-pad py-3 pb-8 space-y-3">
          {error && (
            <div className="app-card p-3 text-xs font-bold text-red-600">{error}</div>
          )}

          {filtered.length === 0 ? (
            <div className="app-card text-center py-14 px-6">
              <Package className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                No {filter === 'all' ? '' : filter} requests
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Techs submit requests from a job file.
              </p>
            </div>
          ) : (
            filtered.map((req) => (
              <div
                key={req.id}
                className={`app-card p-4 space-y-3 ${
                  req.urgency === 'urgent' && req.status === 'open'
                    ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-900'
                    : ''
                }`}
              >
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-slate-50">
                      {req.description || 'Part request'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {[req.jobCustomerName, req.jobVehicle, req.jobRo ? `RO ${req.jobRo}` : '']
                        .filter(Boolean)
                        .join(' · ') || 'No job labels'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {req.urgency === 'urgent' && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        Urgent
                      </span>
                    )}
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {req.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  {req.partNumber && (
                    <span className="font-mono font-bold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
                      #{req.partNumber}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800">
                    Qty {req.quantity || 1}
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800">
                    by {req.createdByName || 'Tech'}
                  </span>
                  {req.createdAt && (
                    <span className="px-2 py-1 text-slate-400">
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>

                {req.note && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {req.note}
                  </p>
                )}

                {!!req.photos?.length && (
                  <div className="flex gap-2 overflow-x-auto">
                    {req.photos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setLightbox(p)}
                        className="shrink-0"
                      >
                        <img
                          src={p.url}
                          alt=""
                          className="h-20 w-20 object-cover rounded-xl border border-slate-200 dark:border-slate-600"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {req.status === 'open' && (
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => setStatus(req, 'ordered')}
                      className="text-[10px] font-black uppercase px-3 py-2 rounded-lg text-white flex items-center gap-1"
                      style={{ backgroundColor: primary }}
                    >
                      {busyId === req.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Clock size={12} />
                      )}
                      Mark ordered
                    </button>
                  )}
                  {(req.status === 'open' || req.status === 'ordered') && (
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => setStatus(req, 'received')}
                      className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-emerald-600 text-white flex items-center gap-1"
                    >
                      <Check size={12} /> Received
                    </button>
                  )}
                  {req.status !== 'cancelled' && req.status !== 'received' && (
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => setStatus(req, 'cancelled')}
                      className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-700"
                    >
                      Cancel
                    </button>
                  )}
                  {req.status !== 'open' && (
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => setStatus(req, 'open')}
                      className="text-[10px] font-black uppercase px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </main>

        {lightbox && (
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 text-white/90 bg-white/10 px-3 py-2 rounded-full text-xs font-black uppercase"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
            <img
              src={lightbox.url}
              alt=""
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
