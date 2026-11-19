const mongoose = require("mongoose");

// Customers of the shop and of the calendar service (Phase 2).
// One e-mail = one customer record; each portal is enabled separately and a
// sign-in only ever issues that portal's token. Portal data (shop orders,
// calendar designs) lives in that portal's own collections and APIs, so one
// portal never shows the other's records.
const portalSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    joinedAt: { type: Date, default: null },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, default: null, maxlength: 20 },
    passwordHash: { type: String, required: true },
    businessName: { type: String, trim: true, default: null, maxlength: 160 },
    gstin: { type: String, trim: true, uppercase: true, default: null, maxlength: 15 },
    emailVerified: { type: Boolean, default: false },
    portals: {
      shop: { type: portalSchema, default: () => ({}) },
      calendar: { type: portalSchema, default: () => ({}) },
    },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);
customerSchema.index({ phone: 1 }, { sparse: true });

module.exports = mongoose.model("Customer", customerSchema);
