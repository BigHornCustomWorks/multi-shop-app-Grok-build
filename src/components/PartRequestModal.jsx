import React, { useRef, useState } from 'react';
import { Package, Camera, Loader2, X, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createPartRequest, uploadPartRequestPhoto } from '../lib/api';
import { generateId } from '../lib/ids';
import { DEFAULT_BRANDING } from '../lib/constants';

/**
 * Modal to request a part for a specific job (customer/vehicle/RO prefilled).
 */
export default function PartRequestModal({ job, onClose, onSent }) {
  const { company, user, profile } = useAuth();
  const primary = company?.branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const photoRef = useRef(null);

  const [desc, setDesc] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [qty, setQty] = useState(1);
  const [urgency, setUrgency] = useState('normal');
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!job) return null;

  const jobLabel = [job.customerName, job.vehicle, job.roNumber ? `RO ${job.roNumber}` : '']
    .filter(Boolean)
    .join(' · ');

  const submit = async () => {
    if (!company?.id || !job?.id) return;
    if (!desc.trim()) {
      setMsg('Describe what you need.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const requestId = generateId();
      let photos = [];
      if (photoFile) {
        const photo = await uploadPartRequestPhoto(company.id, requestId, photoFile, {
          createdByName: profile?.displayName || user?.email || '',
          createdByUid: user?.uid || '',
        });
        photos = [photo];
      }
      await createPartRequest(company.id, {
        id: requestId,
        jobId: job.id,
        jobCustomerName: job.customerName || '',
        jobVehicle: job.vehicle || '',
        jobRo: job.roNumber || '',
        description: desc,
        partNumber,
        quantity: qty,
        urgency,
        note,
        photos,
        createdByUid: user?.uid || '',
        createdByName: profile?.displayName || user?.email || '',
      });
      setMsg('Request sent to parts.');
      onSent?.();
      setTimeout(() => onClose?.(), 900);
    } catch (err) {
      setMsg(err.message || 'Could not send request');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 dark:bg-black/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Request a part"
      onClick={() => !busy && onClose?.()}
    >
      <div
        className="app-card w-full max-w-md p-5 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
            <Package size={18} style={{ color: primary }} />
            Request a part
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug">
          {jobLabel || 'Selected job'}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Goes to the parts inbox with this job already linked. Optional photo is compressed before
          upload.
        </p>

        <div>
          <label className="lbl">What do you need?</label>
          <input
            className="field text-sm font-bold"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. Left fog lamp assembly"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="lbl">Part # (optional)</label>
            <input
              className="field text-xs font-mono font-bold"
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              placeholder="OEM / vendor #"
            />
          </div>
          <div>
            <label className="lbl">Qty</label>
            <input
              type="number"
              min={1}
              className="field text-sm font-bold text-center"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="lbl">Urgency</label>
          <select
            className="field text-sm font-bold"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className="lbl">Notes for parts</label>
          <textarea
            className="field text-sm min-h-[64px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Color, side, vendor preference…"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-xs font-bold"
          >
            <Camera size={16} />
            {photoFile ? 'Change photo' : 'Add photo'}
          </button>
          {photoFile && (
            <span className="text-[11px] text-slate-500 truncate max-w-[12rem]">
              {photoFile.name}
            </span>
          )}
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
          />
        </div>
        {msg && (
          <p
            className={`text-xs font-bold flex items-center gap-1.5 ${
              /fail|error|could not|describe/i.test(msg)
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {/sent/i.test(msg) && <Check size={14} />}
            {msg}
          </p>
        )}
        <button
          type="button"
          disabled={busy || !desc.trim()}
          onClick={submit}
          className="w-full py-3.5 rounded-xl text-white text-xs font-black uppercase shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: primary }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
          Send part request
        </button>
      </div>
    </div>
  );
}
