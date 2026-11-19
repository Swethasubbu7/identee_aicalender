// Nauticrew roles and permissions (Phase 2 foundation, approved roadmap §2).
//
// Staff accounts hold at most one role per module:
//   roles = { platform: "SUPER_ADMIN" | null,
//             shop:     "ECOM_ADMIN" | "SALES" | "INVENTORY" | "ACCOUNTS" | null,
//             calendar: "CAL_ADMIN" | "CAL_MANAGER" | "DESIGNER" | "PRODUCTION" | null }
// Customers have no staff role: what they may do is fixed by their audience
// (shop-customer / calendar-customer) and they only ever reach their own data.
//
// Permissions are plain strings. Routes ask for permissions, never for role
// names, so the matrix below is the single place to change who may do what.

const PLATFORM_ROLES = ["SUPER_ADMIN"];
const SHOP_ROLES = ["ECOM_ADMIN", "SALES", "INVENTORY", "ACCOUNTS"];
const CALENDAR_ROLES = ["CAL_ADMIN", "CAL_MANAGER", "DESIGNER", "PRODUCTION"];
const MODULE_ROLES = { platform: PLATFORM_ROLES, shop: SHOP_ROLES, calendar: CALENDAR_ROLES };

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  ECOM_ADMIN: "E-commerce Admin",
  SALES: "Sales",
  INVENTORY: "Inventory",
  ACCOUNTS: "Accounts",
  CAL_ADMIN: "Calendar Admin",
  CAL_MANAGER: "Calendar Manager",
  DESIGNER: "Designer",
  PRODUCTION: "Production",
};

// ---- Permission catalogue ------------------------------------------------
const P = {
  // Platform
  PLATFORM_STAFF_MANAGE: "platform.staff.manage", // any module's staff, platform role
  PLATFORM_AUDIT_READ: "platform.audit.read",

  // Shop (used from Phase 4 on; defined now so roles are complete)
  SHOP_ACCESS: "shop.access",
  SHOP_CATALOG_READ: "shop.catalog.read",
  SHOP_CATALOG_MANAGE: "shop.catalog.manage",
  SHOP_INVENTORY_MANAGE: "shop.inventory.manage",
  SHOP_ORDERS_READ: "shop.orders.read",
  SHOP_ORDERS_MANAGE: "shop.orders.manage",
  SHOP_PAYMENTS_READ: "shop.payments.read",
  SHOP_PAYMENTS_MANAGE: "shop.payments.manage", // refunds, invoices
  SHOP_CUSTOMERS_READ: "shop.customers.read",
  SHOP_CUSTOMERS_MANAGE: "shop.customers.manage",
  SHOP_ENQUIRIES_MANAGE: "shop.enquiries.manage",
  SHOP_MARKETING_MANAGE: "shop.marketing.manage", // coupons, shipping, CMS
  SHOP_REPORTS_READ: "shop.reports.read",
  SHOP_STAFF_MANAGE: "shop.staff.manage",
  SHOP_AUDIT_READ: "shop.audit.read",

  // Calendar
  CAL_ACCESS: "calendar.access",
  CAL_DESIGN: "calendar.design", // Normal Mode, Customise, drafts, editing, sharing
  CAL_AI_GENERATE: "calendar.ai.generate", // paid AI (still behind the spend guard)
  CAL_AI_USAGE: "calendar.ai.usage", // AI spend & usage ledger (read)
  CAL_AI_USAGE_MANAGE: "calendar.ai.usage.manage", // reconcile ledger records
  CAL_LAYOUTS_READ: "calendar.layouts.read",
  CAL_LAYOUTS_MANAGE: "calendar.layouts.manage", // import, map, validate, activate
  CAL_SETTINGS_MANAGE: "calendar.settings.manage", // formats, production profiles
  CAL_GOD_LIBRARY_MANAGE: "calendar.godlibrary.manage",
  CAL_PRODUCTION_FILES: "calendar.production.files", // print / cutline PDFs
  CAL_JOBS_MANAGE: "calendar.jobs.manage", // Phase 9: jobs, assignment, approvals
  CAL_ORDERS_MANAGE: "calendar.orders.manage", // Phase 9: calendar orders
  CAL_STAFF_MANAGE: "calendar.staff.manage",
  CAL_AUDIT_READ: "calendar.audit.read",
};
const ALL_PERMISSIONS = Object.values(P);
const SHOP_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.startsWith("shop."));
const CALENDAR_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.startsWith("calendar."));

// ---- Matrix ----------------------------------------------------------------
const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  ECOM_ADMIN: SHOP_PERMISSIONS,
  SALES: [
    P.SHOP_ACCESS, P.SHOP_CATALOG_READ, P.SHOP_ORDERS_READ, P.SHOP_ORDERS_MANAGE, P.SHOP_PAYMENTS_READ,
    P.SHOP_CUSTOMERS_READ, P.SHOP_CUSTOMERS_MANAGE, P.SHOP_ENQUIRIES_MANAGE, P.SHOP_REPORTS_READ,
  ],
  INVENTORY: [P.SHOP_ACCESS, P.SHOP_CATALOG_READ, P.SHOP_INVENTORY_MANAGE, P.SHOP_ORDERS_READ, P.SHOP_REPORTS_READ],
  ACCOUNTS: [
    P.SHOP_ACCESS, P.SHOP_CATALOG_READ, P.SHOP_ORDERS_READ, P.SHOP_PAYMENTS_READ, P.SHOP_PAYMENTS_MANAGE,
    P.SHOP_CUSTOMERS_READ, P.SHOP_REPORTS_READ,
  ],

  CAL_ADMIN: CALENDAR_PERMISSIONS,
  CAL_MANAGER: [
    P.CAL_ACCESS, P.CAL_DESIGN, P.CAL_AI_USAGE, P.CAL_LAYOUTS_READ, P.CAL_GOD_LIBRARY_MANAGE,
    P.CAL_PRODUCTION_FILES, P.CAL_JOBS_MANAGE, P.CAL_ORDERS_MANAGE,
  ],
  DESIGNER: [P.CAL_ACCESS, P.CAL_DESIGN, P.CAL_AI_GENERATE, P.CAL_LAYOUTS_READ, P.CAL_PRODUCTION_FILES],
  PRODUCTION: [P.CAL_ACCESS, P.CAL_LAYOUTS_READ, P.CAL_PRODUCTION_FILES],
};

// Accounts created before Phase 2 have only the old `role` field, and every
// one of them had full Calendar Tool access. They keep exactly that until an
// administrator assigns module roles (nothing is written to the database).
const LEGACY_ROLES = {
  ADMIN: { platform: "SUPER_ADMIN", shop: null, calendar: null },
  STAFF: { platform: null, shop: null, calendar: "CAL_ADMIN" },
};

const emptyRoles = () => ({ platform: null, shop: null, calendar: null });

/** A staff user's module roles (stored roles win; legacy accounts are mapped). */
const rolesOf = (user) => {
  const stored = user?.roles || {};
  const hasStored = ["platform", "shop", "calendar"].some((m) => stored[m]);
  if (hasStored) {
    return {
      platform: PLATFORM_ROLES.includes(stored.platform) ? stored.platform : null,
      shop: SHOP_ROLES.includes(stored.shop) ? stored.shop : null,
      calendar: CALENDAR_ROLES.includes(stored.calendar) ? stored.calendar : null,
    };
  }
  return { ...(LEGACY_ROLES[user?.role] || emptyRoles()) };
};

/** Every permission granted by a set of module roles. */
const permissionsFor = (roles) => {
  const set = new Set();
  for (const role of Object.values(roles || {})) for (const p of ROLE_PERMISSIONS[role] || []) set.add(p);
  return [...set].sort();
};

/** Does this staff member belong to the module (may sign in to its panel)? */
const canEnterModule = (roles, module) => Boolean(roles?.platform === "SUPER_ADMIN" || roles?.[module]);

/** Is the role name valid for that module? null clears the role. */
const isValidModuleRole = (module, role) => role === null || (MODULE_ROLES[module] || []).includes(role);

module.exports = {
  P,
  ALL_PERMISSIONS,
  PLATFORM_ROLES,
  SHOP_ROLES,
  CALENDAR_ROLES,
  MODULE_ROLES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  LEGACY_ROLES,
  rolesOf,
  permissionsFor,
  canEnterModule,
  isValidModuleRole,
  emptyRoles,
};
