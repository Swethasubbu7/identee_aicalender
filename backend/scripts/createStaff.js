// Creates ONE Calendar Tool staff account (administrators only; public
// staff sign-up is closed). A strong temporary password is generated and
// shown ONCE here — give it to the person privately; they should change it
// after the first login (password change arrives with Phase 2).
//
// Usage (from backend/):
//   node scripts/createStaff.js --name "Priya S" --email priya@example.com [--role STAFF|ADMIN]
//
// Never changes or deletes an existing account.
require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const main = async () => {
  const name = String(arg("name") || "").trim();
  const email = String(arg("email") || "").trim().toLowerCase();
  const role = String(arg("role") || "STAFF").trim().toUpperCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: node scripts/createStaff.js --name "Full Name" --email person@example.com [--role STAFF|ADMIN]');
  }
  if (!["STAFF", "ADMIN"].includes(role)) throw new Error("--role must be STAFF or ADMIN");

  await mongoose.connect(process.env.MONGO_URI);
  if (await User.exists({ email })) throw new Error(`An account for ${email} already exists — nothing was changed.`);
  // 18 random characters (letters + digits), easy to type, hard to guess.
  const password = crypto.randomBytes(18).toString("base64").replace(/[+/=]/g, "").slice(0, 18);
  await User.create({ name, email, role, password: await bcrypt.hash(password, 12), active: true });
  console.log(`Staff account created: ${name} <${email}> (${role})`);
  console.log(`Temporary password (shown once): ${password}`);
};

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
