// Development only: creates an AI Mode job with two MOCK "AI" pictures for
// the local browser test, without any AI request (nothing is sent anywhere,
// no usage is recorded). The pictures are drawn here from a god photo and
// follow the production guide the real model receives: complete artwork
// inside the trim, a plain reserved calendar area, a product picture where
// the right box shows an AI image. They are labelled "MOCK AI".
//
//   node scripts/e2eMockAiJob.js <variantId> <godPhotoPath> ['{"showLeftBox":false}']
// The optional JSON overrides the section switches (e.g. a box switched off).
// Owner: the e2e admin test user (scripts/e2eUsers.js); removed by its cleanup.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const AiCalendarJob = require("../src/models/AiCalendarJob");
const LayoutVariant = require("../src/models/LayoutVariant");
const { pickRecipes } = require("../src/constants/designRecipes");
const { effectiveOptions, aiPaintsProductImage } = require("../src/services/layout/composition");
const { compositionFor } = require("../src/services/ai/calendarPrompts");
const { UPLOADS_DIR } = require("../src/services/ai/uploadPaths");
const { fitBoxToRatio } = require("../src/services/ai/layoutReference");

const COLOURS = [
  ["#5b1a1a", "#d4a73a"],
  ["#123c5a", "#e0b84a"],
];

// `area` = what the real runner maps the AI picture onto: the trim grown to
// the nearest aspect ratio the model supports (e.g. 15×24 → 2:3, wider).
const mockArtwork = async (variant, godFile, i, withProduct, area) => {
  const W = 1696; // ~2K at 2:3
  const H = Math.round((W * area.height) / area.width);
  const k = W / area.width;
  const [bg, gold] = COLOURS[i];
  const box = (role) => (variant.regions || []).find((r) => r.role === role)?.box;
  const cake = box("CAKE_MOUNT");
  const right = box("SIDE_BOX_RIGHT");
  const px = (b) => ({ x: Math.round((b.x - area.x) * k), y: Math.round((b.y - area.y) * k), w: Math.round(b.width * k), h: Math.round(b.height * k) });
  const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><pattern id="p" width="90" height="90" patternUnits="userSpaceOnUse"><circle cx="45" cy="45" r="11" fill="${gold}" opacity="0.4"/><path d="M0 45 Q45 0 90 45 Q45 90 0 45" fill="none" stroke="${gold}" stroke-width="3" opacity="0.3"/></pattern>
<radialGradient id="h"><stop offset="0" stop-color="#fff6c8"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#p)"/>
<ellipse cx="${W / 2}" cy="${H * (0.33 + i * 0.04)}" rx="${W * 0.48}" ry="${H * 0.36}" fill="url(#h)"/>
${Array.from({ length: 11 }, (_, n) => `<circle cx="${40 + n * ((W - 80) / 10)}" cy="${H - 40}" r="34" fill="#e84393" stroke="${gold}" stroke-width="6"/>`).join("")}
${cake ? (() => { const c = px(cake); return `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${bg}"/>`; })() : ""}
${withProduct && right ? (() => { const r = px(right); return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#f6efe0"/>
<path d="M${r.x + r.w * 0.3} ${r.y + r.h * 0.25} l${r.w * 0.12} -${r.h * 0.06} h${r.w * 0.16} l${r.w * 0.12} ${r.h * 0.06} l-${r.w * 0.08} ${r.h * 0.1} l-${r.w * 0.06} -${r.h * 0.04} v${r.h * 0.42} h-${r.w * 0.2} v-${r.h * 0.42} l-${r.w * 0.06} ${r.h * 0.04} z" fill="#b5172f" stroke="${gold}" stroke-width="4"/>
<rect x="${r.x + r.w * 0.2}" y="${r.y + r.h * 0.72}" width="${r.w * 0.6}" height="${r.h * 0.08}" rx="8" fill="#2d6a4f"/>`; })() : ""}
</svg>`);
  const gw = Math.round(W * (i === 0 ? 0.86 : 0.72));
  const god = await sharp(godFile).resize({ width: gw }).png().toBuffer();
  const { height: gh } = await sharp(god).metadata();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${gw}" height="${gh}"><defs><radialGradient id="m" cx="50%" cy="50%" r="50%"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="${gw}" height="${gh}" fill="url(#m)"/></svg>`);
  const soft = await sharp(god).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="90"><text x="${W / 2}" y="64" font-size="54" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="2" font-family="Arial">MOCK AI ${i + 1} — not a real AI image</text></svg>`);
  return sharp(base)
    .composite([
      { input: soft, left: Math.round((W - gw) / 2), top: Math.round(H * (0.02 + i * 0.03)) },
      { input: label, left: 0, top: 6 },
    ])
    .png()
    .toBuffer();
};

(async () => {
  const [variantId, godPhoto, overrides] = process.argv.slice(2);
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await User.findOne({ email: "e2e-admin@identee.test" });
  if (!admin) throw new Error("Run scripts/e2eUsers.js create first");
  const variant = await LayoutVariant.findById(variantId);
  if (!variant) throw new Error("Layout not found");

  // The customer's God photo, as an uploaded design image would be stored.
  const contentDir = path.join(UPLOADS_DIR, "design-content");
  fs.mkdirSync(contentDir, { recursive: true });
  const godName = `e2e-god-${Date.now()}.png`;
  await sharp(godPhoto).png().toFile(path.join(contentDir, godName));

  const raw = {
    language: "tamil",
    showBusinessName: true,
    showLeftBox: true,
    showRightBox: true,
    showTextLine1: true,
    showTextLine2: false,
    rightBoxMode: "image",
    ...(overrides ? JSON.parse(overrides) : {}),
  };
  const content = {
    businessName: "ஸ்ரீ முருகன் டெக்ஸ்டைல்ஸ்",
    productList: "பட்டு சேலைகள், வேட்டிகள்",
    address: "",
    godImage: `/uploads/design-content/${godName}`,
    productImage: null,
    rightBoxText: "",
  };
  const options = effectiveOptions(variant, raw, content, { aiPaintsProduct: aiPaintsProductImage(raw, content) });
  const recipes = pickRecipes("", 2);
  const job = new AiCalendarJob({
    userId: admin._id,
    selectedVariantId: variant._id,
    cutType: variant.cutType,
    sizeCode: variant.sizeCode,
    mode: "ai",
    prompt: "MOCK test job — no AI request was made",
    content,
    options,
    status: "DONE",
    progress: "Done",
    finishedAt: new Date(),
    variations: [],
  });
  const dir = path.join(UPLOADS_DIR, "ai-calendars", String(job._id));
  fs.mkdirSync(dir, { recursive: true });
  const withProduct = options.showRightBox !== false && aiPaintsProductImage(options, content);
  const { box: area } = fitBoxToRatio({ x: 0, y: 0, width: variant.trim.widthMm, height: variant.trim.heightMm }, 0);
  for (let i = 0; i < 2; i += 1) {
    const file = `v${i}-artwork-mock.png`;
    fs.writeFileSync(path.join(dir, file), await mockArtwork(variant, path.join(contentDir, godName), i, withProduct, area));
    job.variations.push({
      index: i,
      variantId: variant._id,
      status: "DONE",
      recipe: recipes[i],
      composition: "FULL_ARTWORK",
      compositionStyle: compositionFor(i, 2).name,
      background: `/uploads/ai-calendars/${job._id}/${file}`,
      backgroundBox: area,
    });
  }
  await job.save();
  console.log(`Mock AI job ${job._id} (${variant.cutType}) — open /calendar/designs/${job._id}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
