// Must stay in sync with backend/src/constants/calendar.js (CUT_TYPES).
export const CUT_TYPE_OPTIONS = [
  { value: "normal", label: "Normal Cut" },
  { value: "die-cut", label: "Die-Cut" },
  { value: "special-die-cut", label: "Special Die-Cut" },
];

export const CUT_TYPE_LABELS = {
  normal: "Normal Cut",
  "die-cut": "Die-Cut",
  "special-die-cut": "Special Die-Cut",
  // Legacy spelling still present on old layout documents.
  "special-cut": "Special Die-Cut",
};
