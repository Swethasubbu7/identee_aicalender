// Shared e-mail sending (same Gmail account settings as before:
// EMAIL_USER / EMAIL_PASSWORD). A transactional provider replaces this at
// deployment (Phase 11) without changing callers. Codes and links are never
// logged.
const nodemailer = require("nodemailer");

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });
  }
  return transporter;
};

const isConfigured = () => Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Sends one e-mail. Throws when mail is not configured or sending fails. */
const sendMail = async ({ to, subject, text }) => {
  if (!isConfigured()) throw new Error("E-mail is not configured on this server (EMAIL_USER / EMAIL_PASSWORD).");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2430">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
  await getTransporter().sendMail({ from: `"NAUTICREW" <${process.env.EMAIL_USER}>`, to, subject, text, html });
};

// Test hook: forget the cached transporter (tests replace nodemailer).
const _reset = () => {
  transporter = null;
};

module.exports = { sendMail, isConfigured, _reset };
