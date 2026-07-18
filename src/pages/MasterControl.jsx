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
} from '../lib/api';
import {
  defaultCompanySettings,
  DEFAULT_BRANDING,
  ROLES,
  PLANS,
  planById,
  countActiveSeats,
} from '../lib/constants';
import EditableList from '../components/EditableList';

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
      setMessage(
        `Created “${c.name}”. Upload logo and set locations, then share the invite code with shop staff.`
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
            {companies.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedId(c.id);
                  setMessage('');
                }}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center gap-3 transition-colors ${
                  selectedId === c.id ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                }`}
              >
                {c.branding?.logoUrl ? (
                  <img src={c.branding.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-black"
                    style={{
                      backgroundColor: c.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
                    }}
                  >
                    {(c.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{c.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {c.active === false ? 'Inactive' : 'Active'}
                    {c.features?.invoiceScanner ? ' · AI scan' : ''}
                  </div>
                </div>
              </button>
            ))}
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
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ShopEditor({ company, onSaved }) {
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
  const [active, setActive] = useState(company.active !== false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState([]);
  const [userBusyId, setUserBusyId] = useState(null);

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
        settings,
        features: {
          ...(company.features || {}),
          invoiceScanner,
          customerStatusEmails,
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

  const patchSettings = (key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
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

  return (
    <div className="space-y-4">
      {overSeats && (
        <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 text-sm">
          <b>Soft seat overage:</b> {activeSeats} active users, plan limit {seatLimit}. New seats
          stay allowed — bill later. Deactivate unused logins or raise the seat limit / plan.
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
              label="Customer status emails (upgrade)"
              on={customerStatusEmails}
              onToggle={() => setCustomerStatusEmails((v) => !v)}
            />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              When on: jobs with opt-in + email can get auto updates for statuses checked below.
              Sending is wired in a later step (noreply + Reply-To shop).
            </p>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="section-title mb-2">Email customer on these statuses</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
            Shop-picked list. Only these repair statuses trigger a customer email (when upgrade is
            on and the job has opt-in).
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
            <ToggleRow label="Shop active" on={active} onToggle={() => setActive((v) => !v)} />
            <ToggleRow
              label="AI invoice scanner (upgrade)"
              on={invoiceScanner}
              onToggle={() => setInvoiceScanner((v) => !v)}
              icon={<Sparkles size={14} />}
            />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <EditableList
          title="Vehicle locations"
          items={settings.vehicleLocations}
          onChange={(v) => patchSettings('vehicleLocations', v)}
          placeholder="e.g. North Lot"
        />
        <EditableList
          title="Parts locations"
          items={settings.partLocations}
          onChange={(v) => patchSettings('partLocations', v)}
          placeholder="e.g. Cage A"
        />
        <EditableList
          title="Repair statuses"
          items={settings.repairStatuses}
          onChange={(v) => patchSettings('repairStatuses', v)}
          placeholder="e.g. Waiting on Insurance"
        />
        <EditableList
          title="Part order statuses"
          items={settings.partStatuses}
          onChange={(v) => patchSettings('partStatuses', v)}
          placeholder="e.g. In Transit"
        />
        <EditableList
          title="Return reasons"
          items={settings.returnReasons}
          onChange={(v) => patchSettings('returnReasons', v)}
          placeholder="e.g. Wrong color"
        />
        <EditableList
          title="Technician names"
          items={settings.technicians}
          onChange={(v) => patchSettings('technicians', v)}
          placeholder="Tech name"
        />
      </div>

      <div className="app-card p-5">
        <h3 className="section-title mb-3">
          <Users size={14} /> Linked users ({users.length}) · seats {activeSeats}/{seatLimit}
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
          Assign a <b>Shop admin</b> (owner/manager) so they can invite techs and deactivate staff
          without you. Use <b>Deactivate</b> when someone leaves. <b>Remove from shop</b> unlinks
          their login from this company.
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
                          u.role === ROLES.SHOP_ADMIN ? ROLES.SHOP_ADMIN : ROLES.TECH
                        }
                        onChange={async (e) => {
                          const role = e.target.value;
                          setUserBusyId(u.id);
                          try {
                            await setUserRole(u.id, role);
                            onSaved(
                              role === ROLES.SHOP_ADMIN
                                ? `${u.displayName || u.email} is now shop admin.`
                                : `${u.displayName || u.email} is now a tech.`
                            );
                            reloadUsers();
                          } catch (err) {
                            onSaved(err.message || 'Could not change role');
                          } finally {
                            setUserBusyId(null);
                          }
                        }}
                        className="field text-[11px] font-bold py-1.5 w-auto min-w-[8.5rem]"
                      >
                        <option value={ROLES.TECH}>Tech</option>
                        <option value={ROLES.SHOP_ADMIN}>Shop admin</option>
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
