const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    // Legacy field from before Phase 2. Accounts without module roles are
    // mapped from it in core/roles.js (ADMIN → Super Admin, STAFF →
    // Calendar Admin), which keeps their existing full Calendar Tool access.
    role: {
      type: String,
      enum: ["STAFF", "ADMIN"],
      default: "STAFF",
    },

    // Staff module roles (Phase 2). One role per module at most.
    roles: {
      platform: { type: String, enum: ["SUPER_ADMIN", null], default: null },
      shop: { type: String, enum: ["ECOM_ADMIN", "SALES", "INVENTORY", "ACCOUNTS", null], default: null },
      calendar: { type: String, enum: ["CAL_ADMIN", "CAL_MANAGER", "DESIGNER", "PRODUCTION", null], default: null },
    },

    active: {
      type: Boolean,
      default: true,
    },

    // Raised on password change, role change or deactivation: every access
    // token issued before is refused from then on.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
