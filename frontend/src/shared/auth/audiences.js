// The four Nauticrew sign-in areas (Phase 2). Each has its own login page,
// its own session cookie and its own home. A sign-in for one never opens
// another.
export const CALENDAR_STAFF_HOME = "/calendar/staff";

export const AUDIENCES = {
  "calendar-staff": {
    kind: "staff",
    label: "Calendar Staff",
    title: "AI Calendar Studio",
    tagline: "Create beautiful, personalised calendars with powerful design tools made for your team.",
    base: "/calendar/staff",
    home: CALENDAR_STAFF_HOME,
  },
  "calendar-customer": {
    kind: "customer",
    label: "Calendar Customer",
    title: "Your Calendars",
    tagline: "Review your calendar designs, approve them and follow your orders.",
    base: "/calendar/customer",
    home: "/calendar/customer",
  },
  "shop-staff": {
    kind: "staff",
    label: "Shop Staff",
    title: "Shop Admin",
    tagline: "Products, orders, customers and reports for the Nauticrew shop.",
    base: "/shop/staff",
    home: "/shop/staff",
  },
  "shop-customer": {
    kind: "customer",
    label: "Shop Customer",
    title: "Your Account",
    tagline: "Your orders, addresses, wishlist and invoices in one place.",
    base: "/shop/account",
    home: "/shop/account",
  },
};

export const authPath = (audience, page) => `${AUDIENCES[audience].base}/${page}`;
export const loginPath = (audience) => authPath(audience, "login");

/** Which sign-in area a page belongs to (used when a session expires). */
export const audienceForPath = (pathname = "") => {
  if (pathname.startsWith("/shop/staff")) return "shop-staff";
  if (pathname.startsWith("/shop/account") || pathname.startsWith("/shop")) return "shop-customer";
  if (pathname.startsWith("/calendar/customer")) return "calendar-customer";
  return "calendar-staff";
};

/** Where to go after signing in: a page inside this area only (never another site). */
export const safeNext = (audience, next) => {
  const { base, home } = AUDIENCES[audience];
  return typeof next === "string" &&
    next.startsWith(`${base}`) &&
    !next.startsWith("//") &&
    !/\/(login|register|verify-email|forgot-password|reset-password)(\?|$)/.test(next)
    ? next
    : home;
};

export const loginPathFor = (audience, location) => {
  const here = `${location.pathname}${location.search || ""}`;
  return `${loginPath(audience)}?next=${encodeURIComponent(here)}`;
};
