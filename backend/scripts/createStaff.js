// Creates ONE staff account (administrators only; public staff sign-up is
// closed). A strong temporary password is generated and shown ONCE here —
// give it to the person privately; they change it after the first sign-in
// (Change password). Once a Super Admin exists, staff are normally created
// in the app instead (POST /api/staff).
//
// Usage (from backend/):
//   node scripts/createStaff.js --name "Priya S" --email priya@example.com
//        [--calendar CAL_ADMIN|CAL_MANAGER|DESIGNER|PRODUCTION]
//        [--shop ECOM_ADMIN|SALES|INVENTORY|ACCOUNTS] [--super-admin]
//   (no role option = Calendar Admin, the access every account had before Phase 2)
//
// Never changes or deletes an existing account.
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { isValidModuleRole } = require("../src/core/roles");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const main = async () => {
  const name = String(arg("name") || "").trim();
  const email = String(arg("email") || "").trim().toLowerCase();
  const upper = (v) => (v ? String(v).trim().toUpperCase() : null);
  const roles = {
    platform: process.argv.includes("--super-admin") ? "SUPER_ADMIN" : null,
    shop: upper(arg("shop")),
    calendar: upper(arg("calendar")),
  };
  if (!roles.platform && !roles.shop && !roles.calendar) roles.calendar = "CAL_ADMIN";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: node scripts/createStaff.js --name "Full Name" --email person@example.com [--calendar ROLE] [--shop ROLE] [--super-admin]');
  }
  for (const m of ["shop", "calendar"]) if (!isValidModuleRole(m, roles[m])) throw new Error(`--${m} ${roles[m]} is not a ${m} role.`);
  const role = roles.platform ? "ADMIN" : "STAFF";

  await mongoose.connect(process.env.MONGO_URI);
  if (await User.exists({ email })) throw new Error(`An account for ${email} already exists — nothing was changed.`);
  // 18 random characters (letters + digits), easy to type, hard to guess.
  const password = crypto.randomBytes(18).toString("base64").replace(/[+/=]/g, "").slice(0, 18);
  await User.create({ name, email, role, roles, password: await bcrypt.hash(password, 12), active: true });
  console.log(`Staff account created: ${name} <${email}> ${JSON.stringify(roles)}`);
  console.log(`Temporary password (shown once): ${password}`);
};

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
