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
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 90,
        y: 60,
        width: 420,
        height: 340,
        shape: "rectangle",
        required: true,
      },
    ],
    isActive: true,
  },
  {
    name: "Traditional Devotional Layout",
    type: "normal",
    size: "A3",
    description: "A clean, traditional 12-month layout suited for general use.",
    previewImage:
      "https://placehold.co/600x800/png?text=Traditional+Devotional",
    layoutFile: "layouts/traditional-devotional-layout.json",
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 90,
        y: 60,
        width: 420,
        height: 340,
        shape: "rectangle",
        required: true,
      },
    ],
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
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 100,
        y: 80,
        width: 400,
        height: 420,
        shape: "arch",
        required: true,
      },
    ],
    isActive: true,
  },
  {
    name: "Arch Special Cut Layout",
    type: "special-cut",
    size: "12 x 18 inch",
    description: "Arch-shaped special-cut layout for devotional themes.",
    previewImage: "https://placehold.co/600x900/png?text=Arch+Special+Cut",
    layoutFile: "layouts/arch-special-cut-layout.json",
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 100,
        y: 80,
        width: 400,
        height: 420,
        shape: "arch",
        required: true,
      },
    ],
    isActive: true,
  },
  {
    name: "Krishna Die Cut Layout",
    type: "die-cut",
    size: "Custom",
    description: "Die-cut devotional layout shaped around the Krishna motif.",
    previewImage: "https://placehold.co/600x900/png?text=Krishna+Die+Cut",
    layoutFile: "layouts/krishna-die-cut-layout.json",
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 120,
        y: 100,
        width: 360,
        height: 360,
        shape: "circle",
        required: true,
      },
    ],
    isActive: true,
  },
  {
    name: "Floral Die Cut Layout",
    type: "die-cut",
    size: "Custom",
    description: "Decorative floral-border die-cut layout for festive designs.",
    previewImage: "https://placehold.co/600x950/png?text=Floral+Die+Cut",
    layoutFile: "layouts/floral-die-cut-layout.json",
    editableAreas: [
      {
        id: "main-photo",
        type: "image",
        x: 120,
        y: 100,
        width: 360,
        height: 360,
        shape: "circle",
        required: true,
      },
    ],
    isActive: true,
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected for seeding ✅");

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
