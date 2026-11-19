// The four sign-in audiences of the Nauticrew platform. Every token carries
// exactly one audience and is accepted only by that audience's APIs.

const AUDIENCES = {
  "shop-customer": { kind: "customer", module: "shop", portal: "shop", label: "Shop customer" },
  "shop-staff": { kind: "staff", module: "shop", label: "Shop staff" },
  "calendar-customer": { kind: "customer", module: "calendar", portal: "calendar", label: "Calendar customer" },
  "calendar-staff": { kind: "staff", module: "calendar", label: "Calendar staff" },
};
const AUDIENCE_NAMES = Object.keys(AUDIENCES);
const STAFF_AUDIENCES = AUDIENCE_NAMES.filter((a) => AUDIENCES[a].kind === "staff");
const CUSTOMER_AUDIENCES = AUDIENCE_NAMES.filter((a) => AUDIENCES[a].kind === "customer");

const isAudience = (a) => Object.prototype.hasOwnProperty.call(AUDIENCES, a);

// Cookie names per audience (short, no personal data). Access cookies are
// sent to every API; refresh cookies only to that audience's auth routes.
const cookieNames = (audience) => {
  const short = { "shop-customer": "sc", "shop-staff": "ss", "calendar-customer": "cc", "calendar-staff": "cs" }[audience];
  return { access: `nc_${short}_at`, refresh: `nc_${short}_rt` };
};

module.exports = { AUDIENCES, AUDIENCE_NAMES, STAFF_AUDIENCES, CUSTOMER_AUDIENCES, isAudience, cookieNames };
