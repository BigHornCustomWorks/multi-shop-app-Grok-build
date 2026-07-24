/** Defaults from the old shop app + parts locations for day one */

export const DEFAULT_VEHICLE_LOCATIONS = [
  'Main Bay',
  'Paint Bay',
  'Wash Bay',
  'Out Back',
  'Horseshoe',
  'Storage Shed',
  'Eastside',
  'Out Front',
];

export const DEFAULT_REPAIR_STATUSES = [
  'Initial Teardown',
  'Waiting for Parts',
  'Being Repaired',
  'Painting',
  'Reassembling',
  'Final Inspection',
  'Customer Contacted',
];

export const DEFAULT_PART_STATUSES = [
  'Ordered',
  'Received',
  'Backordered',
  'Installed',
];

export const DEFAULT_PART_LOCATIONS = [
  'Parts Cage',
  'On Vehicle',
  'Receiving Shelf',
  'Return Shelf',
  'Ordered (Not In Shop)',
  'Vendor Hold',
  'Paint Shop',
  'Tech Cart',
];

export const DEFAULT_RETURN_REASONS = [
  'Wrong Part',
  'Damaged',
  'Defective',
  'Not Needed',
  'Duplicate Order',
  'Ordered in Error',
];

/** Defaults for dashboard status / location pills (editable per shop in Master Control) */
export const DEFAULT_BRANDING = {
  primaryColor: '#2563eb',
  logoUrl: '',
  /** Pale blue — repair status pills on dashboard */
  statusPillColor: '#bfdbfe',
  /** Pale green — vehicle location pills on dashboard */
  locationPillColor: '#bbf7d0',
};

/** Inline styles for colored pill selects */
export function pillStyle(bgHex) {
  const bg = bgHex || '#e2e8f0';
  return {
    backgroundColor: bg,
    borderColor: bg,
    color: '#0f172a',
  };
}

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  /** Shop owner / manager — assign only from Master Control */
  SHOP_ADMIN: 'shop_admin',
  PARTS_MANAGER: 'parts_manager',
  TECH: 'tech',
};

/** Human labels for roles (shop floor language) */
export function roleLabel(role) {
  switch (role) {
    case ROLES.PLATFORM_ADMIN:
      return 'Platform admin';
    case ROLES.SHOP_ADMIN:
      return 'Owner';
    case ROLES.PARTS_MANAGER:
      return 'Parts manager';
    case ROLES.TECH:
      return 'Tech';
    default:
      return role || 'Tech';
  }
}

/** Roles a shop Owner may assign (not Owner — only platform can set that) */
export const OWNER_ASSIGNABLE_ROLES = [ROLES.TECH, ROLES.PARTS_MANAGER];

export const PART_REQUEST_STATUSES = ['open', 'ordered', 'received', 'cancelled'];

export const PART_REQUEST_URGENCY = [
  { id: 'normal', label: 'Normal' },
  { id: 'urgent', label: 'Urgent' },
];

/** Seat tiers — soft limits (overage allowed, bill later) */
export const PLANS = [
  { id: 'starter', label: 'Starter', seatLimit: 5 },
  { id: 'shop', label: 'Shop', seatLimit: 15 },
  { id: 'pro', label: 'Pro', seatLimit: 30 },
  { id: 'enterprise', label: 'Enterprise', seatLimit: 100 },
];

export function planById(id) {
  return PLANS.find((p) => p.id === id) || PLANS[0];
}

export function defaultCompanySettings() {
  return {
    vehicleLocations: [...DEFAULT_VEHICLE_LOCATIONS],
    repairStatuses: [...DEFAULT_REPAIR_STATUSES],
    partStatuses: [...DEFAULT_PART_STATUSES],
    partLocations: [...DEFAULT_PART_LOCATIONS],
    returnReasons: [...DEFAULT_RETURN_REASONS],
    technicians: [],
    /**
     * Repair statuses that may trigger a customer SMS (when SMS feature is on
     * and the job has opt-in + a phone number).
     */
    notifyStatuses: [],
    /** Shop phone shown in customer texts (optional) */
    shopPhone: '',
  };
}

const LIST_SETTING_KEYS = [
  'vehicleLocations',
  'repairStatuses',
  'partStatuses',
  'partLocations',
  'returnReasons',
  'technicians',
  'notifyStatuses',
];

/**
 * Merge stored company.settings with defaults and force list fields to real arrays.
 * Prevents “Cannot read properties of undefined (reading 'length')” when a shop
 * doc is missing technicians / statuses / locations.
 */
export function normalizeCompanySettings(raw) {
  const base = defaultCompanySettings();
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...src };
  for (const key of LIST_SETTING_KEYS) {
    if (Array.isArray(out[key])) {
      out[key] = out[key]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean);
    } else {
      out[key] = Array.isArray(base[key]) ? [...base[key]] : [];
    }
  }
  out.shopPhone = String(out.shopPhone || '').trim();
  return out;
}

export function defaultCompanyFeatures() {
  return {
    invoiceScanner: false, // paid upgrade
    customerStatusEmails: false, // Twilio Emails API status updates
    customerStatusSms: false, // status texts via Twilio
  };
}

export function defaultCompanyBilling() {
  return {
    contactEmail: '',
    plan: 'starter',
    seatLimit: 5,
    billingStatus: 'manual', // manual | active | past_due | canceled
  };
}

/** Active linked users for soft seat limits */
export function countActiveSeats(users = []) {
  return users.filter((u) => u && u.active !== false).length;
}
