# Special Die-Cut — status (2026-10-13)

AI stays off (`AI_IMAGE_PROVIDER=none`); nothing here made an AI request.

## Configured in the application

| | |
|---|---|
| Layout | `SPL-GANESHA-OVAL` · Special Die-Cut 12×18 · **DRAFT** (id `6acdcc067e6691fd040171ad`) |
| Source | `spl.pdf` (13 Oct re-export of `spl 1 12 x18.pdf`, identical geometry) + `spl 1 12 x18 laser.pdf` |
| Mapping | `reports/special-12x18-mapping.json` (re-run: `node scripts/setupSpecialDraft.js <design.pdf> <laser.pdf> reports/special-12x18-mapping.json`) |
| Cutline | 304.79 × 457.19 mm, closed 305-segment die-cut path; laser file identical (max 0.01 mm) |
| Cake / calendar | 4 H × 5 W in (127 × 101.6 mm), centred, flush with the bottom; overlaps the lower artwork |
| Text | Business name (plate; the name is curves in the file), Text line 1 → product list, Text line 2 → address — all optional |
| Excluded | `"4X5 INCHES"` guide label (never printed; the app's laser file is built from the cutline + cake only) |
| God image | No fixed god area: with AI on, one request per design paints the whole artwork (deity, frame, background) on the production guide |
| Validation | Structure **FAIL** — only `ARTWORK_RESOLUTION` (85 DPI). Stays DRAFT; DRAFT layouts cannot be used by Generate. |

## Blocks production activation

1. **Artwork 85 DPI** (one 1024 × 1536 px JPEG). Blocks below 150 DPI (`MIN_ARTWORK_DPI`), target 300 DPI = 3600 × 5400 px.
2. **Sample Ganesha flattened into the artwork.** With AI on it is only a style reference (the AI repaints everything); with AI off the preview shows it, and Print Check blocks the export.
3. Preview layers not rendered yet: an admin must press **Refresh preview assets** (Layouts page → layout → Validate step); the app renders them in the browser.

## Files needed

- 12×18 artwork at **300 DPI** (≥ 3600 × 5400 px) on the same artboard and cutline — ideally **without the sample deity**, as a layer or separate PNG (for the AI-off preview); keep the name plate and text-line bar as separate vectors.
- Remove `"4X5 INCHES"` from the design and laser files (already excluded here; cleaner for future imports).
- Special Die-Cut **15×24, 20×30, 30×40** production PDFs + laser PDFs. Until supplied these sizes have no layouts and cannot be selected.

## Open questions (recorded; not blocking the 12×18 draft)

1. **15×24 cake:** the Special spec says 7×5 (H×W); the catalogue and the 15×24 drawings show 5 tall × 7 wide (and the drawings' own label reads "7X5 INCHES", W×H order). Special 15×24 is set to **PENDING** until confirmed (Normal / Die-Cut 15×24 stay 5×7).
2. **Laser cake rectangle:** is it a cutting path (slot for the pad) or only a placement guide? The app's laser file currently draws it like the supplied laser file.
3. **Printer:** minimum DPI, bleed, safe margin, CMYK / ICC profile, cutline spot-colour name and stroke width.
4. **Name font:** the business name is converted to curves; the layout uses *Arial Rounded MT Bold* (the file's text-line font) as a working choice — designs use the recipe fonts.
