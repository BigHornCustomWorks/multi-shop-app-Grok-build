import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Package,
  Check,
  Clock,
  Loader2,
  Briefcase,
  Settings,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribePartRequests,
  updatePartRequest,
  getJob,
  subscribeJobs,
  collectReturningParts,
  markPartReturned,
} from '../lib/api';
import { DEFAULT_BRANDING } from '../lib/constants';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'received', label: 'Received' },
  { id: 'returns', label: 'Returns' },
  { id: 'all', label: 'All reqs' },
];

export default function PartsInbox({
  onBack,
  onOpenJobs,
  onOpenJob,
  isPartsHome,
  onOpenSettings,
}) {
  const { company, profile, user } = useAuth();
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const [requests, setRequests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('open');
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [error, setError] = useState('');
  const [openingJobId, setOpeningJobId] = useState(null);

  useEffect(() => {
    if (!company?.id) return undefined;
    return subscribePartRequests(
      company.id,
      setRequests,
      (err) => {
        console.error(err);
        const msg = err.message || 'Could not load requests';
        setError(
          /permission|insufficient/i.test(msg)
            ? 'Missing permissions for part requests. In Firebase Console → Firestore → Rules, publish the latest rules from the project file firestore.rules (must include partRequests), then try again.'
            : msg
        );
      }
    );
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id) return undefined;
    return subscribeJobs(
      company.id,
      setJobs,
      (err) => console.warn('Jobs for returns', err)
    );
  }, [company?.id]);

  const returnRows = useMemo(() => collectReturningParts(jobs), [jobs]);

  const filtered = useMemo(() => {
    if (filter === 'returns') return [];
    if (filter === 'all') return requests;
    return requests.filter((r) => r.status === filter);
  }, [filter, requests]);

  const shownCount = filter === 'returns' ? returnRows.length : filtered.length;

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

  const openLinkedJob = async (jobId, rowKey) => {
    if (!company?.id || !jobId || !onOpenJob) {
      onOpenJobs?.();
      return;
    }
    setOpeningJobId(rowKey || jobId);
    try {
      const job = await getJob(company.id, jobId);
      if (job) onOpenJob(job);
      else {
        alert('Job not found (may have been deleted). Opening jobs list.');
        onOpenJobs?.();
      }
    } catch (err) {
      alert(err.message || 'Could not open job');
    } finally {
      setOpeningJobId(null);
    }
  };

  const markReturned = async (row) => {
    if (!company?.id) return;
    if (
      !confirm(
        `Mark returned?\n\n${row.description}${
          row.partNumber ? ` (#${row.partNumber})` : ''
        }\n${row.jobCustomerName || ''} ${row.jobRo ? `RO ${row.jobRo}` : ''}`
      )
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      await markPartReturned(company.id, row.jobId, row.partId);
    } catch (err) {
      alert(err.message || 'Could not mark returned');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-frame app-frame--wide flex flex-col">
        <header className="app-header sticky top-0 z-20">
          <div className="app-page-pad py-3 lg:py-4 flex items-center gap-3">
            {!isPartsHome && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-black text-base lg:text-lg flex items-center gap-2">
                <Package size={20} style={{ color: primary }} />
                Parts desk
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {shownCount} shown
                {returnRows.length > 0 && filter !== 'returns'
                  ? ` · ${returnRows.length} return${returnRows.length === 1 ? '' : 's'}`
                  : ''}
                {isPartsHome ? ' · your home' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenJobs?.() || onBack?.()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 shrink-0"
              title="Jobs dashboard — update part locations on vehicles"
            >
              <Briefcase size={14} />
              Jobs
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Account"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
          <div className="app-page-pad pb-3 flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => {
              const isReturns = f.id === 'returns';
              const active = filter === f.id;
              const count = isReturns
                ? returnRows.length
                : f.id === 'all'
                  ? requests.length
                  : requests.filter((r) => r.status === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                    active
                      ? 'text-white'
                      : isReturns && count > 0
                        ? 'bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                  style={
                    active
                      ? { backgroundColor: isReturns ? '#dc2626' : primary }
                      : undefined
                  }
                >
                  {f.label}
                  {count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>
        </header>

        <main className="app-page-pad py-3 pb-8 space-y-3">
          {error && (
            <div className="app-card p-3 text-xs font-bold text-red-600">{error}</div>
          )}

          {filter === 'returns' ? (
            returnRows.length === 0 ? (
              <div className="app-card text-center py-14 px-6">
                <RotateCcw className="mx-auto mb-3 text-slate-300" size={36} />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  No parts flagged for return
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  When a tech marks <b>Needs return</b> on a job part, it shows up here.
                </p>
              </div>
            ) : (
              returnRows.map((row) => (
                <div
                  key={row.id}
                  className="app-card p-4 space-y-3 border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-red-600 shrink-0" />
                        <span className="truncate">{row.description}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {[
                          row.jobCustomerName,
                          row.jobVehicle,
                          row.jobRo ? `RO ${row.jobRo}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Job'}
                      </div>
                      <button
                        type="button"
                        disabled={openingJobId === row.id}
                        onClick={() => openLinkedJob(row.jobId, row.id)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide"
                        style={{ color: primary }}
                      >
                        {openingJobId === row.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ExternalLink size={12} />
                        )}
                        Open job
                      </button>
                    </div>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 shrink-0">
                      Return
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    {row.partNumber && (
                      <span className="font-mono font-bold bg-white/80 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        #{row.partNumber}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-800">
                      Qty {row.quantity || 1}
                    </span>
                    {row.location && (
                      <span className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-800">
                        Loc: {row.location}
                      </span>
                    )}
                    {row.status && (
                      <span className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-800">
                        {row.status}
                      </span>
                    )}
                  </div>

                  {row.returnReason && (
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      Reason: {row.returnReason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => markReturned(row)}
                      className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-emerald-600 text-white flex items-center gap-1 disabled:opacity-50"
                    >
                      {busyId === row.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Mark returned
                    </button>
                  </div>
                </div>
              ))
            )
          ) : filtered.length === 0 ? (
            <div className="app-card text-center py-14 px-6">
              <Package className="mx-auto mb-3 text-slate-300" size={36} />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                No {filter === 'all' ? '' : filter} requests
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Techs use <b>REQ</b> on job cards. Check the <b>Returns</b> tab for parts flagged on
                jobs.
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
                    {req.jobId && (
                      <button
                        type="button"
                        disabled={openingJobId === req.id}
                        onClick={() => openLinkedJob(req.jobId, req.id)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide"
                        style={{ color: primary }}
                      >
                        {openingJobId === req.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ExternalLink size={12} />
                        )}
                        Open job (locations)
                      </button>
                    )}
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
