import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebase } from './firebase';
import { generateId, generateCode } from './ids';
import {
  defaultCompanySettings,
  defaultCompanyFeatures,
  defaultCompanyBilling,
  DEFAULT_BRANDING,
  ROLES,
  planById,
} from './constants';
import { MAX_IMAGE_BYTES, PLATFORM_ADMIN_EMAIL } from '../config';
import { compressPhotoFile, compressLogoFile } from './compressImage';

function db() {
  return getFirebase().db;
}

function storage() {
  return getFirebase().storage;
}

export function isPlatformAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === PLATFORM_ADMIN_EMAIL;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db(), 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function ensureUserProfile(user) {
  const refDoc = doc(db(), 'users', user.uid);
  const snap = await getDoc(refDoc);
  const email = (user.email || '').toLowerCase();
  const isPlatform = isPlatformAdminEmail(email);

  if (!snap.exists()) {
    const profile = {
      email,
      displayName: user.displayName || '',
      companyId: null,
      role: isPlatform ? ROLES.PLATFORM_ADMIN : null,
      jobFilter: 'all',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(refDoc, profile);
    return { id: user.uid, ...profile };
  }

  const data = snap.data();
  // Keep platform admin role if email matches (never auto-reactivate a disabled admin)
  if (isPlatform && data.role !== ROLES.PLATFORM_ADMIN) {
    await setDoc(
      refDoc,
      { role: ROLES.PLATFORM_ADMIN, email, updatedAt: Date.now() },
      { merge: true }
    );
    return { id: user.uid, ...data, role: ROLES.PLATFORM_ADMIN, email };
  }

  return { id: user.uid, ...data };
}

/** True unless explicitly deactivated (missing active = allowed). */
export function isUserAccountActive(profile) {
  if (!profile) return false;
  return profile.active !== false;
}

export function subscribeUserProfile(uid, callback, onError) {
  if (!uid) return () => {};
  return onSnapshot(
    doc(db(), 'users', uid),
    (snap) => {
      if (!snap.exists()) callback(null);
      else callback({ id: snap.id, ...snap.data() });
    },
    onError
  );
}

export async function listCompanyUsers(companyId) {
  const q = query(collection(db(), 'users'), where('companyId', '==', companyId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''))
    );
}

export async function setUserCompany({ uid, companyId, role, displayName, email }) {
  await setDoc(
    doc(db(), 'users', uid),
    {
      companyId,
      role,
      displayName: displayName || '',
      email: (email || '').toLowerCase(),
      active: true,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Deactivate or reactivate a staff account (platform admin only via rules).
 * Deactivated users cannot use the app or read/write shop data.
 */
export async function setUserActive(uid, active) {
  if (!uid) throw new Error('Missing user id');
  await setDoc(
    doc(db(), 'users', uid),
    {
      active: Boolean(active),
      deactivatedAt: active ? null : Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/** Unlink staff from a shop (they keep Auth login but no company access). */
export async function removeUserFromCompany(uid) {
  if (!uid) throw new Error('Missing user id');
  await setDoc(
    doc(db(), 'users', uid),
    {
      companyId: null,
      role: null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

/**
 * Set staff role (not platform_admin — that is email-based).
 */
export async function setUserRole(uid, role) {
  if (!uid) throw new Error('Missing user id');
  const allowed = [ROLES.TECH, ROLES.SHOP_ADMIN, ROLES.PARTS_MANAGER];
  if (!allowed.includes(role)) {
    throw new Error('Role must be tech, shop_admin, or parts_manager');
  }
  await setDoc(
    doc(db(), 'users', uid),
    { role, updatedAt: Date.now() },
    { merge: true }
  );
}

/**
 * Persist dashboard job filter for this user (survives sign-out / other devices).
 * Values: "all" | "unassigned" | tech name string
 */
export async function updateUserJobFilter(uid, jobFilter) {
  if (!uid) throw new Error('Not signed in');
  const value = jobFilter || 'all';
  await setDoc(
    doc(db(), 'users', uid),
    { jobFilter: value, updatedAt: Date.now() },
    { merge: true }
  );
  return value;
}

// ─── Companies ───────────────────────────────────────────────────────────────

export function subscribeCompanies(callback, onError) {
  return onSnapshot(
    collection(db(), 'companies'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      callback(list);
    },
    onError
  );
}

export function subscribeCompany(companyId, callback, onError) {
  return onSnapshot(
    doc(db(), 'companies', companyId),
    (snap) => {
      if (!snap.exists()) callback(null);
      else callback({ id: snap.id, ...snap.data() });
    },
    onError
  );
}

export async function createCompany({ name, primaryColor, contactEmail, plan }) {
  const id = generateId();
  const billing = defaultCompanyBilling();
  const planDef = planById(plan || billing.plan);
  const inviteCode = generateCode(6);
  const payload = {
    name: name.trim(),
    inviteCode,
    contactEmail: (contactEmail || '').trim().toLowerCase(),
    plan: planDef.id,
    seatLimit: planDef.seatLimit,
    billingStatus: billing.billingStatus,
    branding: {
      ...DEFAULT_BRANDING,
      primaryColor: primaryColor || DEFAULT_BRANDING.primaryColor,
      logoUrl: '',
    },
    settings: defaultCompanySettings(),
    features: defaultCompanyFeatures(),
    allowSelfServeSettings: false,
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await setDoc(doc(db(), 'companies', id), payload);
  // Direct lookup index so staff can join without a companies collection query
  await setDoc(doc(db(), 'inviteCodes', inviteCode), {
    companyId: id,
    createdAt: Date.now(),
  });
  return { id, ...payload };
}

export async function updateCompany(companyId, partial) {
  await setDoc(
    doc(db(), 'companies', companyId),
    { ...partial, updatedAt: Date.now() },
    { merge: true }
  );
}

/** Ensure inviteCodes/{CODE} points at this company (platform admin). */
export async function ensureInviteCodeIndex(company) {
  if (!company?.id || !company?.inviteCode) return;
  const code = String(company.inviteCode).trim().toUpperCase();
  await setDoc(
    doc(db(), 'inviteCodes', code),
    { companyId: company.id, updatedAt: Date.now() },
    { merge: true }
  );
}

export async function findCompanyByInviteCode(code) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  // 1) Preferred: direct document get (works with simple security rules)
  try {
    const invSnap = await getDoc(doc(db(), 'inviteCodes', normalized));
    if (invSnap.exists()) {
      const companyId = invSnap.data()?.companyId;
      if (companyId) {
        const companySnap = await getDoc(doc(db(), 'companies', companyId));
        if (companySnap.exists()) {
          return { id: companySnap.id, ...companySnap.data() };
        }
      }
    }
  } catch (e) {
    console.warn('inviteCodes lookup failed, trying companies query', e);
  }

  // 2) Fallback: query companies (needs list permission)
  const q = query(
    collection(db(), 'companies'),
    where('inviteCode', '==', normalized),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  // Best-effort: write index for next time (may fail if not platform admin — ignore)
  try {
    await setDoc(
      doc(db(), 'inviteCodes', normalized),
      { companyId: d.id, updatedAt: Date.now() },
      { merge: true }
    );
  } catch {
    /* ignore */
  }
  return { id: d.id, ...d.data() };
}

export async function uploadCompanyLogo(companyId, file) {
  if (!file) throw new Error('No file selected');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 5 MB');
  const compressed = await compressLogoFile(file);
  const ext = 'jpg';
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Use a JPG or PNG image');
  }

  const path = `companies/${companyId}/logo.${ext}`;
  const storageRef = ref(storage(), path);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  const logoUrl = await getDownloadURL(storageRef);

  const companySnap = await getDoc(doc(db(), 'companies', companyId));
  const existing = companySnap.exists() ? companySnap.data().branding || {} : {};
  await updateCompany(companyId, {
    branding: { ...existing, logoUrl, logoPath: path },
  });
  return logoUrl;
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export function subscribeJobs(companyId, callback, onError) {
  const q = query(
    collection(db(), 'companies', companyId, 'jobs'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
}

export async function saveJob(companyId, jobData) {
  const id = jobData.id || generateId();
  const payload = {
    ...jobData,
    id,
    companyId,
    updatedAt: Date.now(),
    createdAt: jobData.createdAt || Date.now(),
  };
  await setDoc(doc(db(), 'companies', companyId, 'jobs', id), payload, { merge: true });
  return payload;
}

export async function deleteJob(companyId, jobId) {
  await deleteDoc(doc(db(), 'companies', companyId, 'jobs', jobId));
}

export async function uploadJobPhoto(companyId, jobId, file, meta = {}) {
  if (!file) throw new Error('No file selected');
  if (file.size > MAX_IMAGE_BYTES * 4) {
    throw new Error('Image is too large (max ~20 MB before compress)');
  }

  const compressed = await compressPhotoFile(file);
  const photoId = generateId();
  const path = `companies/${companyId}/jobs/${jobId}/${photoId}.jpg`;
  const storageRef = ref(storage(), path);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);

  return {
    id: photoId,
    url,
    path,
    caption: meta.caption || '',
    createdAt: Date.now(),
    createdByName: meta.createdByName || '',
    createdByUid: meta.createdByUid || '',
    bytes: compressed.size || null,
  };
}

export async function deleteJobPhotoFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage(), path));
  } catch (e) {
    console.warn('Could not delete storage file', e);
  }
}

// ─── Part requests ───────────────────────────────────────────────────────────

export function subscribePartRequests(companyId, callback, onError) {
  const q = query(
    collection(db(), 'companies', companyId, 'partRequests'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
}

export function subscribeOpenPartRequestCount(companyId, callback, onError) {
  const q = query(
    collection(db(), 'companies', companyId, 'partRequests'),
    where('status', '==', 'open')
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.size),
    onError
  );
}

export async function createPartRequest(companyId, data) {
  const id = data.id || generateId();
  const payload = {
    id,
    companyId,
    jobId: data.jobId || '',
    jobCustomerName: data.jobCustomerName || '',
    jobVehicle: data.jobVehicle || '',
    jobRo: data.jobRo || '',
    description: (data.description || '').trim(),
    partNumber: (data.partNumber || '').trim().toUpperCase(),
    quantity: Number(data.quantity) || 1,
    urgency: data.urgency === 'urgent' ? 'urgent' : 'normal',
    note: (data.note || '').trim(),
    photos: Array.isArray(data.photos) ? data.photos : [],
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByUid: data.createdByUid || '',
    createdByName: data.createdByName || '',
    resolvedAt: null,
    resolvedByName: '',
  };
  if (!payload.description && !payload.photos.length) {
    throw new Error('Add a description or a photo for the request.');
  }
  await setDoc(doc(db(), 'companies', companyId, 'partRequests', id), payload);
  return payload;
}

export async function updatePartRequest(companyId, requestId, partial) {
  await setDoc(
    doc(db(), 'companies', companyId, 'partRequests', requestId),
    { ...partial, updatedAt: Date.now() },
    { merge: true }
  );
}

export async function uploadPartRequestPhoto(companyId, requestId, file, meta = {}) {
  if (!file) throw new Error('No file selected');
  const compressed = await compressPhotoFile(file);
  const photoId = generateId();
  const path = `companies/${companyId}/partRequests/${requestId}/${photoId}.jpg`;
  const storageRef = ref(storage(), path);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(storageRef);
  return {
    id: photoId,
    url,
    path,
    createdAt: Date.now(),
    createdByName: meta.createdByName || '',
    createdByUid: meta.createdByUid || '',
    bytes: compressed.size || null,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function emptyJob(defaults = {}) {
  return {
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    allowEmailUpdates: false,
    /** Customer opted in to status text messages (default off) */
    allowSmsUpdates: false,
    vehicle: '',
    /** Short damage summary shown on dashboard cards */
    damageSummary: '',
    roNumber: '',
    repairStatus: defaults.repairStatus || 'Initial Teardown',
    vehicleLocation: defaults.vehicleLocation || 'Main Bay',
    assignedTech: '',
    /** YYYY-MM-DD — used for “days at shop” on dashboard */
    arrivalDate: new Date().toISOString().split('T')[0],
    parts: [],
    notes: [],
    photos: [],
    /** Recent SMS attempts { id, at, status, to, ok, error, sid } */
    smsLog: [],
    /** Recent email attempts */
    emailLog: [],
    isArchived: false,
  };
}

/** Whole days since arrivalDate (local). null if no date. */
export function daysAtShop(arrivalDate) {
  if (!arrivalDate) return null;
  const start = new Date(`${arrivalDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12);
  const diff = Math.floor((today - startDay) / 86400000);
  return Math.max(0, diff);
}

export function formatDaysAtShop(arrivalDate) {
  const d = daysAtShop(arrivalDate);
  if (d == null) return null;
  if (d === 0) return 'Day 1';
  if (d === 1) return '1 day';
  return `${d} days`;
}

/**
 * Whether a status change should email the customer (reserved; SMS is live first).
 */
export function shouldNotifyCustomerOnStatus(job, company, newStatus) {
  if (!company?.features?.customerStatusEmails) return false;
  if (!job?.allowEmailUpdates) return false;
  const email = String(job.customerEmail || '').trim();
  if (!email || !email.includes('@')) return false;
  const list = company.settings?.notifyStatuses || [];
  if (!list.length) return false;
  return list.includes(newStatus);
}

/** Re-export SMS helper so callers can import from api if preferred */
export { shouldNotifyCustomerOnSms } from './sms';

export function emptyPart(defaults = {}) {
  return {
    id: generateId(),
    description: '',
    partNumber: '',
    quantity: 1,
    status: defaults.status || 'Ordered',
    location: defaults.location || 'Ordered (Not In Shop)',
    isReturning: false,
    returnReason: '',
  };
}

// re-export serverTimestamp if needed later
export { serverTimestamp };
