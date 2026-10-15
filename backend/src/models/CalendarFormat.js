const mongoose = require("mongoose");
const { CUT_TYPES, CAKE_STATUS } = require("../constants/calendar");

// Fixed product catalogue row: one cut type at one calendar size, with the
// cake (physical date pad) size that goes with it. Seeded from
// constants/calendar.js — see seed/seedCalendarFormats.js.
const calendarFormatSchema = new mongoose.Schema(
  {
    cutType: { type: String, enum: CUT_TYPES, required: true },
    sizeCode: { type: String, required: true, trim: true }, // "12x18"
    label: { type: String, required: true, trim: true }, // "12×18"
    widthIn: { type: Number, required: true },
    heightIn: { type: Number, required: true },
    cake: {
      // Label in the business convention HEIGHT × WIDTH, e.g. "4×5".
      label: { type: String, default: null },
      heightIn: { type: Number, default: null },
      widthIn: { type: Number, default: null },
      status: {
        type: String,
        enum: Object.values(CAKE_STATUS),
        default: CAKE_STATUS.PENDING,
      },
    },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

calendarFormatSchema.index({ cutType: 1, sizeCode: 1 }, { unique: true });

module.exports = mongoose.model("CalendarFormat", calendarFormatSchema);
