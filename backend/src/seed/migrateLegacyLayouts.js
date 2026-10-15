// Usage: npm run migrate:legacy-layouts
// 1. Renames the legacy cut type "special-cut" to "special-die-cut".
// 2. Deactivates the sample layouts that the old seed script inserted with
//    invented coordinates and placeholder images (matched by exact name).
// Real production layouts live in LayoutFamily / LayoutVariant instead.
const mongoose = require("mongoose");
require("dotenv").config();
const Layout = require("../models/Layout");

const OLD_SEEDED_SAMPLE_NAMES = [
  "Classic Temple Layout",
  "Traditional Devotional Layout",
  "Temple Special Cut Layout",
  "Arch Special Cut Layout",
  "Krishna Die Cut Layout",
  "Floral Die Cut Layout",
];

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const renamed = await Layout.updateMany(
      { type: "special-cut" },
      { $set: { type: "special-die-cut" } },
    );
    const deactivated = await Layout.updateMany(
      { name: { $in: OLD_SEEDED_SAMPLE_NAMES }, isActive: true },
      { $set: { isActive: false } },
    );
    console.log(`Renamed special-cut → special-die-cut: ${renamed.modifiedCount}`);
    console.log(`Deactivated old sample layouts: ${deactivated.modifiedCount}`);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
