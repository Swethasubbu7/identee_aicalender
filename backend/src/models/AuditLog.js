const mongoose = require("mongoose");

// Who changed what, when (staff actions and security events). Append-only:
// the app never updates or deletes entries.
const auditLogSchema = new mongoose.Schema(
  {
    actorType: { type: String, enum: ["staff", "customer", "system"], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    audience: { type: String, default: null },
    // e.g. "auth.login", "auth.login.failed", "staff.create", "staff.roles.update"
    action: { type: String, required: true },
    module: { type: String, enum: ["platform", "shop", "calendar"], default: "platform" },
    entity: { type: String, default: null },
    entityId: { type: String, default: null },
    // Changed fields only, never passwords, codes or tokens.
    changes: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ module: 1, at: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
