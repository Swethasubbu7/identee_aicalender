# Special Die-Cut — what the designer must send

One **design PDF** (exported from CorelDRAW) per Special design, with **one page per size**:
12×18, 15×24, 20×30, 30×40 — in that order. Same way the Die-Cut file `dc cal .pdf` was made.

## On every page

| # | Item | How it must be in the PDF |
|---|------|---------------------------|
| 1 | **Frame artwork** | Its own object(s), **not merged** with the god picture or background |
| 2 | **God picture area** | A sample god picture as a **separate image**, plus a closed outline of the opening (oval / arch) |
| 3 | **Background** | Separate from the frame (optional: an outline marking the area AI may repaint later) |
| 4 | **Business name** | **Live text** (not converted to curves), on its strip |
| 5 | **Text line 1** | Live text, e.g. products ("T-SHIRT, SHIRT, DENIM …") |
| 6 | **Text line 2** | Live text, e.g. address / phone |
| 7 | **Calendar area** | Its box / outline |
| 8 | **Cake rectangle** | Exact size, H × W: 12×18 → **4 × 5 in**, 15×24 → **5 × 7 in**, 20×30 → **7 × 7 in**, 30×40 → **8 × 6.5 in** |
| 9 | **Cutline** | One **closed vector line**, drawn beside the artwork (as in the DC file) **with the cake rectangle drawn again next to it** |
| 10 | **No side boxes** | Special Die-Cut has none |

## Export settings (CorelDRAW → Publish to PDF)

- **Do not** flatten / "export as one bitmap". Keep objects separate.
- **Do not** convert text to curves (for the name and the 2 text lines).
- Images at **300 DPI or more at print size**, **no** strong JPEG compression (the current file is ~83 DPI).
- Fonts embedded.

## Laser file (for the laser team; the app reads the cutline from the design PDF)

- One page per size, **same order** as the design PDF: 12×18, 15×24, 20×30, 30×40.
- The current `spl cal laser.pdf` is wrong: pages are 4×5, 7×5, 8×6.5, **4×5 again**, and **20×30 (7×7) is missing**.

## To confirm with the printer / sir

- The current Special cutlines are bigger than the nominal size (e.g. 15×24 measured 386 × 590 mm).
  Is the Special trim really larger, or should the cutline be exactly 15 × 24 in (381 × 610 mm)? The app allows 2 mm.
- 20×30 cake: drawn 6.67 in tall in the earlier files; the catalogue says 7 × 7 in.
