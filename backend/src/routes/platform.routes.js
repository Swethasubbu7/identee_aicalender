// Shared platform APIs:
//   /api/notifications/<audience>        — the signed-in account's own notifications
//   /api/notifications/<audience>/:id/read
//   /api/audit?module=shop|calendar|platform — audit log (admins)
const express = require("express");
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const { AUDIENCE_NAMES } = require("../core/audiences");
const { requireAudience } = require("../core/authenticate");
const { P } = require("../core/roles");

const notificationsRouter = express.Router();
for (const audience of AUDIENCE_NAMES) {
  const mine = (req) => ({ recipientId: req.principal.id, audience });
  notificationsRouter.get(`/${audience}`, requireAudience(audience), async (req, res) => {
    try {
      const unreadOnly = req.query.unread === "1";
      const items = await Notification.find({ ...mine(req), ...(unreadOnly && { readAt: null }) })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const unread = await Notification.countDocuments({ ...mine(req), readAt: null });
      res.json({ notifications: items, unread });
    } catch (err) {
      console.error("Notifications error:", err);
      res.status(500).json({ message: "Failed to load notifications." });
    }
  });
  notificationsRouter.post(`/${audience}/read-all`, requireAudience(audience), async (req, res) => {
    await Notification.updateMany({ ...mine(req), readAt: null }, { $set: { readAt: new Date() } });
    res.json({ message: "All marked as read" });
  });
  notificationsRouter.post(`/${audience}/:id/read`, requireAudience(audience), async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: "Not found" });
    // Only the recipient's own notification can be marked (others: 404).
    const r = await Notification.updateOne({ _id: req.params.id, ...mine(req) }, { $set: { readAt: new Date() } });
    if (!r.matchedCount) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Marked as read" });
  });
}

const auditRouter = express.Router();
const AUDIT_READ = { platform: P.PLATFORM_AUDIT_READ, shop: P.SHOP_AUDIT_READ, calendar: P.CAL_AUDIT_READ };
auditRouter.get("/", requireAudience(["calendar-staff", "shop-staff"]), async (req, res) => {
  try {
    const perms = new Set(req.principal.permissions);
    const readable = Object.keys(AUDIT_READ).filter((m) => perms.has(P.PLATFORM_AUDIT_READ) || perms.has(AUDIT_READ[m]));
    if (!readable.length) return res.status(403).json({ message: "Your role does not allow reading the audit log.", code: "FORBIDDEN" });
    const wanted = typeof req.query.module === "string" ? req.query.module : null;
    if (wanted && !readable.includes(wanted)) return res.status(403).json({ message: "Your role does not allow reading this log.", code: "FORBIDDEN" });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const entries = await AuditLog.find({ module: wanted ? wanted : { $in: readable } })
      .sort({ at: -1 })
      .limit(limit)
      .lean();
    res.json({ entries });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({ message: "Failed to load the audit log." });
  }
});

module.exports = { notificationsRouter, auditRouter };
