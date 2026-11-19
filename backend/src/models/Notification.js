const mongoose = require("mongoose");

// In-app notifications for staff and customers. A recipient only ever lists
// their own notifications for the audience they signed in with.
const notificationSchema = new mongoose.Schema(
  {
    recipientType: { type: String, enum: ["staff", "customer"], required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    audience: {
      type: String,
      enum: ["shop-customer", "shop-staff", "calendar-customer", "calendar-staff"],
      required: true,
    },
    type: { type: String, required: true }, // e.g. "account.welcome", "order.paid"
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: null, maxlength: 2000 },
    link: { type: String, default: null }, // an in-app path, never another site
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ recipientId: 1, audience: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
