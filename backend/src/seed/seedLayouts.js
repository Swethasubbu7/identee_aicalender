// One-off script to populate the database with sample layouts for testing.
//
// Run from the backend folder with:
//   node src/seed/seedLayouts.js
//
// NOTE: These are placeholder sample layouts for UI testing only.
// They are not final production designs.

const mongoose = require("mongoose");
require("dotenv").config();

const Layout = require("../models/Layout");

const sampleLayouts = [
  {
    name: "Classic Temple Layout",
    type: "normal",
    size: "A4",
    description:
      "Traditional calendar layout with a fixed photo area at the top.",
    previewImage: "https://placehold.co/600x800/png?text=Classic+Temple",
    layoutFile: "layouts/classic-temple-layout.json",
    isActive: true,
  },
  {
    name: "Traditional Normal Layout",
    type: "normal",
    size: "A4",
    description: "A clean, traditional 12-month layout suited for general use.",
    previewImage: "https://placehold.co/600x800/png?text=Traditional+Layout",
    layoutFile: "layouts/traditional-normal-layout.json",
    isActive: true,
  },
  {
    name: "Devotional Normal Layout",
    type: "normal",
    size: "A3",
    description: "Devotional-themed layout with a large central photo area.",
    previewImage: "https://placehold.co/600x850/png?text=Devotional+Layout",
    layoutFile: "layouts/devotional-normal-layout.json",
    isActive: true,
  },
  {
    name: "Special Cut Krishna Layout",
    type: "special-cut",
    size: "12 x 18 inch",
    description:
      "Special-cut devotional calendar layout shaped around the Krishna motif.",
    previewImage: "https://placehold.co/600x900/png?text=Krishna+Special+Cut",
    layoutFile: "layouts/special-cut-krishna-layout.json",
    isActive: true,
  },
  {
    name: "Temple Special Cut Layout",
    type: "special-cut",
    size: "12 x 18 inch",
    description:
      "Temple silhouette special-cut layout with an arched photo frame.",
    previewImage: "https://placehold.co/600x900/png?text=Temple+Special+Cut",
    layoutFile: "layouts/temple-special-cut-layout.json",
    isActive: true,
  },
  {
    name: "Floral Special Cut Layout",
    type: "special-cut",
    size: "13 x 19 inch",
    description:
      "Decorative floral-border special-cut layout for festive designs.",
    previewImage: "https://placehold.co/600x950/png?text=Floral+Special+Cut",
    layoutFile: "layouts/floral-special-cut-layout.json",
    isActive: true,
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected for seeding ✅");

    // Clear out any previously seeded sample layouts with the same names
    const names = sampleLayouts.map((l) => l.name);
    await Layout.deleteMany({ name: { $in: names } });

    await Layout.insertMany(sampleLayouts);

    console.log(`Seeded ${sampleLayouts.length} sample layouts 🎉`);
  } catch (error) {
    console.error("Seeding failed ❌", error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

seed();
