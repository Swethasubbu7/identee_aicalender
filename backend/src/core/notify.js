// In-app notifications (the notification centre). E-mail copies are sent by
// the caller where needed. Never throws.
const Notification = require("../models/Notification");

const safeLink = (link) => (typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : null);

/**
 * @param {{ recipientType: "staff"|"customer", recipientId: any, audience: string,
 *           type: string, title: string, body?: string, link?: string }} n
 */
const notify = async (n) => {
  try {
    return await Notification.create({ ...n, link: safeLink(n.link) });
  } catch (err) {
    console.error("Notification write failed:", err.message);
    return null;
  }
};

module.exports = { notify, safeLink };
