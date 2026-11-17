# Nauticrew Platform — Audit & Architecture Proposal

Date: 17 Nov 2026 · Status: **proposal, awaiting approval** · No code was changed for this report.

---

## 1. Audit — what exists today

### 1.1 Repositories on this computer

| Folder | What it is | Relevance |
|---|---|---|
| `D:\identee-aicalender\identee_aicalender` | **The Calendar Tool** (GitHub `Swethasubbu7/identee_aicalender`, branch `feature/gridfs-shared-storage`, ~126 uncommitted changes from recent work) | The base for the whole platform |
| `D:\AIcalander` | A **second, older clone** of the same repo (`main`, 3 commits behind, 25 local changes) | Risk of confusion — should be archived, not developed in |
| `D:\tamilans2\Tamilans-EcomV2` | An e-commerce project of **another organisation** (`Athithyan00`) | **Not reused** (different owner/licence); ideas only |
| `D:\RR-IMPLEX`, `D:\Vyavar`, `D:\Reactfolder`, `D:\react*` | Unrelated projects / practice folders | Not relevant |

**There is no existing Nauticrew landing page, e-commerce code, product data, hosting configuration or domain configuration** in any repository on this computer.

### 1.2 Frontend (Calendar Tool)
- React 19 + Vite + MUI 9 + react-router 7, **JavaScript** (no TypeScript). fabric, pdfjs-dist.
- Routes: `/` (login), `/dashboard`, `/layouts`, `/drafts`, `/generated`, `/settings`, `/calendar/customise/:layoutId`, `/calendar/production/:variantId`, `/calendar/designs/:jobId`.
- Already built and reusable: Nauticrew branding (logo, splash, light/dark theme with `--nc-*` tokens), `AppSidebar`, `TopBar`, `RequireAuth`, auth helpers, axios services, God-image library, design editing panels, download helpers.
- API base from `VITE_API_URL` (default `http://localhost:5000`).

### 1.3 Backend (Calendar Tool)
- Node + Express 5 + Mongoose 9, JavaScript. bcryptjs, jsonwebtoken, multer, nodemailer, sharp, pdf-lib, pdfjs, `@google/genai`.
- APIs: `/api/auth` (login, register + email OTP), `/api/layouts`, `/api/layout-variants`, `/api/layout-families`, `/api/calendar-designs`, `/api/ai-calendars`, `/api/ai-usage`, `/api/god-images`, `/api/files`, `/api/calendar-formats`, `/api/production-profiles`, `/api/ai-generate`, transliterate.
- Calendar features: Normal Mode, AI Mode (Nano Banana 2.1, 2K, spend guard + usage ledger), production layouts from 2 PDFs, print check, print/cutline PDF export, post-generation editing, layout downloads, GridFS shared storage.
- Tests: 237 (230 pass, 7 pending), run only via `npm test` (AI forced off).

### 1.4 Database (MongoDB Atlas, read-only check)
- Cluster tier **M0 (free, 512 MB limit)**; database name is **`test`** (the connection string names no database). Data ≈ 47 MB, storage ≈ 60 MB.
- Collections: `aicalendarjobs` 103 · `aiusagerecords` 103 · `calendardesigns` 49 · `calendarformats` 13 · `calendarsizes` 7 · `designFiles` (GridFS, 61 files) · `godimages` 1 · `layoutfamilies` 21 · `layouts` 23 · `layoutvariants` 22 · `productionprofiles` 1 · `users` 2 (1 ADMIN, 1 STAFF).
- Plus ≈ 172 MB of files in `backend/src/uploads` on this computer.

### 1.5 Authentication today
- One `users` collection; JWT (1 day) in the browser, `Authorization: Bearer`.
- **Critical:** anyone can self-register (email OTP) and immediately gets **full staff access** to the Calendar Tool, including paid AI generation — the `role` field is not checked anywhere.
- OTP is printed to the server log, kept in memory, has no attempt limit; no rate limiting; CORS accepts every origin; no security headers.

### 1.6 Hosting, domain, assets
- No deployment files (no Docker, Nginx, Vercel/Render/PM2 config) and no domain in the code. **Domain, DNS and hosting must come from you.**
- The Google Drive screenshot of category folders was **not received** in this conversation; the 41 category names are taken from your typed list. Product photos, prices, stock and descriptions do not exist in the project yet.

### 1.7 Reuse summary

| Reuse as-is | Reuse with changes | Build new |
|---|---|---|
| Calendar Tool (Normal + AI Mode, layouts, exports, editing) | Auth (add audiences, roles, permissions, reset password, rate limits) | Landing page + 3D |
| Storage layer (GridFS/local) & file links | `users` → staff accounts with module roles | Catalogue, cart, checkout, payments, orders, invoices |
| Branding, theme tokens, sidebar, top bar | Routing (move tool under `/calendar/staff`) | E-commerce customer & staff panels |
| Mail sending (nodemailer) | Mail (move to a transactional provider) | Calendar customer panel, approvals, calendar orders |
| Test setup & AI safety guards | Express app (security middleware) | Audit log, notifications, CMS content |

---

## 2. Recommended overall architecture

**One repository, one backend, one frontend, one domain.**

```
                        https://<your-domain>
                                 │
                       Reverse proxy (Nginx / host rewrites)
              ┌──────────────────┴──────────────────┐
     /  /about  /shop/*  /calendar/*            /api/*
     React SPA (Vite build, code-split)      Node/Express (one process)
     prerendered public pages for SEO        modules: auth · catalog · cart ·
                                             orders · payments · cms ·
                                             calendar (existing) · calendar-portal
                                                     │
                                  MongoDB Atlas (paid tier)  +  object storage (images/PDFs)
                                  Razorpay (payments)  ·  transactional e-mail
```

Why this shape:
- Same origin for site and API → simple cookies, no CORS, one certificate.
- One Express server keeps the Calendar Tool's long-running AI jobs, `sharp` and PDF work (serverless functions would not suit them).
- **Code splitting** keeps each section light: Three.js loads only on the landing page; pdfjs/fabric only in the Calendar Staff panel.
- **SEO:** a plain SPA is weak for Google. Public pages (`/`, `/about`, `/contact`, `/shop`, category and product pages) are **prerendered at build time** with meta tags, structured data and a sitemap. If SEO needs grow, the storefront can later move to server rendering without touching the panels.

---

## 3. One-domain routing

The existing tool uses `/dashboard`, `/layouts`, `/calendar/...`. They move under `/calendar/staff/...`; **old URLs redirect** so bookmarks keep working.

| Section | Routes |
|---|---|
| Corporate site (public) | `/` · `/about` · `/products` · `/industries` · `/contact` · `/privacy` · `/terms` · `/shipping-returns` |
| Shop (public) | `/shop` · `/shop/categories` · `/shop/category/:slug` · `/shop/product/:slug` · `/shop/cart` · `/shop/checkout` · `/shop/order/:orderNo/confirmation` · `/shop/bulk-enquiry` |
| Shop customer | `/shop/account/login` · `/register` · `/forgot-password` · `/reset-password` · `/shop/account` (dashboard) · `/orders` · `/orders/:orderNo` · `/addresses` · `/wishlist` · `/payments` · `/profile` · `/support` |
| Shop staff | `/shop/staff/login` · `/shop/staff` (dashboard) · `/categories` · `/products` · `/inventory` · `/orders` · `/customers` · `/payments` · `/coupons` · `/shipping` · `/invoices` · `/reports` · `/content` · `/staff` |
| Calendar entry | `/calendar` (public intro, links to both logins) |
| Calendar customer | `/calendar/customer/login` · `/register` · `/forgot-password` · `/calendar/customer` (dashboard) · `/designs` · `/designs/:shareId` (preview & approval) · `/orders` · `/orders/:orderNo` |
| Calendar staff | `/calendar/staff/login` · `/calendar/staff` (dashboard) · `/jobs` · `/jobs/:id` · `/create` · `/layouts` · `/drafts` · `/generated` · `/designs/:jobId` · `/customise/:layoutId` · `/production/:variantId` · `/approvals` · `/orders` · `/customers` · `/staff` · `/settings` |
| Redirects (old → new) | `/dashboard` → `/calendar/staff` · `/layouts` → `/calendar/staff/layouts` · `/drafts`, `/generated`, `/settings`, `/calendar/designs/*`, `/calendar/customise/*`, `/calendar/production/*` → same pages under `/calendar/staff/...` |

Product URLs use **slugs** (e.g. `/shop/product/jute-tote-bag-classic`), not database IDs — better for SEO and does not expose IDs.

**API namespaces** (one backend): `/api/auth/*` · `/api/catalog/*` (public) · `/api/cart/*`, `/api/checkout/*`, `/api/account/*` (shop customer) · `/api/shop-admin/*` (shop staff) · `/api/payments/webhook/razorpay` · `/api/cms/*` · `/api/calendar-portal/*` (calendar customer) · existing calendar APIs stay at their paths, now requiring **calendar staff** permission.

---

## 4. Folder structure

The existing Calendar Tool files **stay where they are** at first (moving 100+ working files is risk without benefit); new code goes beside them in modules.

```
frontend/src/
  app/              router, lazy section loading, providers, redirects
  shared/           ui kit (buttons, cards, forms, tables), theme, api client,
                    auth client (per audience), hooks, formatting (₹, GST)
  site/             landing page, about, contact, industries; 3d/ (hero scene)
  shop/             storefront: home, categories, product, cart, checkout
  shop-account/     shop customer panel
  shop-staff/       shop staff/admin panel
  calendar-portal/  calendar customer panel (previews, approvals, orders)
  calendar-staff/   staff shell + new pages (jobs, approvals, orders, staff);
                    existing pages/, components/, utils/ of the tool are reused
backend/src/
  core/             auth (tokens, audiences), permissions, rate limits,
                    security headers, validation, audit log, mail, notifications
  modules/
    catalog/        categories, products, images, inventory
    cart/  orders/  payments/  coupons/  shipping/  invoices/  cms/  customers/  staff/
    calendar-portal/ customer-facing design shares, approvals, calendar orders
    calendar-jobs/  staff job workflow (assignments, versions, approvals, orders)
  (existing controllers/routes/models/services of the Calendar Tool unchanged)
```

---

## 5. Database schema (new collections)

Existing calendar collections stay. Suggested database name: **`nauticrew`** (moving out of `test` needs a planned copy — only with your approval).

| Collection | Key fields | Indexes |
|---|---|---|
| `staffusers` (evolves `users`) | name, email, passwordHash, active, **roles**: { platform: "SUPER_ADMIN"?, shop: "ECOM_ADMIN" \| "SALES" \| "INVENTORY" \| "ACCOUNTS"?, calendar: "CAL_ADMIN" \| "CAL_MANAGER" \| "DESIGNER" \| "PRODUCTION"? }, mfaEnabled, lastLoginAt | email (unique) |
| `customers` | name, email, phone, passwordHash, **portals**: { shop, calendar }, businessName, gstin, emailVerified, status | email (unique), phone |
| `authsessions` | userRef, audience, refreshTokenHash, ip, userAgent, expiresAt, revokedAt | userRef, expiresAt (TTL) |
| `passwordresets` / `otpcodes` | subjectRef, codeHash, attempts, expiresAt | expiresAt (TTL) |
| `addresses` | customerRef, type (shipping/billing), name, phone, lines, city, state, pincode, gstin, isDefault | customerRef |
| `categories` | name, slug, description, image, sortOrder, featured, active, parentRef? | slug (unique), active+sortOrder |
| `products` | name, slug, categoryRef, sku, description, specs [{label,value}], images [{key, alt, order}], variants [{sku, colour, size, priceInr, salePriceInr, stock}], moq, bulkTiers [{minQty, unitPriceInr}], customisation {available, options, notes}, gstRatePct, hsnCode, weightG, status (draft/active/archived), featured flags | slug (unique), categoryRef+status, sku (unique), text index (name, description) |
| `inventorymovements` | productRef, variantSku, qtyChange, reason (order/adjust/return), ref, staffRef | productRef, createdAt |
| `carts` | customerRef \| guestId, items [{productRef, variantSku, qty, customisation, unitPriceSnapshot}], couponCode, updatedAt | customerRef (unique), guestId, updatedAt (TTL for guests) |
| `orders` (shop) | orderNo, customerRef, items [snapshot: name, sku, qty, unitPrice, gstRate], amounts {subtotal, discount, shipping, gst (CGST/SGST/IGST), total}, addresses (snapshot), gstin, status (PENDING_PAYMENT → PAID → PROCESSING → SHIPPED → DELIVERED / CANCELLED / REFUNDED), timeline [], shipment {carrier, awb, trackingUrl}, invoiceRef | orderNo (unique), customerRef+createdAt, status |
| `payments` | orderRef, provider, providerOrderId, providerPaymentId, amountPaise, status (CREATED/AUTHORIZED/CAPTURED/FAILED/REFUNDED), signatureVerified, webhookEvents [], idempotencyKey | providerOrderId (unique), providerPaymentId (unique, sparse), orderRef |
| `webhookevents` | provider, eventId, type, payloadHash, processedAt | eventId (unique) — duplicate-event protection |
| `coupons` | code, type (%/flat), value, minOrderInr, maxDiscountInr, validFrom/To, usageLimit, perCustomerLimit, usedCount, active | code (unique) |
| `shippingrules` | zone/pincode ranges, weight slabs, rate, freeAbove | — |
| `invoices` | invoiceNo (sequential per FY), orderRef, pdfKey, gst breakup, issuedAt | invoiceNo (unique) |
| `bulkenquiries` | customer/contact, productRef?, qty, customisation, message, status, assignedStaffRef | status, createdAt |
| `wishlists` | customerRef, productRefs [] | customerRef (unique) |
| `cmscontent` | page, section, content (text/images), published | page+section |
| `calendarjobs` (new) | jobNo, customerRef, orderRef?, title, status (NEW → IN_DESIGN → AWAITING_APPROVAL → CHANGES_REQUESTED → APPROVED → IN_PRODUCTION → DISPATCHED → DELIVERED), assignedDesignerRef, links to existing `calendardesigns` / `aicalendarjobs` | customerRef, status, assignedDesignerRef |
| `designversions` | jobRef, versionNo, source {aiJobRef+variationIndex \| calendarDesignRef}, previewKey (flattened, watermarked image), exportKeys (staff only), createdByRef | jobRef+versionNo (unique) |
| `designshares` | versionRef, customerRef, tokenHash, expiresAt, revokedAt, viewedAt | tokenHash (unique), customerRef |
| `designapprovals` | versionRef, customerRef, decision (APPROVED/REJECTED/CHANGES_REQUESTED), comment, at | versionRef, customerRef |
| `calendarorders` | orderNo, customerRef, jobRef, quantity, size/cut type, price, status, production {stage, updatedBy}, dispatch {carrier, awb}, deliveredAt | orderNo (unique), customerRef |
| `notifications` | recipient (staff/customer ref + audience), type, title, link, readAt | recipient+readAt |
| `auditlogs` | actorRef, audience, action, entity, entityId, before/after (diff), ip, at | entity+entityId, actorRef, at |

All money is stored in **paise (integers)**; prices are copied into orders (snapshots) so later price changes never alter past orders.

---

## 6. Four-panel authentication

One shared foundation, **four separate audiences**:

| Audience | Who | Login page | Account store |
|---|---|---|---|
| `shop-customer` | Shoppers | `/shop/account/login` | `customers` with `portals.shop` |
| `shop-staff` | E-commerce staff | `/shop/staff/login` | `staffusers` with a `shop` role |
| `calendar-customer` | Calendar clients | `/calendar/customer/login` | `customers` with `portals.calendar` |
| `calendar-staff` | Designers, production | `/calendar/staff/login` | `staffusers` with a `calendar` role |

- Every token carries its **audience**. Each API group accepts only its own audience (`requireAudience("calendar-staff")`) and then checks **permissions** (`requirePermission("calendar.ai.generate")`). A shop-customer token is rejected by every staff and calendar API, and so on.
- Tokens are kept in **httpOnly, Secure, SameSite cookies** (one per audience, path-scoped), not in `localStorage`; short-lived access token (15 min) + rotating refresh token (stored hashed in `authsessions`, revocable). CSRF protection for cookie-authenticated writes.
- Passwords: bcrypt (cost 12); reset links/OTPs hashed, single-use, 15-minute expiry, attempt limits; **no OTP in logs**.
- **Staff accounts are created only by an admin** (invitation e-mail) — no public staff registration. Only `SUPER_ADMIN` may hold roles in both modules.
- Customers register themselves (e-mail verification). One person may use the same e-mail for shop and calendar portals; each portal is enabled separately and each login issues only that portal's token.
- Optional 2-step verification for staff (recommended for admins).
- Rate limits on login, register, reset, OTP, checkout and enquiry endpoints; security headers (helmet); CORS limited to the domain.

---

## 7. Permission matrix

✔ = allowed · R = read only · own = only their own records · — = no access

| Capability | Super Admin | Ecom Admin | Sales | Inventory | Accounts | Cal Admin | Cal Manager | Designer | Production | Shop customer | Cal customer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Categories & products | ✔ | ✔ | R | R (stock ✔) | R | — | — | — | — | public R | — |
| Inventory | ✔ | ✔ | R | ✔ | R | — | — | — | — | — | — |
| Shop orders | ✔ | ✔ | ✔ | R | R | — | — | — | — | own | — |
| Payments, refunds, invoices | ✔ | R | R | — | ✔ | — | — | — | — | own (view/download) | — |
| Coupons, shipping, CMS | ✔ | ✔ | — | — | — | — | — | — | — | — | — |
| Shop customers | ✔ | ✔ | ✔ | — | R | — | — | — | — | own profile | — |
| Bulk enquiries | ✔ | ✔ | ✔ | — | — | — | — | — | — | own | — |
| Reports | ✔ | ✔ | own sales | stock | finance | cal reports | cal reports | — | — | — | — |
| Calendar jobs | ✔ | — | — | — | — | ✔ | ✔ | assigned ✔ | R (approved) | — | own (view) |
| AI generation (paid) | ✔ | — | — | — | — | ✔ | — | ✔ (within spend limits) | — | — | — |
| Normal Mode / customise | ✔ | — | — | — | — | ✔ | ✔ | ✔ | — | — | — |
| Layout upload & management | ✔ | — | — | — | — | ✔ | R | R | R | — | — |
| Share previews / approvals | ✔ | — | — | — | — | ✔ | ✔ | ✔ | — | — | approve/reject/comment own |
| Production files (print PDFs) | ✔ | — | — | — | — | ✔ | ✔ | ✔ | ✔ (approved only) | — | — |
| Calendar orders | ✔ | — | — | — | — | ✔ | ✔ | R | update production/dispatch | — | own (view) |
| Staff management | ✔ | shop staff | — | — | — | calendar staff | — | — | — | — | — |
| AI spend & usage ledger | ✔ | — | — | — | — | ✔ | R | — | — | — | — |
| Audit log | ✔ | shop R | — | — | — | calendar R | — | — | — | — | — |

---

## 8. Landing page — UI/UX direction

- **Concept: "Crafted to carry."** Nauticrew's craft (fabric, stitching, handles, prints) as the visual story; navy + warm gold of the existing Nauticrew identity, an off-white "canvas" background, one accent per category family.
- **Typography:** an editorial display serif for headlines (e.g. Fraunces / Playfair) with a clean grotesk for text (e.g. Inter / Manrope) — loaded with `font-display: swap`, subset.
- **Hero:** a real-time 3D product (React Three Fiber) — a tote/gift bag that rotates on drag, changes colour/print on hover, soft studio lighting, and assembles from its panels on first scroll (GSAP ScrollTrigger). Headline, "Explore products" → `/shop`, "Contact us" → enquiry form.
- **3D assets — important:** a true 3D showcase needs **3D models (GLB)** of products. None exist. Options: (a) 2–4 hero products modelled/commissioned (best look), (b) simple procedurally-built bag shapes with your real fabric textures (no modelling cost), (c) image-based "2.5D" tilt/parallax for all other cards. Recommended: (b) for the hero now, (c) for cards, (a) later.
- **Sections:** categories grid (image cards, hover lift + reveal) → featured products (tabs: Best Sellers / New / Popular / Customised; live data from the catalogue, "Buy now" opens the real product page) → about & capabilities (scroll-told story with manufacturing photos) → why choose us → industries served → enquiry form (stored as a bulk enquiry, staff notified) → footer.
- **Performance budget:** mobile Lighthouse ≥ 90; Three.js loaded only on `/` after first paint; static fallback image on low-end devices; `prefers-reduced-motion` respected; images in AVIF/WebP with responsive sizes.

## 9. E-commerce plan

- **Catalogue:** the 41 categories exactly as listed (seeded once, then managed in the staff panel); products with variants (colour/size), gallery, specs, MOQ, bulk tiers, customisation, GST rate & HSN code, SKU, stock, status, featured flags. Search (MongoDB text index), filters (category, price, colour, MOQ), sorting.
- **Product page:** gallery with zoom, variant pickers, quantity with MOQ enforcement, live bulk-tier price, customisation notes/upload, Add to cart, Buy now, Bulk enquiry.
- **Cart:** guest cart (cookie) merged into the account cart on login; server-side recalculation of every price, coupon, shipping and GST — the browser's numbers are never trusted.
- **GST:** CGST+SGST within your state, IGST otherwise, from the delivery state; customer GSTIN on invoices (B2B). Needs your GST registration details.
- **Checkout & payment — Razorpay (recommended):** server creates the order and a Razorpay order → Razorpay Checkout → server verifies the payment signature → webhook (`payment.captured`, `payment.failed`, `refund.processed`) verified with the webhook secret and stored once (`webhookevents.eventId` unique) → order marked PAID only by the server. Pending payments are reconciled; duplicate payments are detected by `providerOrderId`; stock is reserved at payment and released if payment fails. **Test mode only** until you approve live keys. Alternatives: Cashfree, PayU (similar features; Razorpay has the best Node SDK and documentation).
- **After payment:** confirmation page + e-mail, GST invoice PDF (pdf-lib, already in the project), order tracking timeline, shipment AWB (manual entry first; courier API such as Shiprocket later).
- **Staff panel:** dashboard (orders, revenue, pending, low stock), all modules from your brief, CSV export of reports.

## 10. Calendar integration plan

- **Calendar Staff panel = the existing tool**, moved under `/calendar/staff` with a staff shell, and all existing calendar APIs locked to `calendar-staff` audience + permissions. **Normal Mode, AI Mode, model, keys and billing settings are not changed.**
- **New workflow layer:** Calendar Jobs (customer, assigned designer, status), Design Versions (each linked to an existing AI design or Customise draft), Shares, Approvals, Calendar Orders.
- **Sharing a preview:** staff picks a design version → the server stores a **flattened, watermarked preview image** (no layout files, no AI inputs) → creates a share for that customer (random token, stored hashed, expiry e.g. 14 days, revocable) → customer gets an e-mail with a link → the link opens **inside the Calendar Customer panel after login** and only works for that customer.
- **Customer actions:** Approve / Reject / Request changes + comment → stored in `designapprovals` → staff notified → revision = new version + new share. On approval the job moves to production; Production staff see approved print files only.
- **Customers never reach** the AI system, layouts, uploads or staff APIs: the calendar-portal API returns only their own jobs, versions, preview images and orders (ownership checked on every request — changing an ID in the URL returns 404).

## 11. Deployment plan

- Needs from you: **domain registrar/DNS access, current hosting (if any)**, preferred provider.
- Recommended: one VPS or managed Node host (e.g. a small VPS with Nginx, or Render/Railway) running the Express app with PM2/systemd; Nginx serves the built frontend and proxies `/api`; free TLS (Let's Encrypt); environments: development, staging (`staging.<domain>`), production.
- **Database:** move from M0 (512 MB, shared) to a paid Atlas tier with backups before launch; dedicated `nauticrew` database; separate staging database.
- **Files:** product images, previews and PDFs in object storage (Cloudflare R2 / AWS S3 / Cloudinary) behind signed URLs — MongoDB GridFS on M0 will not hold an e-commerce image library.
- **E-mail:** a transactional provider (e.g. Amazon SES, Brevo, Zoho ZeptoMail) with SPF/DKIM on your domain instead of a Gmail account.
- CI: lint + tests + build on every push (GitHub Actions); deploy from `main` after review.

## 12. Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Open staff registration** (anyone gets the Calendar Tool and paid AI) | High — cost and data exposure | Phase 1: disable public staff signup, admin-created staff only |
| M0 database limits (512 MB, shared) and DB named `test` | High at launch | Paid tier + planned move to `nauticrew` (with backup, your approval) |
| No product data/images yet | Blocks shop launch | You provide Drive access/exports; bulk import tool in staff panel |
| No 3D models | Hero quality | Procedural hero now, commissioned GLBs later |
| SPA SEO for shop | Lower Google ranking | Prerender public pages, sitemap, structured data |
| In-memory OTP store and AI job queue (single server) | Lost on restart / no scaling | Move to MongoDB-backed store; single app instance at first |
| Two local clones of the repo | Work done in the wrong copy | Archive `D:\AIcalander` |
| Payments, GST invoices, refunds | Legal/financial correctness | Test mode, your accountant reviews invoice format |
| Scope size (≈ 7 apps in one) | Delays | Strict phases; each phase shippable |
| Uncommitted calendar work (~126 files) | Loss risk | Commit/push the current branch before Phase 2 |

## 13. Phases and estimates

Estimates are working days for one full-time developer pair (you + me), excluding waiting for content, accounts and approvals.

| Phase | Content | Estimate |
|---|---|---|
| 1 Audit & hardening | This report; commit current work; close open staff registration; security middleware; rate limits | 2–3 days |
| 2 Architecture foundation | App shell, routing + redirects, shared UI kit, 4-audience auth, permissions, audit log, DB models | 6–8 days |
| 3 Landing page | Design, 3D hero, sections, enquiry, prerendering, performance | 8–12 days |
| 4 Catalogue | Categories (41 seeded), products, images, search/filters, staff CRUD, bulk import | 7–10 days |
| 5 Shop customer panel | Register/login/reset, dashboard, addresses, wishlist, orders | 5–7 days |
| 6 Shop staff panel | Dashboard, orders, customers, inventory, coupons, shipping, reports, staff | 8–12 days |
| 7 Cart, checkout, payments | Cart, GST, Razorpay (test), webhooks, invoices, tracking | 7–10 days |
| 8 Calendar customer panel | Login, dashboard, previews, approvals, orders | 5–7 days |
| 9 Calendar staff panel | Move tool under staff shell, jobs, shares, approvals, orders, roles | 6–9 days |
| 10 Testing & security | Permission tests (ID tampering), payments, mobile, performance, accessibility | 5–7 days |
| 11 Deployment | Hosting, DNS, TLS, storage, e-mail, monitoring, go-live checklist | 3–5 days |
| **Total** | | **≈ 62–90 working days** |

## 14. Decisions and inputs needed from you

1. Approve this architecture (or tell me what to change).
2. **Domain and hosting:** which domain, where it is registered, and any current hosting.
3. **Product content:** access to the Google Drive folders (or an export), prices, GST rates/HSN, stock, MOQ, bulk tiers.
4. **Payments:** Razorpay account (KYC) — test keys first; live keys only with your approval.
5. **Business details for invoices:** legal name, GSTIN, address, state.
6. **Customer accounts:** may one customer use the same e-mail for both the shop and calendar portals (recommended), or must they be entirely separate accounts?
7. **Approvals for Phase 1:** close public staff registration now, and commit/push the current Calendar Tool branch.
8. Later approvals (not now): paid Atlas tier, object storage, e-mail provider, database rename.
