# Production readiness checks — 2026-10-13

All checks are read-only and make no AI request (AI_IMAGE_PROVIDER=none).

## Export regression (npm run check:exports)
```
Approved production layouts (VALIDATED/ACTIVE): 5  (AI provider: none)

■ DC-MURUGAN-LOTUS  die-cut 12x18
   PASS Layout validation (structure) — all structure rules pass
   PASS Trim = catalogue size — 304.8×457.2 mm vs 304.8×457.2 mm
   PASS Print PDF page = trim + margin — 324.8×477.2 mm
   PASS Print PDF TrimBox = calendar — 304.8×457.2 mm at 10 mm margin
   PASS Print raster ≥ 300 DPI (working value) — 3600×5400 px embedded = 300 DPI
   WARN Production-file artwork ≥ 300 DPI — 1254×1254 px over 247.8×247.8 mm = 129 DPI; 2400×2530 px over 304.8×321.4 mm = 200 DPI; 2401×1028 px over 305×130.6 mm = 200 DPI
   PASS Laser cutline closed, trim size, at margin — 304.8×457.2 mm at (10, 10), 309 segments
   PASS Laser page = print page — 324.8×477.2 mm
   PASS Cake = catalogue size (H × W) — 4×5 in drawn vs 4×5 in (CONFIRMED)
   PASS Cake centred horizontally — 0 mm from centre
   PASS Cake inside the calendar — 7 mm above the bottom edge
   PASS Laser cake = layout cake position — (88.9, 348.6) mm
   PASS Print Check runs — WARN: Approved layout WARN; Bleed PENDING; Safe area PENDING; Colour mode PENDING; Print resolution PENDING

■ dc-02  die-cut 15x24
   PASS Layout validation (structure) — all structure rules pass
   PASS Trim = catalogue size — 381×611.4 mm vs 381×609.6 mm
   PASS Print PDF page = trim + margin — 401×631.4 mm
   PASS Print PDF TrimBox = calendar — 381×611.4 mm at 10 mm margin
   PASS Print raster ≥ 300 DPI (working value) — 4500×7221 px embedded = 300 DPI
   WARN Production-file artwork ≥ 300 DPI — 1270×283 px over 278.1×61.9 mm = 116 DPI; 1254×1254 px over 283.5×283.5 mm = 112 DPI; 3000×3359 px over 381×426.6 mm = 200 DPI; 3001×1487 px over 381.2×188.9 mm = 200 DPI; 3001×1487 px over 381.1×188.9 mm = 200 DPI; 669×963 px over 85×122.4 mm = 200 DPI
   PASS Laser cutline closed, trim size, at margin — 381×611.4 mm at (10, 10), 243 segments
   PASS Laser page = print page — 401×631.4 mm
   PASS Cake = catalogue size (H × W) — 5×7 in drawn vs 5×7 in (CONFIRMED)
   PASS Cake centred horizontally — 0 mm from centre
   PASS Cake inside the calendar — 31.9 mm above the bottom edge
   PASS Laser cake = layout cake position — (101.6, 452.5) mm
   PASS Print Check runs — WARN: Approved layout WARN; Bleed PENDING; Safe area PENDING; Colour mode PENDING; Print resolution PENDING

■ dc-03  die-cut 15x24
   PASS Layout validation (structure) — all structure rules pass
   PASS Trim = catalogue size — 381×611.4 mm vs 381×609.6 mm
   PASS Print PDF page = trim + margin — 401×631.4 mm
   PASS Print PDF TrimBox = calendar — 381×611.4 mm at 10 mm margin
   PASS Print raster ≥ 300 DPI (working value) — 4500×7221 px embedded = 300 DPI
   WARN Production-file artwork ≥ 300 DPI — 1270×283 px over 278.1×61.9 mm = 116 DPI; 1254×1254 px over 283.5×283.5 mm = 112 DPI; 3000×3359 px over 381×426.6 mm = 200 DPI; 3001×1487 px over 381.2×188.9 mm = 200 DPI; 3001×1487 px over 381.1×188.9 mm = 200 DPI; 669×963 px over 85×122.4 mm = 200 DPI
   PASS Laser cutline closed, trim size, at margin — 381×611.4 mm at (10, 10), 243 segments
   PASS Laser page = print page — 401×631.4 mm
   PASS Cake = catalogue size (H × W) — 5×7 in drawn vs 5×7 in (CONFIRMED)
   PASS Cake centred horizontally — 0 mm from centre
   PASS Cake inside the calendar — 31.9 mm above the bottom edge
   PASS Laser cake = layout cake position — (101.6, 452.5) mm
   PASS Print Check runs — WARN: Approved layout WARN; Bleed PENDING; Safe area PENDING; Colour mode PENDING; Print resolution PENDING

■ NCN/02  normal 10x15
   PASS Layout validation (structure) — all structure rules pass
   PASS Trim = catalogue size — 254×381.7 mm vs 254×381 mm
   PASS Print PDF page = trim + margin — 274×401.7 mm
   PASS Print PDF TrimBox = calendar — 254×381.7 mm at 10 mm margin
   PASS Print raster ≥ 300 DPI (working value) — 3000×4508 px embedded = 300 DPI
   WARN Production-file artwork ≥ 300 DPI — 1254×1254 px over 245×245.7 mm = 130 DPI; 2001×857 px over 254.2×108.9 mm = 200 DPI; 447×642 px over 56.8×81.5 mm = 200 DPI
   PASS Laser cutline closed, trim size, at margin — 254×381.7 mm at (10, 10), 18 segments
   PASS Laser page = print page — 274×401.7 mm
   PASS Cake = catalogue size (H × W) — 3.5×4 in drawn vs 3.5×4 in (CONFIRMED)
   PASS Cake centred horizontally — 0 mm from centre
   PASS Cake inside the calendar — 6.1 mm above the bottom edge
   PASS Laser cake = layout cake position — (76.2, 286.7) mm
   PASS Print Check runs — WARN: Approved layout WARN; Bleed PENDING; Safe area PENDING; Colour mode PENDING; Print resolution PENDING

■ NCN/02  normal 12x18
   PASS Layout validation (structure) — all structure rules pass
   PASS Trim = catalogue size — 304.8×458 mm vs 304.8×457.2 mm
   PASS Print PDF page = trim + margin — 324.8×478 mm
   PASS Print PDF TrimBox = calendar — 304.8×458 mm at 10 mm margin
   PASS Print raster ≥ 300 DPI (working value) — 3600×5409 px embedded = 300 DPI
   WARN Production-file artwork ≥ 300 DPI — 1254×1254 px over 294×294.9 mm = 108 DPI; 2401×1028 px over 305×130.6 mm = 200 DPI; 535×771 px over 68×97.9 mm = 200 DPI
   PASS Laser cutline closed, trim size, at margin — 304.8×458 mm at (10, 10), 18 segments
   PASS Laser page = print page — 324.8×478 mm
   PASS Cake = catalogue size (H × W) — 4×5 in drawn vs 4×5 in (CONFIRMED)
   PASS Cake centred horizontally — 0 mm from centre
   PASS Cake inside the calendar — 9.5 mm above the bottom edge
   PASS Laser cake = layout cake position — (88.9, 346.9) mm
   PASS Print Check runs — WARN: Approved layout WARN; Bleed PENDING; Safe area PENDING; Colour mode PENDING; Print resolution PENDING

Totals: 60 pass, 5 warn, 0 fail
```

## Special Die-Cut 12×18 supplied files (npm run check:production-files)

Mapping used: reports/special-12x18-mapping.json
```
PASS  Design file pages — 1 page(s); page 762×1016 mm
PASS  Laser file pages — 1 page(s); page 381×508 mm
WARN  Import object limit — 7167 objects; only the first are kept for mapping (small shapes, e.g. text converted to curves)
PASS  Calendar size (cutline) — 304.8×457.2 mm vs 12×18 in
PASS  Registration — cutline drawn 753.96, 0 mm away; aligned by the twin mark
PASS  Artwork on the page — calendar at (228.61, 279.41) mm on a 762×1016 mm page
PASS  Laser cutline = design cutline — laser 304.8×457.2 mm, 305 vs 305 segments, max point deviation 0.01 mm
PASS  Cake size (H × W) — 4×5 in drawn vs catalogue 4×5 in
PASS  Cake centred horizontally — 0 mm from centre
INFO  Cake position — top at 355.6 mm, 0 mm above the bottom edge
INFO  Cake arrangement — cake OVERLAPS the lower artwork (no separate cake space)
PASS  Laser cake = design cake — offset 0, 0 mm
WARN  NAME_TEXT is live text — no text object — converted to curves (the app draws its own text there)
PASS  TEXT_LINE_1 is live text — "T-SHIRT, SHIRT, DENIM, TROUSERS, SPORTSW" ArialRoundedMTBold 10.8 pt
PASS  TEXT_LINE_2 is live text — "SHOP NO. 503, DOOR NO 5816/32-A, SHRUTHI" BerlinSansFB-Bold 12.4 pt
FAIL  Guide labels — "4X5 INCHES", "4X5 INCHES" — would print / be sent to the laser
FAIL  Raster p1-2 (whole artwork flattened in one image) — 1024×1536 px over 304.9×457.2 mm = 85 DPI (target 300)
FAIL  Validator REQUIRED_REGION — Missing GOD_AREA region.
FAIL  Validator REQUIRED_REGION — Missing CALENDAR_AREA region.
TODO  Validator TEXT_STYLE — NAME_TEXT has no text style/font.
TODO  Validator FRAME_ASSET — FRAME region has no frame artwork file.
FAIL  Validator structure result — cannot be activated

5 fail, 4 warn → NOT READY — do not activate
```

## AI readiness (npm run ai:readiness)
```
AI READINESS (no AI request is made by this report)

AI switch (AI_IMAGE_PROVIDER):   none  → AI OFF
Real API key present:            no (value never shown)
Model (GEMINI_IMAGE_MODEL):      gemini-3.1-flash-image
Resolution (GEMINI_IMAGE_SIZE):  2K
Official price:                  $0.101 per image; tokens $0.5 in / $3 text+thinking / $60 image per 1M
Price source:                    ai.google.dev/gemini-api/docs/pricing (checked 2026-10-12; not yet on this account's bill)

Estimated cost, 1 image:         ₹59.38 incl. GST (LIST_PRICE_ESTIMATE)
Estimated cost, 2 designs:       ₹118.76 incl. GST — 2 requests
Basis:                           Official list price $0.101 per 2K image × 5.1897 billed overhead × ₹96/USD + 18% GST. Not a measurement — replaced by measured costs after the first recorded requests. (Google Cloud Billing, 1–9 Oct 2026 (gemini-3-pro-image, 2K): billed 5.19× the list image price per request)

Application budget:              not set (AI_BUDGET_INR)
Daily limit:                     not set (AI_DAILY_LIMIT_INR)
Max per Generate:                not set (AI_MAX_COST_PER_GENERATE_INR)
Recorded so far:                 0 requests, ₹0.00; unresolved UNKNOWN-cost: 0
Google's real balance:           check Google AI Studio → Billing (not readable by this app)

Spending checks would refuse a Generate:
  - No application budget is set (AI_BUDGET_INR).
  - No daily spending limit is set (AI_DAILY_LIMIT_INR).
  - No maximum cost per Generate is set (AI_MAX_COST_PER_GENERATE_INR).
```
