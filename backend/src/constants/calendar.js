// Fixed product catalogue for the Identee printed calendars.
// Every value here was confirmed by the business. Missing values are
// explicitly PENDING and must never be filled with guesses.

const CUT_TYPES = ["normal", "die-cut", "special-die-cut"];

const CUT_TYPE_LABELS = {
  normal: "Normal Cut",
  "die-cut": "Die-Cut",
  "special-die-cut": "Special Die-Cut",
};

const CAKE_STATUS = { CONFIRMED: "CONFIRMED", PENDING: "PENDING" };
const CAKE_CONVENTION = "H×W";

// Cake sizes use the business convention HEIGHT × WIDTH in inches
// (confirmed): "4×5" = 4 in tall × 5 in wide. Labels keep that order;
// heightIn / widthIn are stored explicitly so nothing depends on order.
const cakeLabel = (heightIn, widthIn) => `${heightIn}×${widthIn}`;
const confirmedCake = (heightIn, widthIn) => ({
  label: cakeLabel(heightIn, widthIn),
  heightIn,
  widthIn,
  status: CAKE_STATUS.CONFIRMED,
});
const pendingCake = () => ({
  label: null,
  heightIn: null,
  widthIn: null,
  status: CAKE_STATUS.PENDING,
});

const SIZES = {
  // cake: confirmedCake(HEIGHT, WIDTH)
  "10x15": { widthIn: 10, heightIn: 15, cake: confirmedCake(3.5, 4) },
  "12x18": { widthIn: 12, heightIn: 18, cake: confirmedCake(4, 5) },
  // 15×24: drawn 5 in tall × 7 in wide in every production file; confirmed
  // as correct by the business on 2026-10-07 → 5×7 (H×W).
  "15x24": { widthIn: 15, heightIn: 24, cake: confirmedCake(5, 7) },
  "20x30": { widthIn: 20, heightIn: 30, cake: confirmedCake(7, 7) },
  "30x40": { widthIn: 30, heightIn: 40, cake: confirmedCake(8, 6.5) },
};

const SIZES_BY_CUT_TYPE = {
  normal: ["10x15", "12x18", "15x24", "20x30", "30x40"],
  "die-cut": ["12x18", "15x24", "20x30", "30x40"],
  "special-die-cut": ["12x18", "15x24", "20x30", "30x40"],
};

// One catalogue row per (cutType, size) — the seed source for CalendarFormat.
// Cake sizes that are UNRESOLVED for one cut type only. Such a format is set
// back to PENDING by the seed, so no layout of it can pass validation until
// the business confirms the size (then remove the entry and confirm it).
//   special-die-cut 15×24 (2026-10-13): the Special spec says 7×5 (H×W), the
//   catalogue and the 15×24 drawings say 5 tall × 7 wide (the drawings' own
//   label reads "7X5 INCHES"). No Special 15×24 file has been supplied yet.
const UNRESOLVED_CAKES = {
  "special-die-cut": { "15x24": "Special 15×24 cake: 7×5 or 5×7 (H×W)? Needs business confirmation." },
};

const CALENDAR_FORMATS = CUT_TYPES.flatMap((cutType, typeIndex) =>
  SIZES_BY_CUT_TYPE[cutType].map((sizeCode, sizeIndex) => ({
    cutType,
    sizeCode,
    label: `${sizeCode.replace("x", "×")}`,
    widthIn: SIZES[sizeCode].widthIn,
    heightIn: SIZES[sizeCode].heightIn,
    cake: UNRESOLVED_CAKES[cutType]?.[sizeCode] ? pendingCake() : { ...SIZES[sizeCode].cake },
    active: true,
    sortOrder: typeIndex * 10 + sizeIndex,
  })),
);

// Structural rules per cut type (confirmed).
// Normal & Die-Cut: left side box = product list, right side box = product image.
// Special Die-Cut: no side boxes; two text lines instead.
const REGION_ROLES = [
  "CUTLINE_AREA",
  "FRAME",
  "GOD_AREA",
  "BACKGROUND_AREA",
  "NAME_BANNER",
  "NAME_TEXT",
  "SIDE_BOX_LEFT",
  "SIDE_BOX_RIGHT",
  "TEXT_LINE_1",
  "TEXT_LINE_2",
  "CALENDAR_AREA",
  "CAKE_MOUNT",
  "KEEP_OUT",
  "DECORATION",
];

const REGION_POLICIES = ["LOCKED", "AI", "APP_TEXT", "APP_IMAGE", "APP_CALENDAR"];

const CONTENT_BINDINGS = [
  "businessName",
  "productList",
  "address",
  "productImage",
];

const STRUCTURE_RULES = {
  normal: {
    required: ["GOD_AREA", "NAME_TEXT", "SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CALENDAR_AREA", "CAKE_MOUNT"],
    exactlyOne: ["SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CAKE_MOUNT", "NAME_TEXT"],
    forbidden: ["TEXT_LINE_1", "TEXT_LINE_2"],
  },
  "die-cut": {
    required: ["FRAME", "GOD_AREA", "NAME_TEXT", "SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CALENDAR_AREA", "CAKE_MOUNT"],
    exactlyOne: ["SIDE_BOX_LEFT", "SIDE_BOX_RIGHT", "CAKE_MOUNT", "NAME_TEXT"],
    forbidden: ["TEXT_LINE_1", "TEXT_LINE_2"],
  },
  // Special Die-Cut (business decision 2026-10-13): the deity has NO fixed
  // shape or position. Without a GOD_AREA the AI composes the whole artwork
  // (deity, frame, background) inside the approved cutline; an optional
  // GOD_AREA keeps the classic "deity in an opening" behaviour. The artwork
  // itself (FRAME or BACKGROUND_AREA) is required.
  "special-die-cut": {
    required: ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "CALENDAR_AREA", "CAKE_MOUNT"],
    requireAny: [["FRAME", "BACKGROUND_AREA"]],
    exactlyOne: ["TEXT_LINE_1", "TEXT_LINE_2", "CAKE_MOUNT", "NAME_TEXT", "GOD_AREA"],
    forbidden: ["SIDE_BOX_LEFT", "SIDE_BOX_RIGHT"],
  },
};

// Ownership of every region role. The renderer enforces these: AI output is
// only ever placed in AI regions; everything LOCKED comes from the layout.
const ROLE_POLICY = {
  CUTLINE_AREA: "LOCKED",
  FRAME: "LOCKED",
  NAME_BANNER: "LOCKED",
  DECORATION: "LOCKED",
  CAKE_MOUNT: "LOCKED",
  KEEP_OUT: "LOCKED",
  GOD_AREA: "AI",
  BACKGROUND_AREA: "AI",
  NAME_TEXT: "APP_TEXT",
  TEXT_LINE_1: "APP_TEXT",
  TEXT_LINE_2: "APP_TEXT",
  SIDE_BOX_LEFT: "APP_TEXT",
  SIDE_BOX_RIGHT: "APP_IMAGE",
  CALENDAR_AREA: "APP_CALENDAR",
};

const TEXT_ROLES = ["NAME_TEXT", "TEXT_LINE_1", "TEXT_LINE_2", "SIDE_BOX_LEFT"];

// Which customer-content field each region role expects (confirmed).
const EXPECTED_BINDINGS = {
  NAME_TEXT: "businessName",
  SIDE_BOX_LEFT: "productList",
  SIDE_BOX_RIGHT: "productImage",
};

const LAYOUT_STATUSES = ["DRAFT", "VALIDATED", "ACTIVE", "ARCHIVED"];
const FAMILY_STATUSES = ["ACTIVE", "CANDIDATE", "LEGACY"];

module.exports = {
  CUT_TYPES,
  CUT_TYPE_LABELS,
  CAKE_STATUS,
  CAKE_CONVENTION,
  cakeLabel,
  SIZES,
  SIZES_BY_CUT_TYPE,
  CALENDAR_FORMATS,
  REGION_ROLES,
  REGION_POLICIES,
  CONTENT_BINDINGS,
  STRUCTURE_RULES,
  UNRESOLVED_CAKES,
  EXPECTED_BINDINGS,
  ROLE_POLICY,
  TEXT_ROLES,
  LAYOUT_STATUSES,
  FAMILY_STATUSES,
};
