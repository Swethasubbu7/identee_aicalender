// Local browser-test accounts (development only).
//
//   node scripts/e2eUsers.js create   → creates a STAFF and an ADMIN test user
//                                        with generated passwords, written to
//                                        backend/.e2e-users.json (git-ignored)
//   node scripts/e2eUsers.js cleanup  → deletes the test users and everything
//                                        they created: generations, drafts and
//                                        reusable layouts saved by them.
//
// Never prints passwords. Never touches other users' data.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const AiCalendarJob = require("../src/models/AiCalendarJob");
const CalendarDesign = require("../src/models/CalendarDesign");
const LayoutVariant = require("../src/models/LayoutVariant");
const LayoutFamily = require("../src/models/LayoutFamily");

const FILE = path.join(__dirname, "..", ".e2e-users.json");
const USERS = [
  { key: "designer", name: "E2E Designer", email: "e2e-designer@identee.test", role: "STAFF" },
  { key: "admin", name: "E2E Admin", email: "e2e-admin@identee.test", role: "ADMIN" },
];

const create = async () => {
  const out = {};
  for (const u of USERS) {
    const password = crypto.randomBytes(12).toString("base64url");
    await User.findOneAndUpdate(
      { email: u.email },
      { name: u.name, email: u.email, role: u.role, active: true, password: await bcrypt.hash(password, 10) },
      { upsert: true, returnDocument: "after" },
    );
    out[u.key] = { email: u.email, password };
  }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2));
  console.log(`Created ${USERS.map((u) => u.email).join(", ")} (passwords in ${path.basename(FILE)})`);
};

const cleanup = async () => {
  const users = await User.find({ email: { $in: USERS.map((u) => u.email) } });
  const ids = users.map((u) => u._id);
  // Files of the test generations: mock pictures, previews, exported PDFs.
  const { UPLOADS_DIR, resolveUpload } = require("../src/services/ai/uploadPaths");
  const testJobs = await AiCalendarJob.find({ userId: { $in: ids } }).lean();
  let files = 0;
  for (const job of testJobs) {
    const dir = path.join(UPLOADS_DIR, "ai-calendars", String(job._id));
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    for (const v of job.variations || []) {
      for (const stored of [v.exportPdf, v.exportCutlinePdf, v.previewImage]) {
        const abs = stored && resolveUpload(stored);
        if (abs && fs.existsSync(abs)) (fs.unlinkSync(abs), (files += 1));
      }
    }
  }
  const contentDir = path.join(UPLOADS_DIR, "design-content");
  if (fs.existsSync(contentDir)) {
    for (const f of fs.readdirSync(contentDir).filter((n) => n.startsWith("e2e-god-"))) (fs.unlinkSync(path.join(contentDir, f)), (files += 1));
  }
  const jobs = await AiCalendarJob.deleteMany({ userId: { $in: ids } });
  const drafts = await CalendarDesign.deleteMany({ createdBy: { $in: ids } });
  const saved = await LayoutVariant.find({ createdBy: { $in: ids }, design: { $ne: null } });
  const families = saved.map((v) => v.familyId);
  // Asset files only these test layouts use (e.g. layers re-rendered for
  // them); files shared with any other layout are never touched.
  const others = await LayoutVariant.find({ _id: { $nin: saved.map((v) => v._id) } }, { assets: 1 }).lean();
  const inUse = new Set(others.flatMap((v) => Object.values(v.assets || {}).filter((x) => typeof x === "string")));
  for (const v of saved) {
    for (const stored of Object.values(v.toObject().assets || {})) {
      if (typeof stored !== "string" || inUse.has(stored) || !stored.startsWith("/uploads/production/")) continue;
      const abs = resolveUpload(stored);
      if (abs && fs.existsSync(abs)) (fs.unlinkSync(abs), (files += 1));
    }
  }
  await LayoutVariant.deleteMany({ _id: { $in: saved.map((v) => v._id) } });
  await LayoutFamily.deleteMany({ _id: { $in: families }, createdBy: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  console.log(
    `Removed ${users.length} test users, ${jobs.deletedCount} generations (+ ${files} files), ${drafts.deletedCount} drafts, ${saved.length} saved layouts.`,
  );
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (process.argv[2] === "create") await create();
  else if (process.argv[2] === "cleanup") await cleanup();
  else console.log("Usage: node scripts/e2eUsers.js create|cleanup");
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("e2eUsers failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
