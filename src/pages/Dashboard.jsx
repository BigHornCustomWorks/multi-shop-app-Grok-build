import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Package,
  Settings,
  LogOut,
  AlertTriangle,
  Filter,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { subscribeJobs, saveJob, emptyJob, formatDaysAtShop } from '../lib/api';
import { DEFAULT_BRANDING, pillStyle } from '../lib/constants';
import { APP_NAME } from '../config';
import PillSelect from '../components/PillSelect';

function partsNeedingReturn(job) {
  return (job.parts || []).filter((p) => p.isReturning);
}

function normalizeFilter(value, technicians) {
  const v = value || 'all';
  if (v === 'all' || v === 'unassigned') return v;
  // Keep tech name even if temporarily missing from list (still matches jobs)
  if (technicians.includes(v) || v) return v;
  return 'all';
}

function filterLabel(filter) {
  if (filter === 'all') return 'All jobs';
  if (filter === 'unassigned') return 'Unassigned only';
  return `${filter}'s jobs`;
}

export default function Dashboard({ onOpenJob, onOpenSettings }) {
  const { company, profile, setJobFilter, logout } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [dbStatus, setDbStatus] = useState('connecting');

  const settings = company?.settings || {};
  const technicians = settings.technicians || [];
  const repairStatuses = settings.repairStatuses || [];
  const vehicleLocations = settings.vehicleLocations || [];
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const statusPillColor =
    company?.branding?.statusPillColor || DEFAULT_BRANDING.statusPillColor;
  const locationPillColor =
    company?.branding?.locationPillColor || DEFAULT_BRANDING.locationPillColor;
  const shopName = company?.name || APP_NAME;

  const jobFilter = normalizeFilter(profile?.jobFilter, technicians);

  useEffect(() => {
    if (!company?.id) return undefined;
    return subscribeJobs(
      company.id,
      (list) => {
        setJobs(list);
        setDbStatus('online');
      },
      () => setDbStatus('error')
    );
  }, [company?.id]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (tab === 'active' ? j.isArchived : !j.isArchived) return false;

      if (jobFilter === 'unassigned') {
        if (j.assignedTech) return false;
      } else if (jobFilter !== 'all') {
        if (j.assignedTech !== jobFilter) return false;
      }

      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (j.customerName || '').toLowerCase().includes(q) ||
        (j.roNumber || '').toLowerCase().includes(q) ||
        (j.vehicle || '').toLowerCase().includes(q)
      );
    });
  }, [jobs, tab, search, jobFilter]);

  const createJob = async () => {
    const statuses = settings.repairStatuses || [];
    const locations = settings.vehicleLocations || [];
    const job = emptyJob({
      repairStatus: statuses[0] || 'Initial Teardown',
      vehicleLocation: locations[0] || 'Main Bay',
    });
    // Ensure new fields are always written for dashboard counters
    job.arrivalDate = job.arrivalDate || new Date().toISOString().split('T')[0];
    job.damageSummary = job.damageSummary || '';
    const saved = await saveJob(company.id, job);
    onOpenJob(saved);
  };

  const patchJob = async (job, fields) => {
    if (!company?.id) return;
    await saveJob(company.id, { ...job, ...fields });
  };

  const onFilterChange = (value) => {
    setJobFilter(value);
  };

  // Include saved tech filter in options even if removed from master list
  const filterOptions = useMemo(() => {
    const opts = [
      { value: 'all', label: 'All jobs' },
      { value: 'unassigned', label: 'Unassigned' },
    ];
    const seen = new Set(['all', 'unassigned']);
    technicians.forEach((t) => {
      if (!seen.has(t)) {
        opts.push({ value: t, label: t });
        seen.add(t);
      }
    });
    if (jobFilter && !seen.has(jobFilter)) {
      opts.push({ value: jobFilter, label: `${jobFilter} (saved)` });
    }
    return opts;
  }, [technicians, jobFilter]);

  return (
    <div className="app-shell">
      <div className="app-frame app-frame--wide flex flex-col relative lg:shadow-sm">
      <header className="app-header sticky top-0 z-20">
        <div className="app-page-pad py-4 lg:py-5">
        <div className="flex justify-between items-center mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {company?.branding?.logoUrl ? (
              <img
                src={company.branding.logoUrl}
                alt=""
                className="h-11 w-11 lg:h-12 lg:w-12 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-600 shadow-sm"
              />
            ) : (
              <div
                className="h-11 w-11 lg:h-12 lg:w-12 rounded-2xl flex items-center justify-center text-white font-black shrink-0 shadow-md"
                style={{ backgroundColor: primary }}
              >
                {shopName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-black text-lg lg:text-xl tracking-tight truncate">{shopName}</h1>
              <p className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider truncate">
                {APP_NAME}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                dbStatus === 'online'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
              }`}
            >
              {dbStatus === 'online' ? 'LIVE' : 'SYNC'}
            </span>
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Account & appearance"
            >
              <Settings size={20} />
            </button>
            <button
              type="button"
              onClick={logout}
              className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              title="Sign out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Toolbar:
            mobile  = filter → search → active/archived → New job
            desktop = filter | search | New job | active/archived  (one row) */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-3">
          {/* Job filter — saved on user account */}
          <div className="lg:w-56 xl:w-64 shrink-0">
            <label className="lbl flex items-center gap-1.5 mb-1.5">
              <Filter size={12} /> Show jobs
            </label>
            <div className="relative">
              <select
                value={jobFilter}
                onChange={(e) => onFilterChange(e.target.value)}
                className="field text-sm font-bold py-2.5 pr-10 appearance-none cursor-pointer"
                style={{ borderColor: jobFilter !== 'all' ? primary : undefined }}
              >
                {filterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Filter
                size={14}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
            {jobFilter !== 'all' && (
              <p className="mt-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Showing {filterLabel(jobFilter).toLowerCase()}
                {' · '}
                <button
                  type="button"
                  className="underline font-bold"
                  style={{ color: primary }}
                  onClick={() => onFilterChange('all')}
                >
                  Show all
                </button>
                <span className="font-medium opacity-80"> (saved)</span>
              </p>
            )}
          </div>

          <div className="relative flex-1 min-w-0">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10"
              aria-hidden
            />
            <input
              type="text"
              placeholder="Search customer, RO, vehicle…"
              className="field py-2.5 text-sm"
              style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Desktop: New job between search and Active/Archived */}
          <button
            type="button"
            onClick={createJob}
            className="hidden lg:inline-flex shrink-0 items-center justify-center gap-2 text-white rounded-xl shadow-md active:scale-[0.98] transition-transform px-5 py-2.5 font-black text-xs uppercase tracking-widest"
            style={{ backgroundColor: primary }}
          >
            <Plus size={16} strokeWidth={2.5} />
            New job
          </button>

          <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/80 lg:w-52 xl:w-56 shrink-0">
            {['active', 'archived'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all ${
                  tab === t
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
                style={tab === t ? { color: primary } : undefined}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Mobile: New job under Active / Archived */}
          <button
            type="button"
            onClick={createJob}
            className="lg:hidden w-full flex items-center justify-center gap-2 text-white rounded-xl shadow-md active:scale-[0.98] transition-transform px-5 py-3 font-black text-xs uppercase tracking-widest"
            style={{ backgroundColor: primary }}
          >
            <Plus size={16} strokeWidth={2.5} />
            New job
          </button>
        </div>
        </div>
      </header>

      <main className="flex-1 app-page-pad py-4 pb-8">
        {filtered.length === 0 ? (
          <div className="app-card text-center py-16 px-6 max-w-lg mx-auto">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Package className="w-7 h-7 text-slate-400 opacity-70" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              No {tab} jobs
              {jobFilter !== 'all' ? ` for this filter` : ''}
            </p>
            <p className="text-xs mt-1.5 text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              {jobFilter !== 'all'
                ? 'Try “All jobs” or assign more work to this tech.'
                : tab === 'active'
                  ? 'Tap New job to start a repair file for a customer.'
                  : 'Archived jobs will show up here.'}
            </p>
            {jobFilter !== 'all' && (
              <button
                type="button"
                onClick={() => onFilterChange('all')}
                className="mt-4 text-xs font-black uppercase tracking-wider px-4 py-2 rounded-full text-white"
                style={{ backgroundColor: primary }}
              >
                Show all jobs
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {filtered.map((job) => {
            const returns = partsNeedingReturn(job);
            const returnCount = returns.length;
            const arrivalForDays =
              job.arrivalDate ||
              (job.createdAt
                ? new Date(job.createdAt).toISOString().split('T')[0]
                : null);
            const daysLabel = formatDaysAtShop(arrivalForDays);

            return (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenJob(job)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenJob(job);
                  }
                }}
                className={`app-card app-card-press p-4 cursor-pointer h-full ${
                  returnCount > 0
                    ? 'border-red-300 dark:border-red-700 ring-1 ring-red-200/80 dark:ring-red-900/50'
                    : ''
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] text-slate-900 dark:text-slate-50 truncate">
                      {job.customerName || 'New Repair'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                      {job.vehicle || 'No vehicle specified'}
                    </div>

                    {job.damageSummary ? (
                      <div className="mt-0.5 text-xs text-slate-900 dark:text-slate-50 font-medium leading-snug line-clamp-2">
                        <span className="font-bold text-slate-900 dark:text-slate-50 mr-1">
                          Damage:
                        </span>
                        {job.damageSummary}
                      </div>
                    ) : null}

                    {returnCount > 0 && (
                      <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 px-3 py-1 text-red-700 dark:text-red-300">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span className="text-[11px] font-black uppercase tracking-wide">
                          {returnCount} return{returnCount === 1 ? '' : 's'}
                        </span>
                        <span className="text-[10px] font-medium opacity-80 truncate max-w-[9rem]">
                          {returns[0]?.description || returns[0]?.partNumber || 'Part'}
                          {returnCount > 1 ? ` +${returnCount - 1}` : ''}
                        </span>
                      </div>
                    )}

                    <div className="mt-3.5 flex flex-wrap gap-2 items-center">
                      <PillSelect
                        value={job.repairStatus || repairStatuses[0] || ''}
                        options={repairStatuses}
                        onChange={(v) => patchJob(job, { repairStatus: v })}
                        style={pillStyle(statusPillColor)}
                        title="Repair status"
                      />
                      <PillSelect
                        value={job.vehicleLocation || vehicleLocations[0] || ''}
                        options={vehicleLocations}
                        onChange={(v) => patchJob(job, { vehicleLocation: v })}
                        style={pillStyle(locationPillColor)}
                        title="Vehicle location"
                      />
                      {job.assignedTech && (
                        <span className="text-[11px] font-bold px-3 py-2 rounded-full bg-blue-50 text-blue-800 border-2 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800">
                          {job.assignedTech}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-600">
                      RO {job.roNumber || '—'}
                    </div>
                    {daysLabel && (
                      <div
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-1 rounded-full"
                        title={
                          arrivalForDays
                            ? `In shop since ${arrivalForDays}`
                            : 'Days at shop'
                        }
                      >
                        <CalendarDays size={12} className="opacity-70" />
                        {daysLabel}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </main>

      </div>
    </div>
  );
}
