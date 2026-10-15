// Region roles for production layout mapping. Must match
// backend/src/constants/calendar.js (STRUCTURE_RULES, ROLE_POLICY).

export const ROLE_INFO = {
  FRAME: { label: "Frame / border artwork", hint: "Locked artwork; its outline follows the cut", color: "#8e44ad", policy: "Locked" },
  GOD_AREA: { label: "God image area", hint: "AI generates the god artwork here", color: "#e67e22", policy: "AI" },
  BACKGROUND_AREA: { label: "Background area", hint: "AI background / texture", color: "#f1c40f", policy: "AI" },
  NAME_BANNER: { label: "Name banner strip", hint: "Locked strip behind the business name", color: "#16a085", policy: "Locked" },
  NAME_TEXT: { label: "Business name text", hint: "Customer's business name goes here", color: "#2980b9", policy: "App text" },
  SIDE_BOX_LEFT: { label: "Left side box (product list)", hint: "Product / details list", color: "#27ae60", policy: "App text" },
  SIDE_BOX_RIGHT: { label: "Right side box (product image)", hint: "Customer's product photo", color: "#2ecc71", policy: "App image" },
  TEXT_LINE_1: { label: "Text line 1", hint: "First content line", color: "#3498db", policy: "App text" },
  TEXT_LINE_2: { label: "Text line 2", hint: "Second content line", color: "#5dade2", policy: "App text" },
  CALENDAR_AREA: { label: "Centre calendar area", hint: "Printed calendar area", color: "#c0392b", policy: "App calendar" },
  CAKE_MOUNT: { label: "Cake mount", hint: "Exact cake (pad) rectangle", color: "#e74c3c", policy: "Locked" },
  KEEP_OUT: { label: "Keep-out zone", hint: "Nothing may be placed here", color: "#7f8c8d", policy: "Locked" },
  DECORATION: { label: "Other locked decoration", hint: "Locked artwork", color: "#95a5a6", policy: "Locked" },
};

export const ROLES_BY_CUT_TYPE = {
  normal: {
    required: ["GOD_AREA", "NAME_TEXT", "SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CALENDAR_AREA", "CAKE_MOUNT"],
    optional: ["FRAME", "BACKGROUND_AREA", "NAME_BANNER", "KEEP_OUT", "DECORATION"],
  },
  "die-cut": {
    required: ["FRAME", "GOD_AREA", "NAME_TEXT", "SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CALENDAR_AREA", "CAKE_MOUNT"],
    optional: ["BACKGROUND_AREA", "NAME_BANNER", "KEEP_OUT", "DECORATION"],
  },
  // Special Die-Cut: no fixed god area (the AI composes the deity); the
  // artwork is mapped as BACKGROUND_AREA (or FRAME). A GOD_AREA is optional.
  "special-die-cut": {
    required: ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "CALENDAR_AREA", "CAKE_MOUNT"],
    optional: ["BACKGROUND_AREA", "FRAME", "GOD_AREA", "NAME_BANNER", "KEEP_OUT", "DECORATION"],
  },
};

// Roles that may be assigned more than once.
export const MULTI_ROLES = ["KEEP_OUT", "DECORATION"];

export const TEXT_ROLES = ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "SIDE_BOX_LEFT"];

export const LINE_BINDING_OPTIONS = [
  { value: "productList", label: "Product list" },
  { value: "address", label: "Address" },
  { value: "businessName", label: "Business name" },
];

export const VARIANT_STATUS = {
  DRAFT: { label: "Draft", color: "default" },
  VALIDATED: { label: "Validated", color: "info" },
  ACTIVE: { label: "Active", color: "success" },
  ARCHIVED: { label: "Archived", color: "default" },
};
