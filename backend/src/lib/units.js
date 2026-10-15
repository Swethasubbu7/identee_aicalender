// Unit conversions. All layout geometry is stored in millimetres measured
// from the top-left corner of the trimmed sheet.

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;
// CorelDRAW internal unit = 0.1 micrometre (254000 units per inch).
const COREL_UNITS_PER_INCH = 254000;

const inToMm = (inches) => inches * MM_PER_INCH;
const mmToIn = (mm) => mm / MM_PER_INCH;
const ptToMm = (pt) => (pt / PT_PER_INCH) * MM_PER_INCH;
const mmToPt = (mm) => (mm / MM_PER_INCH) * PT_PER_INCH;
const coreUnitsToMm = (units) => (units / COREL_UNITS_PER_INCH) * MM_PER_INCH;
const mmToPx = (mm, dpi) => Math.round((mm / MM_PER_INCH) * dpi);

// Effective resolution of `px` pixels printed across `mm` millimetres.
const effectiveDpi = (px, mm) => (mm > 0 ? px / mmToIn(mm) : 0);

module.exports = {
  MM_PER_INCH,
  inToMm,
  mmToIn,
  ptToMm,
  mmToPt,
  coreUnitsToMm,
  mmToPx,
  effectiveDpi,
};
