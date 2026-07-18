import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Camera,
  StickyNote,
  Package,
  Image as ImageIcon,
  Share2,
  Copy,
  Mail,
  X,
  Check,
  FileImage,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  saveJob,
  emptyJob,
  emptyPart,
  uploadJobPhoto,
  deleteJobPhotoFile,
  shouldNotifyCustomerOnStatus,
} from '../lib/api';
import { generateId } from '../lib/ids';
import { DEFAULT_BRANDING } from '../lib/constants';
import {
  buildJobSummary,
  jobEmailSubject,
  openMailto,
  copyText,
} from '../lib/jobShare';
import { getInvoiceApiKey, invoiceApiKeyHint, SCAN_MODES } from '../lib/invoicePrompt';
import {
  scanDocumentWithGrok,
  invoiceJsonToParts,
  invoiceJsonToJobPatches,
} from '../lib/invoiceScan';

export default function JobDetail({ job, onBack }) {
  const { company, user, profile } = useAuth();
  const [form, setForm] = useState(job);
  const [section, setSection] = useState('info');
  const [isScanning, setIsScanning] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [lightbox, setLightbox] = useState(null); // photo object or null
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [selectedPartIds, setSelectedPartIds] = useState([]);
  const [bulkLocation, setBulkLocation] = useState('');
  const [scanPickerOpen, setScanPickerOpen] = useState(false);
  const [scanMode, setScanMode] = useState('ccc_estimate');
  /** Always-mounted file inputs (must not live only inside Parts tab) */
  const scanFileRef = useRef(null);
  const scanCameraRef = useRef(null);
  const photoRef = useRef(null);
  const invoiceKey = getInvoiceApiKey();

  const settings = company?.settings || {};
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const vehicleLocations = settings.vehicleLocations || [];
  const repairStatuses = settings.repairStatuses || [];
  const partStatuses = settings.partStatuses || [];
  const partLocations = settings.partLocations || [];
  const returnReasons = settings.returnReasons || [];
  const technicians = settings.technicians || [];
  const scannerEnabled = Boolean(company?.features?.invoiceScanner);

  useEffect(() => {
    // Merge defaults so older jobs still show new fields
    setForm({
      ...emptyJob(),
      ...job,
      arrivalDate:
        job?.arrivalDate ||
        (job?.createdAt
          ? new Date(job.createdAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]),
      damageSummary: job?.damageSummary || '',
      customerEmail: job?.customerEmail || '',
      customerPhone: job?.customerPhone || '',
      allowEmailUpdates: Boolean(job?.allowEmailUpdates),
    });
    setSelectedPartIds([]);
    setBulkLocation('');
    setSection('info');
  }, [job?.id]);

  useEffect(() => {
    if (!lightbox && !shareOpen && !scanPickerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setLightbox(null);
        setShareOpen(false);
        setScanPickerOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, shareOpen, scanPickerOpen]);

  const shopName = company?.name || '';
  const summaryText = buildJobSummary(form, shopName);
  const emailSubject = jobEmailSubject(form, shopName);

  const handleCopySummary = async () => {
    try {
      await copyText(summaryText);
      setShareMsg('Copied to clipboard');
      setTimeout(() => setShareMsg(''), 2500);
    } catch {
      setShareMsg('Could not copy — select text manually');
    }
  };

  const handleEmailShare = () => {
    openMailto({
      to: shareEmail,
      subject: emailSubject,
      body: summaryText,
    });
    setShareMsg('Opening your email app…');
    setTimeout(() => setShareMsg(''), 3000);
  };

  const togglePartSelected = (partId) => {
    setSelectedPartIds((prev) =>
      prev.includes(partId) ? prev.filter((id) => id !== partId) : [...prev, partId]
    );
  };

  const selectAllParts = () => {
    setSelectedPartIds((form.parts || []).map((p) => p.id));
  };

  const clearPartSelection = () => setSelectedPartIds([]);

  const applyBulkLocation = () => {
    const loc = bulkLocation.trim();
    if (!loc || selectedPartIds.length === 0) return;
    const selected = new Set(selectedPartIds);
    const parts = (form.parts || []).map((p) =>
      selected.has(p.id) ? { ...p, location: loc } : p
    );
    update('parts', parts);
    setBulkLocation('');
  };

  const patchPart = (partId, fields) => {
    const parts = (form.parts || []).map((p) =>
      p.id === partId ? { ...p, ...fields } : p
    );
    update('parts', parts);
  };

  const persist = async (next) => {
    setForm(next);
    if (!company?.id) return;
    await saveJob(company.id, next);
  };

  const update = (field, val) => {
    const next = { ...form, [field]: val };
    persist(next);
  };

  const returningParts = (form.parts || []).filter((p) => p.isReturning);
  const hasPendingReturns = returningParts.length > 0;

  const addNote = () => {
    if (!noteDraft.trim()) return;
    const note = {
      id: generateId(),
      text: noteDraft.trim(),
      createdAt: Date.now(),
      createdByName: profile?.displayName || user?.email || 'User',
      createdByUid: user?.uid || '',
    };
    update('notes', [note, ...(form.notes || [])]);
    setNoteDraft('');
  };

  const tryArchiveToggle = () => {
    if (!form.isArchived && hasPendingReturns) {
      alert(
        `Cannot archive while ${returningParts.length} part${
          returningParts.length === 1 ? '' : 's'
        } still need to be returned.\n\nOpen Parts and mark each as returned first.`
      );
      return;
    }
    update('isArchived', !form.isArchived);
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !company?.id || !form.id) return;
    setUploadingPhoto(true);
    try {
      const photo = await uploadJobPhoto(company.id, form.id, file, {
        createdByName: profile?.displayName || user?.email || '',
        createdByUid: user?.uid || '',
      });
      update('photos', [photo, ...(form.photos || [])]);
    } catch (err) {
      alert(err.message || 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const removePhoto = async (photo) => {
    await deleteJobPhotoFile(photo.path);
    update(
      'photos',
      (form.photos || []).filter((p) => p.id !== photo.id)
    );
  };

  const openScanPicker = () => {
    if (!scannerEnabled) {
      alert('AI scanner is not enabled for this shop. Turn it on in Master Control.');
      return;
    }
    if (!invoiceKey) {
      alert(
        `Scanner API key not configured on this site.\n\n` +
          `Local: add VITE_XAI_API_KEY to .env and restart.\n` +
          `Vercel: Project → Settings → Environment Variables → VITE_XAI_API_KEY → Redeploy.`
      );
      return;
    }
    setScanPickerOpen(true);
  };

  /** Set mode in the same user gesture as opening the picker (required by browsers). */
  const armScanMode = (mode) => {
    setScanMode(mode);
  };

  const handleScanDocument = async (e) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be chosen again later
    const clearInput = () => {
      e.target.value = '';
    };
    if (!file) return;
    if (!scannerEnabled) {
      alert('AI scanner is not enabled for this shop.');
      clearInput();
      return;
    }
    if (!invoiceKey) {
      alert(`Scanner API key not configured.\n\n${invoiceApiKeyHint()}`);
      clearInput();
      return;
    }

    const mode = scanMode || 'parts_invoice';
    const modeLabel = SCAN_MODES[mode]?.label || 'Document';

    setScanPickerOpen(false);
    setIsScanning(true);
    try {
      const data = await scanDocumentWithGrok(invoiceKey, file, mode);

      const newParts = invoiceJsonToParts(data, emptyPart, {
        status: partStatuses.includes('Received') ? 'Received' : partStatuses[0] || 'Received',
        location: partLocations.includes('Receiving Shelf')
          ? 'Receiving Shelf'
          : partLocations[0] || 'Receiving Shelf',
      });

      // CCC: header fill is the main win even if few lines; parts invoice needs lines
      if (mode === 'parts_invoice' && !newParts.length) {
        alert('No line items found on this invoice. Try a clearer photo or add parts manually.');
        return;
      }

      const headerPatches = invoiceJsonToJobPatches(data, form, { mode });
      const next = {
        ...form,
        ...headerPatches,
        parts: newParts.length ? [...newParts, ...(form.parts || [])] : form.parts || [],
      };

      const noteBits = [];
      noteBits.push(modeLabel);
      if (data.estimate_number) noteBits.push(`Est #${data.estimate_number}`);
      if (data.invoice_number) noteBits.push(`Inv #${data.invoice_number}`);
      if (data.ro_number) noteBits.push(`RO ${data.ro_number}`);
      if (data.invoice_date) noteBits.push(`Date ${data.invoice_date}`);
      if (data.total != null) noteBits.push(`Total $${data.total}`);
      if (data.notes) noteBits.push(String(data.notes));
      if (newParts.length) noteBits.push(`${newParts.length} line(s)`);

      if (noteBits.length) {
        const note = {
          id: generateId(),
          text: `AI scan (${modeLabel}): ${noteBits.join(' · ')}`,
          createdAt: Date.now(),
          createdByName: profile?.displayName || user?.email || 'AI scan',
          createdByUid: user?.uid || '',
        };
        next.notes = [note, ...(form.notes || [])];
      }

      setForm(next);
      if (company?.id) await saveJob(company.id, next);

      if (mode === 'ccc_estimate') {
        setSection('info');
        alert(
          `CCC estimate imported.\n\n` +
            `Customer/vehicle/damage/RO filled when found.\n` +
            `Parts added: ${newParts.length}\n\n` +
            `Review Info and Parts, then adjust as needed.`
        );
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Could not scan document. Try again or enter data manually.');
    } finally {
      setIsScanning(false);
      clearInput();
    }
  };

  const tabs = [
    { id: 'info', label: 'Info' },
    {
      id: 'parts',
      label: hasPendingReturns
        ? `Parts (${form.parts?.length || 0}) · ${returningParts.length} return`
        : `Parts (${form.parts?.length || 0})`,
    },
    { id: 'photos', label: `Photos (${form.photos?.length || 0})` },
  ];

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
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate lg:text-lg">{form.customerName || 'New Repair'}</div>
          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
            RO: {form.roNumber || 'N/A'}
          </div>
        </div>
        {hasPendingReturns && (
          <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800">
            {returningParts.length} return
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setShareMsg('');
            setShareOpen(true);
          }}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          title="Share job"
        >
          <Share2 size={20} />
        </button>
        </div>
      </header>

      <div className="app-header sticky top-[57px] lg:top-[65px] z-30">
        <div className="app-page-pad flex overflow-x-auto gap-1">
        {tabs.map((t) => {
          const partsAlert = t.id === 'parts' && hasPendingReturns;
          const active = section === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`flex-1 min-w-[4.5rem] lg:flex-none lg:px-8 py-3 text-[11px] font-bold uppercase whitespace-nowrap px-2 rounded-t-lg transition-colors ${
                active ? 'border-b-2' : ''
              } ${
                partsAlert && !active
                  ? 'text-red-600 dark:text-red-400'
                  : active
                    ? ''
                    : 'text-slate-400'
              }`}
              style={
                active
                  ? {
                      color: partsAlert ? '#dc2626' : primary,
                      borderColor: partsAlert ? '#dc2626' : primary,
                    }
                  : undefined
              }
            >
              {t.label}
            </button>
          );
        })}
        </div>
      </div>

      <div className="app-page-pad py-4 space-y-4 pb-24">
        {section === 'info' && (
          <div className="app-card p-5 lg:p-6 space-y-4 lg:max-w-none">
            {scannerEnabled && (
              <button
                type="button"
                onClick={openScanPicker}
                disabled={isScanning}
                className="w-full py-3.5 rounded-xl text-white font-black text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                style={{ backgroundColor: primary }}
              >
                {isScanning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                AI scan — CCC estimate or parts invoice
              </button>
            )}
            <div className="section-title">Customer & vehicle</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Field label="Customer name">
                <input
                  className="field"
                  value={form.customerName || ''}
                  onChange={(e) => update('customerName', e.target.value)}
                  placeholder="First Last"
                />
              </Field>
              <Field label="Vehicle">
                <input
                  className="field"
                  value={form.vehicle || ''}
                  onChange={(e) => update('vehicle', e.target.value)}
                  placeholder="Year Make Model"
                />
              </Field>
              <Field label="Date in shop (arrival)">
                <input
                  type="date"
                  className="field font-bold"
                  value={form.arrivalDate || ''}
                  onChange={(e) => update('arrivalDate', e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Used for the “days at shop” counter on the dashboard.
                </p>
              </Field>
              <div className="lg:col-span-2">
                <Field label="Damage / what happened">
                  <textarea
                    className="field text-sm min-h-[72px]"
                    value={form.damageSummary || ''}
                    onChange={(e) => update('damageSummary', e.target.value)}
                    placeholder="e.g. LF fender & door, hail roof, rear bumper — short note for the tech list"
                  />
                </Field>
              </div>
              <Field label="Customer email">
                <input
                  type="email"
                  className="field"
                  value={form.customerEmail || ''}
                  onChange={(e) => update('customerEmail', e.target.value)}
                  placeholder="customer@email.com"
                  autoComplete="off"
                />
              </Field>
              <Field label="Customer phone">
                <input
                  type="tel"
                  className="field"
                  value={form.customerPhone || ''}
                  onChange={(e) => update('customerPhone', e.target.value)}
                  placeholder="(555) 555-5555"
                  autoComplete="off"
                />
              </Field>
              <div className="lg:col-span-2">
                <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                    checked={Boolean(form.allowEmailUpdates)}
                    onChange={(e) => update('allowEmailUpdates', e.target.checked)}
                  />
                  <span>
                    <span className="text-sm font-bold block">Allow email updates</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      Customer opts in to status emails (default off). Only sends when this shop has
                      email updates enabled and the status is on the shop’s notify list.
                    </span>
                  </span>
                </label>
              </div>
              <Field label="RO number">
                <input
                  className="field"
                  value={form.roNumber || ''}
                  onChange={(e) => update('roNumber', e.target.value)}
                />
              </Field>
              <Field label="Vehicle location">
                <select
                  className="field font-bold"
                  value={form.vehicleLocation || vehicleLocations[0] || ''}
                  onChange={(e) => update('vehicleLocation', e.target.value)}
                >
                  {vehicleLocations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Repair status">
                <select
                  className="field font-bold"
                  value={form.repairStatus || repairStatuses[0] || ''}
                  onChange={(e) => update('repairStatus', e.target.value)}
                >
                  {repairStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {shouldNotifyCustomerOnStatus(form, company, form.repairStatus) && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold mt-1.5">
                    Ready for customer email when auto-send is live (opt-in + notify list + upgrade).
                  </p>
                )}
              </Field>
              <Field label="Assigned tech">
                <select
                  className="field font-bold"
                  value={form.assignedTech || ''}
                  onChange={(e) => update('assignedTech', e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {hasPendingReturns && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-red-700 dark:text-red-300 text-xs font-bold leading-relaxed">
                {returningParts.length} part{returningParts.length === 1 ? '' : 's'} still need return —
                archive is blocked until each is marked returned under Parts.
              </div>
            )}

            <button
              type="button"
              onClick={tryArchiveToggle}
              disabled={!form.isArchived && hasPendingReturns}
              className={`w-full py-3.5 rounded-xl text-xs font-black uppercase border transition-colors ${
                !form.isArchived && hasPendingReturns
                  ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-400 cursor-not-allowed'
                  : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {form.isArchived ? 'Unarchive job' : 'Archive job'}
            </button>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <div className="section-title">
                <StickyNote size={14} /> Notes
              </div>
              <textarea
                className="field min-h-[88px] text-sm"
                placeholder="Progress, customer call, damage notes…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <button
                type="button"
                onClick={addNote}
                className="w-full py-3.5 rounded-xl text-white text-xs font-black uppercase shadow-md active:scale-[0.99] transition-transform"
                style={{ backgroundColor: primary }}
              >
                Save note
              </button>
              {(form.notes || []).map((n) => (
                <div
                  key={n.id}
                  className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                    <span>{n.createdByName || 'User'}</span>
                    <span>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-bold text-red-400 uppercase"
                    onClick={() => update('notes', form.notes.filter((x) => x.id !== n.id))}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {(form.notes || []).length === 0 && (
                <p className="text-center text-xs text-slate-400 py-2">No notes yet — add one above.</p>
              )}
            </div>
          </div>
        )}

        {section === 'parts' && (
          <div className="space-y-3 max-w-4xl lg:max-w-none">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() =>
                  update('parts', [
                    emptyPart({
                      status: partStatuses[0] || 'Ordered',
                      location: partLocations[0] || 'Ordered (Not In Shop)',
                    }),
                    ...(form.parts || []),
                  ])
                }
                className="flex-1 app-card py-3.5 font-black text-xs uppercase flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Plus size={16} /> Add part
              </button>
              {scannerEnabled ? (
                <button
                  type="button"
                  onClick={openScanPicker}
                  disabled={isScanning}
                  className="flex-1 text-white py-3.5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50 shadow-md"
                  style={{ backgroundColor: primary }}
                >
                  {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  AI scan
                </button>
              ) : (
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-400 py-3.5 rounded-2xl font-bold text-[10px] uppercase flex items-center justify-center text-center px-2 border border-slate-200 dark:border-slate-700">
                  AI scan upgrade off
                </div>
              )}
            </div>

            {(form.parts || []).length > 0 && (
              <div className="app-card p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {selectedPartIds.length > 0
                      ? `${selectedPartIds.length} selected`
                      : 'Select parts to move together'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllParts}
                      className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      Select all
                    </button>
                    {selectedPartIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearPartSelection}
                        className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg text-slate-400"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                {selectedPartIds.length > 0 && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="lbl">Set location for selected</label>
                      <input
                        className="field text-sm font-bold"
                        list="part-location-suggestions"
                        placeholder="e.g. Cage A, Tech cart, Bay 3…"
                        value={bulkLocation}
                        onChange={(e) => setBulkLocation(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            applyBulkLocation();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={applyBulkLocation}
                      disabled={!bulkLocation.trim()}
                      className="shrink-0 py-3 px-4 rounded-xl text-white text-[11px] font-black uppercase disabled:opacity-40 shadow-md"
                      style={{ backgroundColor: primary }}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            )}

            <datalist id="part-location-suggestions">
              {partLocations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>

            {(form.parts || []).map((part) => {
              const isSelected = selectedPartIds.includes(part.id);
              return (
                <div
                  key={part.id}
                  className={`app-card p-4 ${
                    part.isReturning
                      ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20'
                      : isSelected
                        ? 'border-blue-400 dark:border-blue-600 ring-1 ring-blue-200 dark:ring-blue-900'
                        : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <label className="shrink-0 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePartSelected(part.id)}
                        className="h-5 w-5 rounded border-slate-300 accent-blue-600"
                        title="Select for bulk location"
                      />
                    </label>
                    <div className="flex-1 space-y-2.5 min-w-0">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="lbl">Description</label>
                          <input
                            className="field text-sm font-bold"
                            value={part.description || ''}
                            placeholder="Part name / description"
                            onChange={(e) => patchPart(part.id, { description: e.target.value })}
                          />
                        </div>
                        <div className="w-16">
                          <label className="lbl">Qty</label>
                          <input
                            type="number"
                            className="field text-sm font-bold text-center"
                            value={part.quantity || 1}
                            onChange={(e) => patchPart(part.id, { quantity: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="lbl">Part #</label>
                        <input
                          className="field text-xs font-mono font-bold"
                          value={part.partNumber || ''}
                          placeholder="PART-NUMBER"
                          onChange={(e) =>
                            patchPart(part.id, { partNumber: e.target.value.toUpperCase() })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="lbl">Order status</label>
                          <select
                            className="field text-[11px] font-bold py-2"
                            value={part.status || partStatuses[0]}
                            onChange={(e) => patchPart(part.id, { status: e.target.value })}
                          >
                            {partStatuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="lbl">Parts location</label>
                          <input
                            className="field text-[11px] font-bold"
                            list="part-location-suggestions"
                            value={part.location || ''}
                            placeholder="Type location…"
                            onChange={(e) => patchPart(part.id, { location: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
                        {!part.isReturning ? (
                          <button
                            type="button"
                            onClick={() =>
                              patchPart(part.id, {
                                isReturning: true,
                                returnReason: returnReasons[0] || '',
                              })
                            }
                            className="text-[10px] font-black px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                          >
                            Needs return
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                patchPart(part.id, { isReturning: false, returnReason: '' })
                              }
                              className="text-[10px] font-black px-3 py-1.5 rounded-full bg-emerald-600 text-white shadow-sm"
                            >
                              Mark returned
                            </button>
                            <select
                              className="field text-[10px] font-bold py-1.5 w-auto border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                              value={part.returnReason || returnReasons[0]}
                              onChange={(e) =>
                                patchPart(part.id, { returnReason: e.target.value })
                              }
                            >
                              {returnReasons.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPartIds((ids) => ids.filter((id) => id !== part.id));
                        update(
                          'parts',
                          form.parts.filter((p) => p.id !== part.id)
                        );
                      }}
                      className="text-slate-300 hover:text-red-500 self-start p-1 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}

            {(form.parts || []).length === 0 && (
              <div className="app-card text-center py-14 px-6">
                <Package className="mx-auto mb-3 text-slate-400 opacity-50" size={36} />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No parts yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tap Add part or scan an invoice to get started.
                </p>
              </div>
            )}
          </div>
        )}

        {section === 'photos' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-full py-4 rounded-2xl text-white font-black text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50 shadow-md active:scale-[0.99]"
              style={{ backgroundColor: primary }}
            >
              {uploadingPhoto ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
              Take / upload photo (JPG)
            </button>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPhoto}
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(form.photos || []).map((p) => (
                <div key={p.id} className="app-card overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => setLightbox(p)}
                    className="w-full block text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400"
                    title="View full size"
                  >
                    <img
                      src={p.url}
                      alt=""
                      className="w-full h-36 object-cover hover:opacity-95 transition-opacity"
                    />
                  </button>
                  <div className="p-2 flex justify-between items-center">
                    <span className="text-[9px] text-slate-400 font-bold truncate">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePhoto(p)}
                      className="text-red-400 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {(form.photos || []).length === 0 && (
              <div className="app-card text-center py-14 px-6">
                <ImageIcon className="mx-auto mb-3 text-slate-400 opacity-50" size={36} />
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No photos yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Capture damage, progress, or completed work.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Full size photo"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/90 bg-white/10 hover:bg-white/20 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider"
          >
            Close
          </button>
          <img
            src={lightbox.url}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-white/60 text-[11px] font-bold mt-3 uppercase tracking-wider">
            {lightbox.createdAt ? new Date(lightbox.createdAt).toLocaleString() : ''}
            {lightbox.createdByName ? ` · ${lightbox.createdByName}` : ''}
          </p>
          <p className="text-white/40 text-[10px] mt-1">Tap outside photo to close</p>
        </div>
      )}

      {/* Always mounted — file pickers must exist even on Info tab */}
      <input
        ref={scanFileRef}
        id="csm-scan-file"
        type="file"
        accept="image/*,.pdf,application/pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={handleScanDocument}
      />
      <input
        ref={scanCameraRef}
        id="csm-scan-camera"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={handleScanDocument}
      />

      {scanPickerOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 dark:bg-black/70 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose scan type"
          onClick={() => setScanPickerOpen(false)}
        >
          <div
            className="app-card w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                <Sparkles size={18} style={{ color: primary }} />
                AI scan
              </div>
              <button
                type="button"
                onClick={() => setScanPickerOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Pick a document type, then take a photo or choose a file from this device.
            </p>

            {Object.values(SCAN_MODES).map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-600 space-y-3"
              >
                <div>
                  <div className="font-black text-sm" style={{ color: primary }}>
                    {m.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {m.hint}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* Labels open the file dialog in the same user gesture — works on phones */}
                  <label
                    htmlFor="csm-scan-camera"
                    onPointerDown={() => armScanMode(m.id)}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl text-white text-[10px] font-black uppercase tracking-wide cursor-pointer active:scale-[0.98]"
                    style={{ backgroundColor: primary }}
                  >
                    <Camera size={18} />
                    Take photo
                  </label>
                  <label
                    htmlFor="csm-scan-file"
                    onPointerDown={() => armScanMode(m.id)}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase tracking-wide cursor-pointer active:scale-[0.98]"
                  >
                    <FileImage size={18} />
                    Choose file
                  </label>
                </div>
              </div>
            ))}

            {isScanning && (
              <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 py-2">
                <Loader2 className="animate-spin" size={18} />
                Scanning… this can take a few seconds
              </div>
            )}
          </div>
        </div>
      )}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 dark:bg-black/70 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Share job"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="app-card w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-black text-sm uppercase tracking-wide">
                <Share2 size={18} style={{ color: primary }} />
                Share job
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Sends a text summary (customer, RO, status, parts, notes) plus photo links. Opens your
              device email app — you send it from your own address.
            </p>

            <div>
              <label className="lbl">Email to (optional)</label>
              <input
                type="email"
                className="field"
                placeholder="customer@email.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="lbl">Preview</label>
              <textarea
                readOnly
                className="field text-[11px] font-mono min-h-[140px] leading-relaxed"
                value={summaryText}
              />
            </div>

            {shareMsg && (
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2">
                <Check size={14} /> {shareMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                className="py-3.5 rounded-xl border border-slate-200 dark:border-slate-600 font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Copy size={16} /> Copy
              </button>
              <button
                type="button"
                onClick={handleEmailShare}
                className="py-3.5 rounded-xl text-white font-black text-xs uppercase flex items-center justify-center gap-2 shadow-md active:scale-[0.99]"
                style={{ backgroundColor: primary }}
              >
                <Mail size={16} /> Email
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      {children}
    </div>
  );
}
