import React, { useEffect, useState } from 'react';
import {
  Building2,
  LogOut,
  Plus,
  ArrowLeft,
  Loader2,
  Sparkles,
  Image as ImageIcon,
  Users,
  ToggleLeft,
  ToggleRight,
  Copy,
  Check,
  Moon,
  Sun,
  PauseCircle,
  PlayCircle,
  Trash2,
  AlertTriangle,
  Phone,
  PhoneOff,
} from 'lucide-react';
import { APP_NAME } from '../config';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  subscribeCompanies,
  createCompany,
  updateCompany,
  uploadCompanyLogo,
  listCompanyUsers,
  setUserActive,
  removeUserFromCompany,
  setUserRole,
  isUserAccountActive,
  ensureInviteCodeIndex,
  setCompanyActive,
  deleteCompany,
} from '../lib/api';
import {
  defaultCompanySettings,
  DEFAULT_BRANDING,
  ROLES,
  PLANS,
  planById,
  countActiveSeats,
  roleLabel,
} from '../lib/constants';
import EditableList from '../components/EditableList';
import { provisionTwilioNumber, releaseTwilioNumber } from '../lib/twilioClient';
import { TWILIO_A2P_STATUSES, companyCanSendSms } from '../lib/twilioShop';

export default function MasterControl() {
  const { logout, user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    return subscribeCompanies(
      (list) => {
        setCompanies(list);
        // Index invite codes so staff join works (once per load, platform admin)
        list.forEach((c) => {
          ensureInviteCodeIndex(c).catch((e) =>
            console.warn('Could not index invite code for', c?.name, e)
          );
        });
      },
      (err) => console.error(err)
    );
  }, []);

  const selected = companies.find((c) => c.id === selectedId) || null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const c = await createCompany({ name: newName.trim() });
      setNewName('');
      setCreating(false);
      setSelectedId(c.id);
      // Auto-provision a local Twilio number (shop kept if this fails)
      let provisionNote = '';
      try {
        const prov = await provisionTwilioNumber({
          companyId: c.id,
          action: 'purchase',
        });
        provisionNote = prov.phoneNumber
          ? ` Twilio number ${prov.phoneNumber} provisioned — set A2P to Registered when campaign is approved.`
          : ' Twilio provision ran.';
      } catch (provErr) {
        provisionNote = ` Twilio number not ready yet (${provErr.message || 'provision failed'}). Retry or assign manually below.`;
      }
      setMessage(
        `Created “${c.name}”. Upload logo and set locations, then share the invite code with shop staff.${provisionNote}`
      );
    } catch (err) {
      setMessage(err.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-black text-white border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Master Control · You only
            </div>
            <h1 className="font-black text-lg truncate">{APP_NAME}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="text-[10px] text-slate-400 hidden sm:inline truncate max-w-[160px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid lg:grid-cols-[280px_1fr] gap-4">
        <aside className="app-card overflow-hidden h-fit">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Shops
            </h2>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              title="Add shop"
            >
              <Plus size={16} />
            </button>
          </div>

          {creating && (
            <form
              onSubmit={handleCreate}
              className="p-3 border-b border-slate-200 dark:border-slate-700 space-y-2 bg-slate-50 dark:bg-slate-800/50"
            >
              <input
                autoFocus
                className="field text-sm"
                placeholder="Shop name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-xs font-bold uppercase"
                >
                  {busy ? '…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="max-h-[70vh] overflow-y-auto">
            {companies.length === 0 && (
              <p className="p-4 text-sm text-slate-400">No shops yet. Create your first customer shop.</p>
            )}
            {companies.map((c) => {
              const isPaused = c.active === false;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setMessage('');
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center gap-3 transition-colors ${
                    selectedId === c.id ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                  } ${isPaused ? 'opacity-75' : ''}`}
                >
                  {c.branding?.logoUrl ? (
                    <img
                      src={c.branding.logoUrl}
                      alt=""
                      className={`h-9 w-9 rounded-lg object-cover ${isPaused ? 'grayscale' : ''}`}
                    />
                  ) : (
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-black"
                      style={{
                        backgroundColor: isPaused
                          ? '#94a3b8'
                          : c.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
                      }}
                    >
                      {(c.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{c.name}</div>
                    <div
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isPaused ? 'Paused' : 'Active'}
                      {c.features?.invoiceScanner ? ' · AI' : ''}
                      {c.features?.customerStatusSms ? ' · SMS' : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main>
          {message && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 rounded-2xl text-sm border border-blue-100 dark:border-blue-900">
              {message}
            </div>
          )}

          {!selected ? (
            <div className="app-card p-12 text-center text-slate-400">
              <Building2 className="mx-auto mb-3 opacity-30" size={40} />
              <p className="font-medium text-slate-600 dark:text-slate-300">Select a shop or create one</p>
              <p className="text-sm mt-1">Customize logo, locations, statuses, and upgrades here.</p>
            </div>
          ) : (
            <ShopEditor
              key={selected.id}
              company={selected}
              onSaved={(msg) => setMessage(msg || 'Saved')}
              onDeleted={() => {
                setSelectedId(null);
                setMessage('Shop removed from the list.');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ShopEditor({ company, onSaved, onDeleted }) {
  const [name, setName] = useState(company.name || '');
  const [primaryColor, setPrimaryColor] = useState(
    company.branding?.primaryColor || DEFAULT_BRANDING.primaryColor
  );
  const [statusPillColor, setStatusPillColor] = useState(
    company.branding?.statusPillColor || DEFAULT_BRANDING.statusPillColor
  );
  const [locationPillColor, setLocationPillColor] = useState(
    company.branding?.locationPillColor || DEFAULT_BRANDING.locationPillColor
  );
  const [settings, setSettings] = useState(() => ({
    ...defaultCompanySettings(),
    ...(company.settings || {}),
    notifyStatuses: company.settings?.notifyStatuses || [],
  }));
  const [contactEmail, setContactEmail] = useState(company.contactEmail || '');
  const [plan, setPlan] = useState(company.plan || 'starter');
  const [seatLimit, setSeatLimit] = useState(
    company.seatLimit ?? planById(company.plan || 'starter').seatLimit
  );
  const [invoiceScanner, setInvoiceScanner] = useState(Boolean(company.features?.invoiceScanner));
  const [customerStatusEmails, setCustomerStatusEmails] = useState(
    Boolean(company.features?.customerStatusEmails)
  );
  const [customerStatusSms, setCustomerStatusSms] = useState(
    Boolean(company.features?.customerStatusSms)
  );
  const [shopPhone, setShopPhone] = useState(
    company.settings?.shopPhone || company.contactPhone || ''
  );
  const [active, setActive] = useState(company.active !== false);
  const [busy, setBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState([]);
  const [userBusyId, setUserBusyId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [twilioBusy, setTwilioBusy] = useState(false);
  const [manualNumber, setManualNumber] = useState('');
  const [manualSid, setManualSid] = useState('');
  const [areaCodePref, setAreaCodePref] = useState('');
  const [a2pStatus, setA2pStatus] = useState(company.twilioA2pStatus || 'none');

  // Keep A2P local state in sync when company snapshot updates after provision
  useEffect(() => {
    setA2pStatus(company.twilioA2pStatus || 'none');
  }, [company.id, company.twilioA2pStatus]);

  const reloadUsers = () => {
    listCompanyUsers(company.id).then(setUsers).catch(console.error);
  };

  useEffect(() => {
    reloadUsers();
  }, [company.id]);

  const activeSeats = countActiveSeats(users);
  const overSeats = activeSeats > Number(seatLimit || 0);

  const save = async () => {
    setBusy(true);
    try {
      await updateCompany(company.id, {
        name: name.trim() || company.name,
        contactEmail: contactEmail.trim().toLowerCase(),
        plan,
        seatLimit: Number(seatLimit) || planById(plan).seatLimit,
        branding: {
          ...(company.branding || {}),
          primaryColor,
          statusPillColor,
          locationPillColor,
        },
        settings: {
          ...settings,
          shopPhone: shopPhone.trim(),
        },
        contactPhone: shopPhone.trim(),
        features: {
          ...(company.features || {}),
          invoiceScanner,
          customerStatusEmails,
          customerStatusSms,
        },
        active,
        allowSelfServeSettings: false,
      });
      onSaved(`Saved “${name.trim() || company.name}”.`);
    } catch (err) {
      onSaved(err.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadCompanyLogo(company.id, file);
      onSaved('Logo uploaded.');
    } catch (err) {
      onSaved(err.message || 'Logo upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(company.inviteCode || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const [listBusy, setListBusy] = useState(false);

  /** Update local settings; for list fields, also save immediately (drag order). */
  const patchSettings = async (key, value) => {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);

    const listKeys = [
      'vehicleLocations',
      'partLocations',
      'repairStatuses',
      'partStatuses',
      'returnReasons',
      'technicians',
    ];
    if (!listKeys.includes(key) || !company?.id) return;

    setListBusy(true);
    try {
      await updateCompany(company.id, {
        settings: {
          ...(company.settings || {}),
          ...nextSettings,
          shopPhone: shopPhone.trim(),
        },
      });
      onSaved('List order saved (top of list = first in dropdowns).');
    } catch (err) {
      onSaved(err.message || 'Could not save list');
      setSettings({
        ...defaultCompanySettings(),
        ...(company.settings || {}),
        notifyStatuses: company.settings?.notifyStatuses || [],
      });
    } finally {
      setListBusy(false);
    }
  };

  const toggleNotifyStatus = (status) => {
    setSettings((s) => {
      const list = s.notifyStatuses || [];
      const next = list.includes(status)
        ? list.filter((x) => x !== status)
        : [...list, status];
      return { ...s, notifyStatuses: next };
    });
  };

  const pauseOrResume = async () => {
    const next = !active;
    const label = next ? 'resume' : 'pause';
    if (
      !window.confirm(
        next
          ? `Resume “${company.name}”? Staff will be able to sign in and use the app again.`
          : `Pause “${company.name}”? Staff will see “Shop inactive” and cannot use the app until you resume (e.g. non-payment).`
      )
    ) {
      return;
    }
    setAccessBusy(true);
    try {
      await setCompanyActive(company.id, next);
      setActive(next);
      onSaved(next ? `Shop resumed — staff can use the app.` : `Shop paused — access blocked.`);
    } catch (err) {
      onSaved(err.message || `Could not ${label} shop`);
    } finally {
      setAccessBusy(false);
    }
  };

  const handleDeleteShop = async () => {
    if (deleteConfirm.trim() !== (company.name || '').trim()) {
      onSaved('Type the exact shop name to confirm delete.');
      return;
    }
    if (
      !window.confirm(
        `Permanently delete “${company.name}” from Master Control?\n\n• Twilio SMS number will be released (stops billing)\n• Staff will be unlinked\n• Invite code removed\n• Shop disappears from this list\n\nThis cannot be undone from the app.`
      )
    ) {
      return;
    }
    setAccessBusy(true);
    try {
      const result = await deleteCompany(company.id, company.inviteCode);
      const released = result.release?.releasedNumber
        ? ` Number ${result.release.releasedNumber} released.`
        : '';
      onSaved(
        `Deleted “${company.name}” (${result.unlinkedUsers} user${
          result.unlinkedUsers === 1 ? '' : 's'
        } unlinked).${released}`
      );
      onDeleted?.();
    } catch (err) {
      onSaved(err.message || 'Could not delete shop');
    } finally {
      setAccessBusy(false);
    }
  };

  const runProvision = async (action) => {
    setTwilioBusy(true);
    try {
      const result = await provisionTwilioNumber({
        companyId: company.id,
        action,
        areaCode: areaCodePref || undefined,
        phoneNumber: action === 'assign' ? manualNumber : undefined,
        phoneSid: action === 'assign' ? manualSid || undefined : undefined,
      });
      if (action === 'assign') {
        setManualNumber('');
        setManualSid('');
      }
      onSaved(
        action === 'migrate'
          ? `Migrated env number ${result.phoneNumber} onto this shop. Mark A2P Registered when ready.`
          : action === 'assign'
            ? `Assigned ${result.phoneNumber} to this shop.`
            : `Provisioned ${result.phoneNumber}. Mark A2P Registered after 10DLC approval.`
      );
    } catch (err) {
      onSaved(err.message || 'Twilio action failed');
    } finally {
      setTwilioBusy(false);
    }
  };

  const runReleaseNumber = async () => {
    if (
      !window.confirm(
        `Release Twilio number ${company.twilioSmsNumber || '(unknown)'} for “${company.name}”?\n\nThe number will be removed from Twilio (stops monthly charge) and cleared on this shop. You can provision a new one later.`
      )
    ) {
      return;
    }
    setTwilioBusy(true);
    try {
      const result = await releaseTwilioNumber({ companyId: company.id });
      onSaved(
        result.skipped
          ? 'No number to release.'
          : `Released ${result.releasedNumber || 'number'}. Status set to released.`
      );
    } catch (err) {
      onSaved(err.message || 'Release failed');
    } finally {
      setTwilioBusy(false);
    }
  };

  const saveA2pStatus = async (next) => {
    setA2pStatus(next);
    setTwilioBusy(true);
    try {
      await updateCompany(company.id, { twilioA2pStatus: next });
      onSaved(`A2P status set to “${next}”.`);
    } catch (err) {
      onSaved(err.message || 'Could not update A2P status');
      setA2pStatus(company.twilioA2pStatus || 'none');
    } finally {
      setTwilioBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {overSeats && (
        <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 text-sm">
          <b>Soft seat overage:</b> {activeSeats} active users, plan limit {seatLimit}. New seats
          stay allowed — bill later. Deactivate unused logins or raise the seat limit / plan.
        </div>
      )}

      {!active && (
        <div className="p-3 rounded-xl border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 text-xs font-bold">
          This shop is paused — staff cannot use the app. Scroll to Shop access below Save to resume.
        </div>
      )}

      <div className="app-card p-5">
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {company.branding?.logoUrl ? (
              <img
                src={company.branding.logoUrl}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-600"
              />
            ) : (
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                {(name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <input
                className="text-xl font-black outline-none border-b border-transparent focus:border-slate-300 dark:focus:border-slate-600 w-full bg-transparent"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Invite code</span>
                <code className="font-mono font-black tracking-widest text-sm bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                  {company.inviteCode}
                </code>
                <button type="button" onClick={copyCode} className="p-1 text-blue-600 dark:text-blue-400">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-bold transition-colors">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
            Upload logo (JPG/PNG)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={onLogo}
            />
          </label>
        </div>

        {/* Billing / seats / shop email */}
        <div className="grid sm:grid-cols-2 gap-4 mt-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40">
          <div className="sm:col-span-2">
            <div className="section-title mb-2">Shop contact & plan</div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
              Shop email is used for billing notices and as <b>Reply-To</b> on customer status emails
              (sent from noreply@ your product domain later). Seats are a soft limit.
            </p>
          </div>
          <div>
            <label className="lbl">Shop email (billing & replies)</label>
            <input
              type="email"
              className="field"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="owner@bodyshop.com"
            />
          </div>
          <div>
            <label className="lbl">Plan</label>
            <select
              className="field font-bold"
              value={plan}
              onChange={(e) => {
                const id = e.target.value;
                setPlan(id);
                setSeatLimit(planById(id).seatLimit);
              }}
            >
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.seatLimit} seats)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Seat limit (soft)</label>
            <input
              type="number"
              min={1}
              className="field font-bold"
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Active users now: <b>{activeSeats}</b>
              {overSeats ? ' — over limit (allowed)' : ''}
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <ToggleRow
              label="Customer status texts (SMS)"
              on={customerStatusSms}
              onToggle={() => setCustomerStatusSms((v) => !v)}
            />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Each shop sends from its own Twilio number (see Twilio SMS number section). Message
              still says “call [shop] at shop phone.” Outbound requires A2P = Registered. Platform
              Twilio SID/token stay in Vercel env.
            </p>
            <ToggleRow
              label="Customer status emails (Twilio)"
              on={customerStatusEmails}
              onToggle={() => setCustomerStatusEmails((v) => !v)}
            />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              From display name = shop name; Reply-To = shop email (replies go to the shop). Needs{' '}
              <b>TWILIO_EMAIL_FROM</b> verified on your platform domain + shop email set below.
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
          <div>
            <label className="lbl">Shop phone (required for good status texts)</label>
            <input
              type="tel"
              className="field font-bold"
              value={shopPhone}
              onChange={(e) => setShopPhone(e.target.value)}
              placeholder="(555) 555-5555"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Business “call us” line in every status text/email — not the Twilio sender. Prefer
              local area code matching this number when provisioning.
            </p>
          </div>

          {/* Per-shop Twilio number (multi-tenant) */}
          <div className="p-4 rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/20 space-y-3">
            <div className="flex items-start gap-2">
              <Phone size={16} className="text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="section-title mb-1 text-violet-900 dark:text-violet-200">
                  Twilio SMS number (this shop only)
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Outbound From number for this shop. No shared env fallback — missing number is a
                  hard error. A2P must be <b>registered</b> before sends work. Inbound reverse index
                  is written now; two-way webhook is Phase D.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Number</div>
                <code className="font-mono font-bold text-sm">
                  {company.twilioSmsNumber || '— none —'}
                </code>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Status</div>
                <span
                  className={`inline-block text-[11px] font-black uppercase px-2 py-0.5 rounded-full ${
                    company.twilioNumberStatus === 'active'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                      : company.twilioNumberStatus === 'failed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                        : company.twilioNumberStatus === 'released'
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                  }`}
                >
                  {company.twilioNumberStatus || 'none'}
                </span>
              </div>
              {company.twilioPhoneSid ? (
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Phone SID</div>
                  <code className="text-[10px] font-mono break-all text-slate-500">
                    {company.twilioPhoneSid}
                  </code>
                </div>
              ) : null}
              {company.twilioNumberError ? (
                <div className="sm:col-span-2 text-xs text-red-700 dark:text-red-300">
                  {company.twilioNumberError}
                </div>
              ) : null}
            </div>

            {(() => {
              const gate = companyCanSendSms(company);
              return (
                <p
                  className={`text-[11px] font-medium ${
                    gate.ok
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-800 dark:text-amber-200'
                  }`}
                >
                  {gate.ok
                    ? `Ready to send from ${gate.from}`
                    : `Cannot send yet: ${gate.reason}`}
                </p>
              );
            })()}

            <div>
              <label className="lbl">A2P 10DLC status (manual for now)</label>
              <select
                className="field font-bold"
                value={a2pStatus}
                disabled={twilioBusy}
                onChange={(e) => saveA2pStatus(e.target.value)}
              >
                {TWILIO_A2P_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Register brand/campaign in Twilio Console, then set <b>registered</b> here. Campaign
                automation can come later if volume justifies it.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <div className="w-24">
                <label className="lbl">Area code</label>
                <input
                  className="field text-sm font-mono"
                  value={areaCodePref}
                  onChange={(e) => setAreaCodePref(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="307"
                  maxLength={3}
                />
              </div>
              <button
                type="button"
                disabled={twilioBusy || company.twilioNumberStatus === 'active'}
                onClick={() => runProvision('purchase')}
                className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold uppercase disabled:opacity-50"
              >
                {twilioBusy ? '…' : company.twilioNumberStatus === 'failed' ? 'Retry provision' : 'Provision number'}
              </button>
              <button
                type="button"
                disabled={twilioBusy}
                onClick={() => runProvision('migrate')}
                className="px-3 py-2 rounded-xl bg-slate-700 text-white text-xs font-bold uppercase disabled:opacity-50"
                title="One-time: link TWILIO_FROM_NUMBER env to this shop"
              >
                Migrate env number
              </button>
              {(company.twilioSmsNumber || company.twilioPhoneSid) && (
                <button
                  type="button"
                  disabled={twilioBusy}
                  onClick={runReleaseNumber}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-bold uppercase disabled:opacity-50"
                >
                  <PhoneOff size={14} />
                  Release number
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-violet-200 dark:border-violet-900 space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                Manual assign (number already in Twilio)
              </div>
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className="field text-sm font-mono"
                  placeholder="+15551234567"
                  value={manualNumber}
                  onChange={(e) => setManualNumber(e.target.value)}
                />
                <input
                  className="field text-sm font-mono"
                  placeholder="PNxxxx (optional SID)"
                  value={manualSid}
                  onChange={(e) => setManualSid(e.target.value)}
                />
                <button
                  type="button"
                  disabled={twilioBusy || !manualNumber.trim()}
                  onClick={() => runProvision('assign')}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs font-bold uppercase disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>

          <div className="section-title mb-2">Notify customer on these statuses</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
            Auto text and/or email when status matches (and the job has opt-in + contact info + the
            channel is on). Use sparingly — e.g. Waiting for Parts, Customer Contacted.
          </p>
          <div className="flex flex-wrap gap-2">
            {(settings.repairStatuses || []).map((s) => {
              const on = (settings.notifyStatuses || []).includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleNotifyStatus(s)}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors ${
                    on
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {s}
                </button>
              );
            })}
          </div>
          {(settings.repairStatuses || []).length === 0 && (
            <p className="text-xs text-slate-400">Add repair statuses below first.</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <div className="space-y-4">
            <div>
              <label className="lbl">Brand color (buttons / accents)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-11 w-14 rounded-lg border border-slate-200 dark:border-slate-600"
                />
                <input
                  className="field flex-1 font-mono text-xs"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="lbl">Status pill color (dashboard)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={statusPillColor}
                  onChange={(e) => setStatusPillColor(e.target.value)}
                  className="h-11 w-14 rounded-lg border border-slate-200 dark:border-slate-600"
                />
                <input
                  className="field flex-1 font-mono text-xs"
                  value={statusPillColor}
                  onChange={(e) => setStatusPillColor(e.target.value)}
                />
              </div>
              <span
                className="inline-block mt-2 text-[11px] font-bold px-3 py-1.5 rounded-full border-2 text-slate-900"
                style={{ backgroundColor: statusPillColor, borderColor: statusPillColor }}
              >
                Status preview
              </span>
            </div>
            <div>
              <label className="lbl">Location pill color (dashboard)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={locationPillColor}
                  onChange={(e) => setLocationPillColor(e.target.value)}
                  className="h-11 w-14 rounded-lg border border-slate-200 dark:border-slate-600"
                />
                <input
                  className="field flex-1 font-mono text-xs"
                  value={locationPillColor}
                  onChange={(e) => setLocationPillColor(e.target.value)}
                />
              </div>
              <span
                className="inline-block mt-2 text-[11px] font-bold px-3 py-1.5 rounded-full border-2 text-slate-900"
                style={{ backgroundColor: locationPillColor, borderColor: locationPillColor }}
              >
                Location preview
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Pause / resume is under <b>Shop access</b> at the top (saves immediately). The toggle
              below is kept in sync when you pause or save settings.
            </p>
            <ToggleRow
              label="Shop active (also in Shop access)"
              on={active}
              onToggle={() => setActive((v) => !v)}
            />
            <ToggleRow
              label="AI invoice scanner (upgrade)"
              on={invoiceScanner}
              onToggle={() => setInvoiceScanner((v) => !v)}
              icon={<Sparkles size={14} />}
            />
          </div>
        </div>
      </div>

      <div className="app-card p-5 space-y-3">
        <h3 className="section-title mb-0">Dropdown lists & order</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Same control as the shop Owner Settings. Expand a list, then drag the <b>⋮⋮</b> handle
          next to delete to set workflow order — <b>top of the list = first in dropdowns</b> on jobs.
          Reorder / add / remove saves automatically (you do not need “Save shop settings” for these
          lists).
        </p>
        <div
          className={`grid md:grid-cols-2 gap-3 ${listBusy ? 'opacity-70 pointer-events-none' : ''}`}
        >
          <EditableList
            title="Vehicle locations"
            items={settings.vehicleLocations}
            onChange={(v) => patchSettings('vehicleLocations', v)}
            placeholder="e.g. North Lot"
            defaultOpen={false}
          />
          <EditableList
            title="Parts locations"
            items={settings.partLocations}
            onChange={(v) => patchSettings('partLocations', v)}
            placeholder="e.g. Cage A"
            defaultOpen={false}
          />
          <EditableList
            title="Repair statuses"
            items={settings.repairStatuses}
            onChange={(v) => patchSettings('repairStatuses', v)}
            placeholder="e.g. Waiting on Insurance"
            defaultOpen={false}
          />
          <EditableList
            title="Part order statuses"
            items={settings.partStatuses}
            onChange={(v) => patchSettings('partStatuses', v)}
            placeholder="e.g. In Transit"
            defaultOpen={false}
          />
          <EditableList
            title="Return reasons"
            items={settings.returnReasons}
            onChange={(v) => patchSettings('returnReasons', v)}
            placeholder="e.g. Wrong color"
            defaultOpen={false}
          />
          <div className="md:col-span-2 space-y-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed px-1">
              <b>Job assignment techs:</b> active team members with the Tech role appear automatically.
              Use the list below only for people who will not use the app (also drag to order).
            </p>
            <EditableList
              title="Extra tech names (not app users)"
              items={settings.technicians}
              onChange={(v) => patchSettings('technicians', v)}
              placeholder="Tech name as shown on jobs"
              defaultOpen={false}
            />
          </div>
        </div>
      </div>

      <div className="app-card p-5">
        <h3 className="section-title mb-3">
          <Users size={14} /> Linked users ({users.length}) · seats {activeSeats}/{seatLimit}
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
          Assign one <b>Owner</b> (billing contact / manager) so they can invite staff, set Tech or
          Parts roles, and deactivate people from the shop Settings menu. Only you can appoint or
          change Owners. Use <b>Deactivate</b> / <b>Remove</b> as needed.
        </p>
        {users.length === 0 ? (
          <p className="text-sm text-slate-400">
            No users linked yet. Staff sign up in the app and join with this shop’s invite code.
          </p>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => {
              const accountOn = isUserAccountActive(u);
              const busy = userBusyId === u.id;
              return (
                <li
                  key={u.id}
                  className={`p-3 rounded-xl text-sm border space-y-2 ${
                    accountOn
                      ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700'
                      : 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                  }`}
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{u.displayName || u.email}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {u.email}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">
                        {u.role || 'staff'}
                      </span>
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          accountOn
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                        }`}
                      >
                        {accountOn ? 'Active' : 'Deactivated'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                      Role
                      <select
                        disabled={busy || u.role === ROLES.PLATFORM_ADMIN}
                        value={
                          u.role === ROLES.SHOP_ADMIN
                            ? ROLES.SHOP_ADMIN
                            : u.role === ROLES.PARTS_MANAGER
                              ? ROLES.PARTS_MANAGER
                              : ROLES.TECH
                        }
                        onChange={async (e) => {
                          const role = e.target.value;
                          setUserBusyId(u.id);
                          try {
                            await setUserRole(u.id, role, { allowOwner: true });
                            onSaved(
                              `${u.displayName || u.email} is now ${roleLabel(role)}.`
                            );
                            reloadUsers();
                          } catch (err) {
                            onSaved(err.message || 'Could not change role');
                          } finally {
                            setUserBusyId(null);
                          }
                        }}
                        className="field text-[11px] font-bold py-1.5 w-auto min-w-[9.5rem]"
                      >
                        <option value={ROLES.TECH}>Tech</option>
                        <option value={ROLES.PARTS_MANAGER}>Parts manager</option>
                        <option value={ROLES.SHOP_ADMIN}>Owner (shop manager)</option>
                      </select>
                    </label>
                    {accountOn ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !confirm(
                              `Deactivate ${u.displayName || u.email}? They will lose access to this shop’s jobs and data immediately.`
                            )
                          ) {
                            return;
                          }
                          setUserBusyId(u.id);
                          try {
                            await setUserActive(u.id, false);
                            onSaved(`Deactivated ${u.displayName || u.email}.`);
                            reloadUsers();
                          } catch (err) {
                            onSaved(err.message || 'Could not deactivate user');
                          } finally {
                            setUserBusyId(null);
                          }
                        }}
                        className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-50"
                      >
                        {busy ? '…' : 'Deactivate'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setUserBusyId(u.id);
                          try {
                            await setUserActive(u.id, true);
                            onSaved(`Reactivated ${u.displayName || u.email}.`);
                            reloadUsers();
                          } catch (err) {
                            onSaved(err.message || 'Could not reactivate user');
                          } finally {
                            setUserBusyId(null);
                          }
                        }}
                        className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
                      >
                        {busy ? '…' : 'Reactivate'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !confirm(
                            `Remove ${u.displayName || u.email} from this shop? They can join again later with an invite code if their account is active.`
                          )
                        ) {
                          return;
                        }
                        setUserBusyId(u.id);
                        try {
                          await removeUserFromCompany(u.id);
                          onSaved(`Removed ${u.displayName || u.email} from shop.`);
                          reloadUsers();
                        } catch (err) {
                          onSaved(err.message || 'Could not remove user');
                        } finally {
                          setUserBusyId(null);
                        }
                      }}
                      className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
                    >
                      Remove from shop
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="w-full py-4 rounded-2xl text-white font-black uppercase tracking-widest shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
        style={{ backgroundColor: primaryColor }}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        Save shop settings
      </button>

      <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
        <ArrowLeft size={10} /> Shops cannot edit these lists — only Master Control can.
      </p>

      {/* Access control — pause / delete (below save) */}
      <div
        className={`app-card p-5 border-2 ${
          active
            ? 'border-slate-200 dark:border-slate-700'
            : 'border-amber-400 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
        }`}
      >
        <h3 className="section-title mb-2">
          <AlertTriangle size={14} /> Shop access
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
          <b>Pause</b> when they stop paying — staff cannot open the shop app until you resume.{' '}
          <b>Delete</b> releases the shop’s Twilio number (stops billing), unlinks staff, and removes
          the shop from this list.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span
            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              active
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700'
            }`}
          >
            {active ? 'Live — staff can use app' : 'Paused — access blocked'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={accessBusy}
            onClick={pauseOrResume}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase shadow-sm disabled:opacity-50 ${
              active
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {accessBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : active ? (
              <PauseCircle size={16} />
            ) : (
              <PlayCircle size={16} />
            )}
            {active ? 'Pause shop' : 'Resume shop'}
          </button>
        </div>
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <div className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 tracking-wide">
            Danger zone — delete shop
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Type the shop name exactly to enable delete: <b>{company.name}</b>
          </p>
          <input
            className="field text-sm font-bold"
            placeholder="Type shop name to confirm"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            disabled={accessBusy}
            autoComplete="off"
          />
          <button
            type="button"
            disabled={
              accessBusy || deleteConfirm.trim() !== (company.name || '').trim()
            }
            onClick={handleDeleteShop}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase border-2 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-40"
          >
            {accessBusy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete shop permanently
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, on, onToggle, icon }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
    >
      <span className="text-sm font-bold flex items-center gap-2">
        {icon}
        {label}
      </span>
      {on ? (
        <ToggleRight className="text-green-600 dark:text-green-400" size={28} />
      ) : (
        <ToggleLeft className="text-slate-300 dark:text-slate-600" size={28} />
      )}
    </button>
  );
}
