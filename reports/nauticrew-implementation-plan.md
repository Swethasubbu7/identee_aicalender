# Nauticrew AI Calendar Tool: implementation plan for 10 improvements

Status: **PLAN ONLY, nothing implemented.** Waiting for approval. Written 2026-11-14 after reading the code on branch `feature/gridfs-shared-storage`.

Safety rules followed throughout:
- No paid AI calls. Every new paid path stays behind the existing `CostConfirmDialog` and `spendGuard`, and is off unless you approve it.
- No layout, PDF, frame, cutline or design file is deleted or overwritten. Storage drivers already refuse overwrites.
- Before every Atlas write: run `node scripts/backupData.js <label>` and ask first.
- Backend tests run only through `npm test`, which preloads `scripts/testSetup.js`.

---

## 1. Architecture as it stands

**Frontend** (`frontend/src`, React 19, MUI 9, react-router 7, fabric 7, pdfjs 6)
- `App.jsx` holds a flat route list: `/`, `/dashboard`, `/layouts`, `/drafts`, `/generated`, `/calendar/customise/:layoutId` (legacy preview layouts), `/calendar/production/:variantId` (the real Customise page), and `/calendar/designs/:jobId`. There is no route guard and no 404 route.
- `main.jsx` wraps the app in a single static light `ThemeProvider` from `theme.js`. `identeeColors.js` holds the flat tokens.
- Every page renders `components/AppSidebar.jsx` itself and passes an `activeKey`. `components/TopBar.jsx` is a placeholder that only shows "U / User".
- Customise is `pages/calender/ProductionCustomise.jsx` (785 lines). It has a Normal/AI toggle, content slots from `utils/contentSlots.js`, `ContentFields.jsx` (`ImageSlot`), a canvas preview (`utils/layoutPreview.js`), autosave to `CalendarDesign`, and Generate with cost confirmation.
- Typography controls already exist but are only used **after** generation, in `pages/calender/DesignDetailsPanel.jsx`: `components/TypographyControls.jsx` (font style and text colour) and `components/TextSizeControls.jsx` (per-slot size %, `utils/textSizes.js`).
- Image print quality already exists: `utils/imageQuality.js` gives the DPI in the slot (ok/low/poor at 150/100 DPI).
- Layout import wizard: `pages/layouts/production/ProductionLayoutDialog.jsx`. Step 0 is `UploadStep`. Step 1 is `SetupStudio` (simple), with `MappingStep` behind "advanced". Step 2 is `ValidateStep`.

**Backend** (`backend/src`, Express 5, Mongoose 9, sharp, pdfjs, pdf-lib, @google/genai)
- Models: `CalendarDesign` (draft, `content.godImage` is a stored path), `AiCalendarJob` (generations; `designId` points to the draft), `LayoutFamily`, `LayoutVariant`, `Layout` (legacy), `CalendarFormat`, `ProductionProfile`, `AiUsageRecord`, `User`. `User.role` exists but **is not checked anywhere**, so there is no admin role today.
- Storage: `services/storage/index.js` picks a driver, `local` or `gridfs`. GridFS (bucket `designFiles`) is used only for keys under `ai-calendars/` and `design-content/` with png/jpg/webp extensions (`keys.js`). Everything else stays on local disk. The GridFS driver never overwrites or deletes, and every file's metadata already records **`sha256`**, width, height, kind and ownerId.
- `/uploads/ai-calendars` and `/uploads/design-content` are private and served through `/api/files` (login or signed link). The local `design-content/` folder is empty, so content images are in GridFS.
- Layout pipeline in `services/layout/`: `pdfImporter`, `pdfAnalysis` (verdicts AUTO/CHOOSE/MANUAL, with `godArea` hard-coded to MANUAL), `mappingSuggestions` (HIGH/MEDIUM confidence), `mappingBuilder`, `layoutValidator` (about 40 checks: TRIM_SIZE, CUTLINE_ALIGNMENT, LASER_MATCH, FRAME_ASSET, FRAME_DPI, SAFE_AREA, BLEED, …), `embeddedRasters`, and `runLayoutValidation`.
- AI: `services/ai/*`, with `spendGuard`, `pricing` and `usageLedger`. The upscaler is pluggable (`UPSCALER_PROVIDER=none` by default). Artwork enhancement already works as **candidate → preview → approve/discard** (`EnhanceDialog.jsx`, `/layout-variants/:id/artwork/enhance`). That is the pattern to reuse.

**Existing reusable image records for a God library: none.** The only God-image references are path strings in `CalendarDesign.content.godImage` and `AiCalendarJob.content.godImage`, plus `designFiles.files` metadata (`kind: "content-image"`, `ownerId`, `sha256`). No collection catalogues images by name or tag. I did **not** connect to Atlas to count existing content images; that is a read-only check I can run if you want it.

---

## 2. Requirements: files, impact and notes

### R1. Remove "Upload Preview Layout" (Layouts page)
- **Files:** `frontend/src/pages/layouts/LayoutPage.jsx` (button at about line 270, `uploadOpen` state, `<UploadLayoutModal>` at about line 474).
- **Change:** remove the button, the state and the modal mount. Keep `UploadLayoutModal.jsx` on disk, unused, so legacy code stays recoverable. The backend legacy upload route stays (no deletion).
- **Affects:** nothing else. Cards, categories, filters, selection and existing legacy layouts all keep working.

### R2. Drafts page: Select All and bulk delete
- **Files:** `frontend/src/pages/DraftProjects.jsx`, `components/DesignCard.jsx` (checkbox), `services/calendarDesignService.js`, `backend/src/controllers/calendarDesign.controller.js`, `routes/calendarDesign.routes.js`.
- **⚠ Conflict with current behaviour:** today's single delete (`deleteDesign`, about line 280) **also deletes the draft's AI generations** (`AiCalendarJob.deleteMany` plus `rm` of `uploads/ai-calendars/<jobId>`). The dialog says so ("and its AI designs will be deleted"). Your requirement says generated designs are never affected.
- **Plan:** add `POST /api/calendar-designs/bulk-delete { ids[] }`. It runs an owner check per id and removes only the `CalendarDesign` documents and their thumbnails. It never touches `AiCalendarJob` or `uploads/ai-calendars/`, and content images are removed only when the existing `isImageInUse` check says nothing else uses them. Jobs keep their `designId` (now dangling), so Generated Designs still lists them. I'd also change single delete to the same safe behaviour; **needs your OK**.
- **UI:** a header bar with "Select all", a count, and "Delete selected (n)". The confirmation dialog lists the drafts by name and states that generated designs and production files are kept.
- **Affects:** the Generated Designs detail page, if it ever links back to the draft. Planned fix: show "draft deleted" instead of a broken link.

### R3. Customise, Normal Mode
Files: `pages/calender/ProductionCustomise.jsx`, `ContentFields.jsx`, `utils/contentSlots.js`, `utils/layoutPreview.js`, `models/CalendarDesign.js`, `calendarDesign.controller.js`, export `services/export/calendarPdf.js` and `utils/composition.js`.

**God image section** (new component `components/GodImagePanel.jsx`, shared with AI Mode):
- Upload (existing `/api/calendar-designs/uploads`), "Choose from library" (R10), thumbnail and Remove.
- **⚠ Behaviour change:** Normal Mode today deliberately **hides** the God upload and keeps the layout's own God picture (`if (slot.key === "godImage" && mode === "normal") return null;` plus `previewImagesFor`). Plan: Normal Mode uses the layout's own God picture **unless** the designer uploads or picks one, which is then placed into `GOD_AREA` (contain-fit, aspect kept). The preview and the Normal-Mode PDF export both need this path. Special Die-Cut (`FULL_ARTWORK`) has no separate God layer, so there it stays AI-only (shown disabled with an explanation).
- **Quality check:** reuse `utils/imageQuality.js`. Show a DPI chip and a warning banner below 150 DPI and below 100 DPI.
- **Background removal:** a button that creates a **candidate** image, shows a before/after preview, and offers Apply/Discard. The original is never replaced. Engine options are in §5.
- **Enhancement:** the same candidate → preview → apply flow as `EnhanceDialog.jsx`. The free local option is a sharp Lanczos resize plus mild sharpen. It is clearly labelled "cannot add real detail". A paid AI upscale appears only if you enable it, behind the cost dialog.
- **Data:** `content.godImage` stays the applied image. New `content.godImageSource { kind: "upload"|"library", libraryId, originalPath, processedFrom, ops:["bg-removed","enhanced"] }`, so the original is always kept and traceable.

**Typography:** move the existing `TypographyControls` and `TextSizeControls` into Customise as a "Text style" section. Add +/- buttons next to the % input (the backend `constants/typography.js` already validates `TEXT_SIZE_MIN/MAX`). Store them on the draft as `content.fontStyle`, `content.textColour` and `content.textSizes`. Pass them to Normal-Mode generation and use them as the starting values in `DesignDetailsPanel`.

**Side content:** separate "Left side" and "Right side" panels. Each has text (multiline) and/or an image upload, and every field is optional. Today the left side is `productList` text and the right side is `productImage` or `rightBoxText` (`rightBoxMode`). The plan adds `leftBoxImage` and `leftBoxMode` to mirror the right side. Existing drafts load unchanged (defaults: left = text, right = image). The preview and export need a left-image draw path, mirroring the right box (`utils/sideBoxPair.js`, `sideBoxStyles.js`).

**Affects:** autosave payload (`toServerContent`/`fromServerContent`), `contentOptions`, Normal-Mode generator, PDF export, print check (`services/export/printCheck.js`, which must measure the new images). This is the highest regression risk in the UI work. I'll add regression tests next to the existing export tests (`scripts/exportRegression.js`).

### R4. Customise, AI Mode
- Same panels as R3, all set before Generate. AI Mode sends `fontStyle`, `textColour` and `textSizes` with the job (the job model already understands these keys after generation).
- Background removal and enhancement here use the **same free local engines** by default. The only paid call stays Generate, with its existing estimate, `spendGuard` limits and confirmation. No new paid call happens without a separate cost dialog **and** your config flag.
- **Files:** `ProductionCustomise.jsx`, `controllers/aiCalendar.controller.js` (accept and validate the new content fields), `models/AiCalendarJob.js` (content sub-fields), `services/ai/calendarPrompts.js` (tell the AI that left and right images are fixed content, not something to repaint).

### R5. Nauticrew branding and splash screen
- **Logo:** I copied the pasted PNG (713×350, white background) to the shared notes folder as `nauticrew-logo-from-chat.png`, because the temp copy may disappear. **Please send the original logo, ideally SVG or a transparent PNG.** A white-background PNG looks wrong in dark mode and in the black sidebar. If no SVG exists, I can trace a clean SVG by hand (free, about 1 hour). It would need your visual approval.
- **Places to change:** `components/AppSidebar.jsx` (logo, "Identee", "AI Calendar Studio"), `pages/Login.jsx` (logo, "IDENTEE" ×3) and `style/Login.css`, `frontend/index.html` (`<title>frontend</title>` → "Nauticrew AI Calendar Studio", favicon), `assets/identeelogo.jpeg` (kept on disk, no longer imported), and backend email texts if any (`register.controller.js` / nodemailer templates; to grep during the work). Colour palette: the yellow (#F2B705-ish) and black of the logo can replace the gold. **Should the gold theme change to Nauticrew yellow/black, or only the logo and name?**
- **Splash:** new `components/SplashScreen.jsx`, rendered once in `App.jsx` before the Login route. It fades in, shows the logo for about 3 s and fades out. A `sessionStorage` flag stops it from showing again on in-app navigation or on a refresh inside the app. It honours `prefers-reduced-motion`.
- **Not renamed** (to avoid breaking things): the folder and repo names, `identeeColors.js` (renamed in code later as a no-behaviour refactor), DB names and storage keys.

### R6. Light/Dark theme
- **Files:** `theme.js` becomes `buildTheme(mode)`. A new `context/ColorModeContext.jsx` wraps `main.jsx`. A toggle goes in a real `TopBar.jsx` header, shown on every page through a shared layout (see R8). `identeeColors.js` tokens become theme-aware (CSS variables).
- **Persistence:** a `localStorage` key `nauticrew.colorMode`, which there is no logout code to clear today, so it survives refresh and login, plus an optional `User.preferences.colorMode` for cross-device memory. The optional part is an Atlas schema-additive change, with a backup first.
- **The real work:** **283 hard-coded hex colours in 31 `.jsx` files**, plus `Login.css`. Every one must move to theme tokens (`text.primary`, `background.paper`, …), or dark mode will be patchy. This is mechanical but wide-reaching.
- **Not themed on purpose:** the calendar canvas preview and print files. Print colours must never change with UI theme. Only the frame around the canvas changes.

### R7. New layout from two PDFs (Production + Laser): auto-analysis → review → save
- **Today:** `UploadStep` imports both PDFs, `pdfAnalysis` and `mappingSuggestions` propose roles, and the designer still works through `SetupStudio`/`MappingStep` and `ValidateStep`.
- **New flow (one dialog, three screens):** Upload two PDFs → *Analysing…* → **Review** (overlay of the detected regions on the rendered page, each with a confidence chip, a "looks right" tick, and a "fix" button only where confidence is low) → Save. Validation runs automatically on save.
- **Backend:** a new `services/layout/autoLayout.js` orchestrates the existing importer, analysis, suggestions, builder and validator, and returns `{ regions[], confidence per role, needsReview[], blockers[] }`. Planned improvements:
  1. **Cutline source auto-chosen:** if the design PDF has no cutline, default to the Laser PDF (the known "Save mapping disabled" pain point).
  2. **Frame PNG auto-extracted** losslessly from the largest transparent RGBA raster that overlaps the trim (like the manual 12×18 import). This removes the separate FRAME upload, and the original PDF is untouched.
  3. **God area heuristic** (new): the largest raster image inside the arch/frame opening above the calendar, or the region enclosed by the frame's transparent window. Marked MEDIUM at best, so the designer must confirm.
  4. **Business name:** prefer live text (largest font size, top half); reject grey repeated background-pattern glyph rows (the DIE-CUT03 false positive) using colour/opacity, repetition, and coverage of the trim.
  5. **Left/right boxes:** filled rectangles or rounded paths beside the cake/calendar area, with the text and images inside them.
  6. **Cake/calendar:** already HIGH (laser cake rectangle ↔ design cake at 0 mm).
  7. **Arch/decoration:** frame raster, plus large decorative vectors outside the text boxes.
  8. **Safe area/bleed:** derived from the trim with `ProductionProfile` values. Shown, not editable.
- **Hard guarantees:** analysis is **read-only** on the PDFs. Geometry is stored only as mm coordinates read from the PDF. Production/laser alignment keeps the existing `CUTLINE_ALIGNMENT`/`LASER_MATCH` checks. Saving is refused if they fail. Nothing is "snapped" or redrawn.
- **Manual correction:** the existing `SetupStudio` region picker, opened only for a role marked low-confidence or failed, not as a separate step.
- **Files:** `ProductionLayoutDialog.jsx` (new step model), `UploadStep.jsx`, new `ReviewStep.jsx` (reusing `SetupStudio` canvas pieces), `productionLayout.controller.js` (new `POST /:id/auto-setup`), `services/layout/pdfAnalysis.js`, `mappingSuggestions.js`, `embeddedRasters.js`, and new `autoLayout.js`.

### R8. Sidebar navigation
Bugs found in `components/AppSidebar.jsx` and `App.jsx`:
- **"Settings" goes to `/dashboard`** (no Settings page exists), so the wrong item looks active. Plan: a simple `/settings` page with theme and profile (fits R6), or hide the item. **Your choice.**
- **"Create New Project" and "Layouts" both go to `/layouts`.** Only "Layouts" highlights, and `creatingProject` never resets.
- **Active state is passed by hand** (`activeKey="layouts"` on Customise and AIDesigns). Replace with `useLocation()`-based matching (`NavLink`).
- **No catch-all route,** so a bad URL shows a blank page. Add a `*` route that shows a 404 with a "Back to dashboard" button.
- **No auth guard,** so direct URLs render pages that then fail their API calls. Add `<RequireAuth>`, which redirects to `/` and returns afterwards.
- **Small screens:** the sidebar shrinks to 64 px icons but is always visible. Plan: a temporary MUI `Drawer` with a hamburger in the TopBar below `md`.
- Vite dev already serves `index.html` for deep links. For production hosting, add the SPA fallback (document it, or `vite preview` config).
- **Files:** `App.jsx` (a new `AppShell` layout route with sidebar and topbar, so pages stop rendering `AppSidebar` themselves), `AppSidebar.jsx`, `TopBar.jsx`, and every page that renders `<AppSidebar>` (7 files).

### R9. Remove Mapping and Validation screens from the designer workflow
- Remove `MappingStep` and `ValidateStep` from the wizard's step bar in `ProductionLayoutDialog.jsx`. The flow becomes Upload → Review → Save (R7).
- Validation runs automatically through `runLayoutValidation` on save and on activate. The result shows as a status chip on `ProductionLayoutCard.jsx`, with a "Details" drawer that lists FAIL/WARN in plain language. Nothing is hidden: a FAIL still blocks activation.
- Keep `MappingStep.jsx` and `ValidateStep.jsx` files, reachable only through an "Advanced (technical)" link for admins. They are not deleted, because existing variants were built with them.
- **Affects:** `LayoutPage.jsx` (opens the dialog at a step), `ProductionLayoutCard.jsx`, and `layoutVariantService.js`.

### R10. Default God-image library
**Data model** (new collection, no duplicate bytes):
```
GodImage {
  name: "Vinayagar", slug, aliases: ["Pillaiyar","Ganesha","Ganapathi","Vinayaka"],
  tags: ["vinayagar","ganesha", …]  (lower-case, indexed),
  category?, sortOrder, active (soft-hide instead of delete),
  file: { stored: "/uploads/god-library/<sha256>.png", sha256, widthPx, heightPx, contentType, bytes },
  thumb: { stored: "/uploads/god-library/thumbs/<sha256>-512.webp" },
  createdBy, updatedBy, timestamps
}
```
- **Storage:** add `"god-library/"` to `SHARED_PREFIXES` in `services/storage/keys.js`, so library images go to the same GridFS bucket, shared by every computer. The key is the **sha256 of the bytes**, so uploading the same picture twice reuses one file (the `saveFile` "exists" path returns the existing key). Originals are stored byte-for-byte (no recompression), so quality and aspect ratio are kept. Only a separate small WebP thumbnail is made with sharp for the search grid.
- **Reuse without copying:** selecting a library image sets `content.godImage` to the library's stored path and `godImageSource.kind = "library"`. No copy is made. `deleteDesign`/bulk-delete must **never** remove `god-library/` files. Planned guard: `isImageInUse` plus an explicit prefix exclusion.
- **Optional dedupe of designer uploads:** `uploadContentImage` can check the GridFS sha256 index and reuse an identical existing file. This is low risk and saves space.
- **Search:** `GET /api/god-images?q=pillaiyar` does a case-insensitive prefix match on name, aliases and tags. It returns thumbnails through `/api/files` (signed links, same as now). There is no AI call, no external service and no embedding.
- **Admin screen:** a new page `/library/gods` with a grid, add (multi-upload), edit name/aliases/tags, reorder, and hide/unhide. **No admin role exists today** (`User.role` is never checked). Options: (a) start checking `User.role === "admin"` and set it on chosen accounts (Atlas write, backup first); (b) an `ADMIN_EMAILS` env list. **Your choice.**
- **Customise picker:** `components/GodLibraryPicker.jsx` is a dialog with a search field, a thumbnail grid and Select, in both modes. If the search finds nothing it shows "Upload your own" (the existing upload). It never auto-replaces a designer's uploaded image: picking always needs a click, and if an uploaded image exists the dialog asks "Replace your uploaded image?".
- **Seed content:** I don't have Vinayagar, Murugan, Lakshmi, Saraswathi or Amman images that are clear to use. The admin uploads them. **I will not generate them with AI** without approval, which would be paid.
- **Files:** new `backend/src/models/GodImage.js`, `controllers/godImage.controller.js`, `routes/godImage.routes.js`, `index.js` (mount), `services/storage/keys.js`, `calendarDesign.controller.js` (delete guards, `godImageSource`), frontend `services/godImageService.js`, `pages/library/GodLibraryPage.jsx`, `components/GodLibraryPicker.jsx`, and `AppSidebar.jsx` (admin-only item).

---

## 3. Stages (each ends with testing, a demo to you and your go-ahead)

| Stage | Contents | Risk | Rough effort |
|---|---|---|---|
| **0. Safety net** | Backup script run (no writes yet). Baseline `npm test` and `scripts/exportRegression.js` snapshots. Browser screenshots of every page for before/after comparison. | none | 0.5 day |
| **1. Quick wins** | R1 (remove button), R8 (AppShell, NavLink active state, 404, auth guard, Settings fix, mobile drawer), R2 (safe bulk delete). | low | 1.5–2 days |
| **2. Branding and theme** | R5 (logo, name, title, favicon, splash), R6 (theme factory, toggle, persistence, migrate 283 hex colours page by page). | low-medium (visual) | 3–4 days |
| **3. God-image library** | R10 backend (model, GridFS prefix, sha256 dedupe, API, admin page), then the picker in Customise. No changes to how generation works yet. | medium | 3 days |
| **4. Customise Normal + AI** | R3 and R4: GodImagePanel (upload, library, quality, local bg-removal and enhance with preview), typography before generation, left/right text+image. Preview, export and print check updated, with regression tests. | **high** (touches print output) | 5–6 days |
| **5. Automatic layout setup** | R7 and R9: `autoLayout.js`, frame auto-extract, cutline default, better name and God-area heuristics, Review screen, background validation, Mapping/Validate hidden behind "Advanced". Tested against **every existing layout's PDFs** (re-analyse read-only and compare with their saved, validated mappings). | **high** (detection) | 6–8 days |

Order rationale: stages 1–2 are visible and safe. Stage 3 must exist before stage 4 can offer "choose from library". Stage 5 is independent and can run in parallel after stage 1 if you want.

---

## 4. What existing functionality could be affected

- **Draft deletion semantics** (R2): AI generations are no longer deleted with a draft. Storage can grow, because generated files are kept.
- **Normal-Mode output** (R3): adding a customer God image to Normal Mode changes what Normal Mode produces. The default with no upload is unchanged. Exports and print checks need the new path.
- **Saved drafts:** new content fields are additive with defaults, so old drafts open exactly as before.
- **AI job payload** (R4): new optional fields. Old jobs still render.
- **Layout wizard** (R7/R9): existing ACTIVE layouts are untouched. Only new imports use the new flow. Re-setup of an old layout keeps its saved mapping unless the designer saves a new version (versioning already exists).
- **All page styling** (R6): every page's colours move to theme tokens. Visual regressions are possible, so I'll compare screenshots per page in both modes.
- **Navigation** (R8): pages stop rendering their own sidebar. The auth guard redirects users with expired tokens to login (today they see failing pages).
- **Storage keys** (R10): adding a GridFS prefix changes where `god-library/` files live. Existing keys are unaffected.

---

## 5. Technical limits (honest view)

**Automatic PDF analysis**
- PDFs carry no semantic labels. "This is the God area" or "this is the business name" is inferred from geometry, colour, raster vs vector, and position. It works well for things that are geometrically unique (cutline, cake rectangle, trim, live text). It is **inherently uncertain** for artwork-driven roles: God area, arch/decoration, and lettering converted to curves.
- Expect HIGH confidence on the cutline, trim, cake/calendar and live-text name. Expect MEDIUM on side boxes and the frame. The God area and decorations will often need confirmation, especially when artwork is one flattened image (no separate layers), which makes them impossible to separate reliably without image AI.
- Text converted to outlines (no live text) cannot be read without OCR. Rasterised text can't be told apart from artwork without vision AI.
- Different designers build PDFs differently (clip masks, nested groups, spot colours named arbitrarily). Each new "family" style may need a heuristic tweak the first time.
- Therefore "fully automatic" means **auto-proposed, with confidence**. Low-confidence roles always go to the designer as one-click confirm/fix. Nothing low-confidence is saved silently.
- An optional vision-LLM labeller (paid, about ₹1–4 per layout) could raise God-area/arch accuracy. **Not planned** unless you ask.

**God-image library**
- Search is by name, alias and tag only (no "find similar picture"). Good aliases matter. I'll pre-seed alias lists for the five deities named, and the admin can extend them.
- Exact duplicates (same bytes) are detected. Near-duplicates (the same picture re-saved or resized) are not. Perceptual hashing is possible later, at no cost.
- Image rights and licensing of uploaded deity art are the admin's responsibility.
- **Atlas storage:** GridFS bytes count against the cluster's storage. If the cluster is M0 (512 MB free tier), 100 images at about 5 MB each would nearly fill it. **Please tell me the Atlas tier.** If space is tight, keep library originals on local disk (`local` driver) at the cost of not sharing across computers, or move to object storage later.

**Background removal and enhancement**
- Local background removal (U²-Net/ISNet/BiRefNet ONNX models) works well on clean subjects. It struggles with fine hair, halos, ornate jewellery against busy temple backgrounds, and low-resolution images. That's why a preview and Apply/Discard are mandatory, and the original is always kept.
- Local "enhancement" (sharp resize and sharpen) improves edges but cannot invent detail. A very low-DPI image will still warn. Only AI upscaling adds detail, and that is paid.
- Running ONNX models on CPU takes about 2–10 s per image on the backend. Model files are 40–180 MB.
- **Licence note:** `@imgly/background-removal(-node)` is **AGPL-3.0**, so avoid it in a commercial closed app. `rembg` (MIT) or `onnxruntime-node` with an Apache/MIT model (ISNet, BiRefNet) is safe.

---

## 6. Paid services: none required

Everything above can be done **free**. Optional paid upgrades, with indicative prices (to re-check on each vendor's pricing page before enabling; ₹ at about 84/USD):

| Feature | Free default | Optional paid | Indicative cost |
|---|---|---|---|
| Background removal | Local ONNX (ISNet/BiRefNet) on the backend | remove.bg API / Photoroom API / Gemini image edit (already configured) | remove.bg about $0.20–0.90 per image depending on plan; Photoroom about $0.02 per image; Gemini edit about $0.13 per image (about ₹11 + GST) |
| Enhancement/upscale | sharp Lanczos and sharpen; optionally local Real-ESRGAN ONNX (free, slow on CPU, about 20–60 s) | Existing `imageModelUpscaler` (Gemini) / Replicate Real-ESRGAN / Claid.ai | Gemini about $0.13–0.24 per image; Replicate about $0.002–0.01 per run; Claid about $0.05–0.10 per image |
| Layout detection | Heuristics (planned) | Vision-LLM labelling per import | About $0.01–0.05 per layout |
| God library images | Admin uploads | AI-generated deity images | About $0.07–0.24 per image; **not recommended**, and needs approval |
| Fonts/branding | Google Fonts, hand-traced SVG logo | none | — |
| Storage | Existing Atlas GridFS | Atlas tier upgrade, or S3/R2 object storage if GridFS fills up | Depends on tier (e.g. Atlas M10 about $57/month; Cloudflare R2 about $0.015/GB-month) |

All existing paid AI (Generate) keeps its cost estimate, `spendGuard` caps and confirmation. Any optional paid provider is added only behind a config flag that is off by default, plus the same confirmation dialog.

---

## 7. Decisions needed from you before starting

1. **R2:** should single-draft delete also stop deleting AI generations (the safe behaviour), like bulk delete?
2. **R5:** the original logo file (SVG or transparent PNG). And should the UI accent colour switch from gold to Nauticrew yellow/black?
3. **R8:** build a small Settings page (theme and profile), or hide "Settings"?
4. **R10:** how admins are identified: `User.role` (Atlas write) or an `ADMIN_EMAILS` env list?
5. **R10:** the Atlas cluster tier and storage headroom for the library.
6. **R3/R4:** OK to add a local ONNX background-removal model (about 40–180 MB, free), or keep background removal paid-only (off)?
7. Which stages to approve now. My suggestion is to start with stages 0–1.
