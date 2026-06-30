# ghost.ma Admin — Audit Validation (Real Codebase)

> **This document supersedes the assumptions in `07-Missing-Functionality-Audit.md` wherever they differ.**
> `07` was written against the project brief only — the actual codebase was not available. This file re-checks every feature against the **real code** (Next.js App Router + server actions + Prisma/PostgreSQL) and reclassifies it. Where `07` and `07a` disagree, `07a` is correct.

## How to read this

Every feature is classified into exactly one of four buckets:

| Tag | Meaning | Work required |
|---|---|---|
| 🟢 **Already implemented** | Works today, backend + UI present | None (functional). May still get re-skinned under 🟡 if the screen is being redesigned. |
| 🟡 **UI redesign only** | Data/logic exists; only the presentation changes | Frontend re-skin to match the mockup |
| 🟠 **Backend extension** | Partially exists; needs schema/action/logic additions on top of what's there | Backend + UI |
| 🔴 **New feature** | Nothing in the codebase | Full build (DB + BE + FE) |

Each entry lists: **Current implementation** (files/actions/models found) · **What's missing** · **Recommended approach** · **Priority** (Launch / Post-launch / Future).

### Where things live (reference map)
- **Server actions:** `src/app/actions/{admin,catalog,orders,payments,storefront}.ts`
- **Data layer:** `src/lib/db/{orders,catalog,categories,prisma}.ts`, `src/lib/storeSettings.ts`, `src/lib/dto.ts`
- **Admin UI:** `src/components/admin/*` (single-page dashboard, tab-switched) + `src/app/admin/orders/[id]/page.tsx` + `src/app/admin/editor/page.tsx`
- **Schema:** `prisma/schema.prisma`

---

## A. Navigation & shell

### IA consolidation to 6 destinations — 🟡 UI redesign only
- **Current:** `AdminDashboard.tsx` already uses a grouped sidebar (`navSections`) with Overview / Products / Categories / Inventory / Orders / Payments / Customers / Supplier / Payment-settings / Refunds / Settings, switched via `activeTab` state (not routes).
- **Missing:** Route-based navigation and the exact 6-group grouping from the design; some tabs (`suppliers`, `refunds`) are placeholder panels.
- **Approach:** Re-skin the existing tab shell into the designed sidebar; optionally migrate `activeTab` → real routes.
- **Priority:** Launch

### Persistent full-height sidebar w/ live count badges — 🟠 Backend extension
- **Current:** Sidebar exists; overview counts (`getAdminOverview` → `totalOrders`, `pendingFulfillment`, `customerCount`) are computed.
- **Missing:** Per-nav-item live badges (e.g. orders-in-review count) wired into the sidebar.
- **Approach:** Add a lightweight counts action (reuse `getAdminOverview` aggregates) and render badges.
- **Priority:** Post-launch

### Command palette (⌘K) + global search endpoint — 🔴 New feature
- **Current:** None in admin. (The storefront search box shows ⌘K but there is no admin palette or cross-entity search.)
- **Missing:** Palette UI, keyboard handling, and a cross-entity search action.
- **Approach:** Build a `cmdk`-style palette; back it with a `searchAdmin(query)` action querying products/orders/customers.
- **Priority:** Future

### Environment badge (LIVE/TEST) — 🔴 New feature
- **Current:** None. No environment concept in code.
- **Missing:** Env state + header badge + switch.
- **Approach:** Likely a display-only badge from an env var for launch; a true TEST mode is a much larger change — defer.
- **Priority:** Future

### Homepage Editor promoted to header — 🟡 UI redesign only
- **Current:** `src/app/admin/editor/page.tsx` exists as a standalone editor route.
- **Missing:** Launch entry point from the topbar as a "mode".
- **Approach:** Add a topbar button linking to the existing editor.
- **Priority:** Post-launch

### View store link — 🟡 UI redesign only
- **Current:** Storefront exists at `/`.
- **Missing:** A topbar "View store" link.
- **Approach:** Trivial `<a target="_blank">` in the shell.
- **Priority:** Launch

---

## B. Overview dashboard

### KPI cards (revenue, orders, deltas) — 🟠 Backend extension
- **Current:** `getAdminOverview` / `getAdminStats` return `totalRevenue`, `totalOrders`, `pendingFulfillment`, `customerCount` (`src/lib/db/orders.ts`). Overview UI renders them in `AdminDashboard.tsx`.
- **Missing:** Period-over-period **deltas** and a **date range**.
- **Approach:** Extend the aggregate action with a comparison window; render delta chips.
- **Priority:** Post-launch

### Revenue bar chart (7/30d) + date-range selector — 🟠 Backend extension
- **Current:** Revenue total exists; no time-series.
- **Missing:** Bucketed time-series query + chart component + range switch.
- **Approach:** Add a `getRevenueSeries(range)` action (group by day); render a small bar chart.
- **Priority:** Post-launch

### Payment-review queue widget — 🟢 Already implemented
- **Current:** Orders are filterable by status; `getAdminOverview` returns recent orders and `pendingFulfillment`. Payment lifecycle actions exist (`payments.ts`). The overview already surfaces pending work.
- **Missing:** A dedicated oldest-first "waiting timer" widget styled per design.
- **Approach:** Re-skin existing pending-orders data into the queue widget (🟡 once redesigning).
- **Priority:** Launch

### Out-of-stock / low-stock KPI — 🟢 Already implemented
- **Current:** `getInventorySummary` / `getInventoryProducts` provide per-variant stock; `LOW_STOCK_MAX` threshold drives low-stock detection in `AdminDashboard.tsx`.
- **Missing:** Surfacing as a top-level KPI card (currently inventory-scoped).
- **Approach:** Reuse the inventory counts as an overview KPI.
- **Priority:** Launch

### Export report (CSV/PDF) — 🔴 New feature
- **Current:** None.
- **Priority:** Future

---

## C. Catalogue — Products

### Three-pane workspace (list/editor/variants) — 🟡 UI redesign only
- **Current:** `ProductsPanel.tsx` is a full product+variant editor (parent products + variant list, all CRUD wired to `saveParentProduct` / `saveVariant`).
- **Missing:** The split three-pane layout from the design.
- **Approach:** Re-skin existing editor state into the workspace layout. No backend change.
- **Priority:** Launch

### Always-visible variant rail — 🟡 UI redesign only
- **Current:** Variants are managed inline in `ProductsPanel.tsx` with per-variant price/stock fields and dirty tracking.
- **Missing:** The persistent rail presentation.
- **Approach:** Re-skin.
- **Priority:** Launch

### Sticky save bar + dirty tracking — 🟢 Already implemented (logic) / 🟡 (bar)
- **Current:** Dirty tracking exists: `isVariantDirty`, `saveDirtyVariants` (`ProductsPanel.tsx:184,852,1426`).
- **Missing:** The sticky save-bar **chrome**.
- **Approach:** Wrap the existing dirty state in the designed `StickySaveBar`.
- **Priority:** Launch

### Quick toggles (visibility, featured, stock mode) — 🟢 Already implemented
- **Current:** `Product.active`/`featured`, `ProductVariant.featured`/`stockMode` fields; toggled via `saveParentProduct` / `saveVariant` / `updateProductCatalogItem`. UI toggles already in `ProductsPanel.tsx` (`draft.featured`, `update("featured", …)`).
- **Missing:** Nothing functional; restyle only.
- **Priority:** Launch (no work)

### Duplicate product — 🟢 Already implemented
- **Current:** `duplicateParentProduct` and `duplicateVariant` actions exist.
- **Missing:** Nothing functional.
- **Priority:** Launch (no work)

### Region / currency per product — 🟢 Already implemented
- **Current:** `Product.region`, `ProductVariant.faceCurrency` / `supplierCurrency` (`schema.prisma`). MAD default, store-configurable.
- **Missing:** Nothing material; UI exposure may vary.
- **Priority:** Launch (no work)

### Media manager (multi-image, dropzone) — 🟠 Backend extension
- **Current:** `ProductMedia` model (multi-image, `sortOrder`), `uploadImageFile` action, `/api/upload` route.
- **Missing:** A multi-image **dropzone/reorder UI** (current usage centers on a single `imageUrl`).
- **Approach:** Build the dropzone over the existing `ProductMedia` + upload route.
- **Priority:** Post-launch

### Stock mode per product/variant (Auto/Manual) — 🟢 Already implemented
- **Current:** `ProductVariant.stockMode` (`automatic` default) + `stockControl`; `storeSettings.inventoryMode`; `categoryStockModes` override.
- **Missing:** Nothing functional.
- **Priority:** Launch (no work)

---

## D. Catalogue — Featured

### Featured manager view — 🟠 Backend extension
- **Current:** `storeSettings.featuredProductIds`, `ProductVariant.featured`, `getFeaturedVariantOptions` action; homepage renders featured.
- **Missing:** A dedicated **manager screen** (current management is via toggles + settings array).
- **Approach:** New UI over existing data; small action to set the ordered list.
- **Priority:** Post-launch

### Variant search combobox — 🟢 Already implemented (data)
- **Current:** `getFeaturedVariantOptions` returns selectable variants.
- **Missing:** Combobox UI.
- **Priority:** Post-launch

### Drag-reorder featured + publish — 🟠 Backend extension
- **Current:** `featuredProductIds` is an ordered array persisted via `saveStoreSettings` (publish == save).
- **Missing:** Drag-reorder UI; the order column already effectively exists as the array order.
- **Approach:** DnD list writing back the reordered array.
- **Priority:** Post-launch

### Live homepage section preview — 🟡 UI redesign only
- **Current:** Homepage components exist and render featured.
- **Missing:** An embedded preview in the manager.
- **Priority:** Future

---

## E. Catalogue — Categories

### Category tree w/ nesting — 🔴 New feature
- **Current:** `Category` is **flat** (no `parentId`); `saveCategory`, `getAdminCategories` exist.
- **Missing:** Nesting (parent/child) entirely.
- **Approach:** Add `parentId` + recursive read/render; migrate.
- **Priority:** Future

### Drag reorder / re-nest — 🟠 Backend extension
- **Current:** `reorderCategories` exists (flat ordering, `sortOrder`).
- **Missing:** Re-nest (depends on the nesting work above).
- **Approach:** DnD over existing reorder for flat order now; re-nest later.
- **Priority:** Post-launch (flat reorder) / Future (re-nest)

### Category visibility + SEO fields — 🟠 Backend extension
- **Current:** `Category.active` (visibility) and `slug` exist.
- **Missing:** SEO meta fields (meta title/description).
- **Approach:** Add meta columns + form fields.
- **Priority:** Future

---

## F. Orders & fulfillment

### Full-page order detail (not drawer) — 🟢 Already implemented
- **Current:** `src/app/admin/orders/[id]/page.tsx` is a full route; `getAdminOrderDetail` backs it.
- **Missing:** Re-skin to the split-page design.
- **Priority:** Launch (🟡 re-skin)

### Confirm payment — 🟢 Already implemented
- **Current:** `confirmPayment` / `approvePayment` (`payments.ts`) advance status; emits `EmailLog`/`PaymentEvent`.
- **Priority:** Launch (no work)

### Reject payment (+notify) — 🟢 Already implemented
- **Current:** `rejectPayment` + `EmailLog` type `payment_rejected`.
- **Priority:** Launch (no work)

### Request new proof — 🟠 Backend extension
- **Current:** `markPaymentIssue` + `payment_issue` email type exist (close analog).
- **Missing:** A distinct "request re-upload" action/email, if differentiated from "payment issue".
- **Approach:** Reuse `markPaymentIssue` or add a dedicated variant.
- **Priority:** Post-launch

### Payment proof preview (full-size) — 🟢 Already implemented
- **Current:** `PaymentProof` model (base64), `getPaymentProof` action.
- **Missing:** Full-size viewer styling.
- **Priority:** Launch (🟡 re-skin)

### Manual code entry (per line) — 🟢 Already implemented
- **Current:** `DeliveredCode.manualCode`, `deliverOrder`, `addCode`.
- **Priority:** Launch (no work)

### Deliver order + send email — 🟢 Already implemented
- **Current:** `deliverOrder` gates on codes/payment and writes `DeliveredCode` + `EmailLog` (`code_delivered`).
- **Priority:** Launch (no work)

### Order timeline / event log — 🟢 Already implemented
- **Current:** `PaymentEvent` model (`status_change` / `proof_uploaded` / `admin_note`) with timestamps; surfaced via `getAdminOrderDetail`.
- **Missing:** Timeline UI styling.
- **Priority:** Launch (🟡 re-skin)

### Emails-sent log per order — 🟢 Already implemented
- **Current:** `EmailLog` model + `getOrderEmailLogs` action.
- **Priority:** Launch (🟡 re-skin)

### Internal notes — 🟢 Already implemented (data)
- **Current:** `PaymentEvent` type `admin_note` stores operator notes.
- **Missing:** A note-entry UI affordance if not already exposed.
- **Priority:** Post-launch

### Payment review queue page — 🟠 Backend extension
- **Current:** Status-filtered order queries exist (`getAdminOrdersPage`).
- **Missing:** A dedicated oldest-first review workspace.
- **Approach:** New view over existing filtered queries.
- **Priority:** Launch

### Fulfillment view — 🟢 Already implemented
- **Current:** `FulfillmentPanel.tsx` exists; `pendingFulfillment` data available.
- **Priority:** Launch (🟡 re-skin)

### Refunds view — 🔴 New feature
- **Current:** `Order.status` allows `refunded`, **but the refunds tab is a placeholder** (`RestoredPanel` in `AdminDashboard.tsx:207`). No refund action/flow.
- **Missing:** Refund action, records, UI.
- **Approach:** Add `refundOrder` action + (optional) refund records; build the view.
- **Priority:** Future

### Status badges & filters — 🟢 Already implemented (data)
- **Current:** Status unions defined; orders queried/filterable by status/method/date (`@@index` on status/method/createdAt; `getAdminOrdersPage`). Order search box in `AdminDashboard.tsx`.
- **Missing:** Filter-chip UI per design.
- **Priority:** Launch (🟡 re-skin)

### Auto-reject after window — 🔴 New feature
- **Current:** None (no scheduled job).
- **Approach:** Background job/cron + review-rule config.
- **Priority:** Future

---

## G. Inventory

### Product-oriented grouped view — 🟢 Already implemented
- **Current:** `getInventoryGroups` / `getInventoryProducts` group variants under products; `InventoryPanel.tsx` renders them.
- **Missing:** Re-skin to the designed accordion/grouping.
- **Priority:** Launch (🟡 re-skin)

### Stock alert strip (out/low counts) — 🟢 Already implemented
- **Current:** Low/out detection via `getInventorySummary` + `LOW_STOCK_MAX`.
- **Missing:** The top-of-page strip styling.
- **Priority:** Launch (🟡 re-skin)

### Stock-level bars + color counts — 🟡 UI redesign only
- **Current:** Per-variant stock counts available.
- **Missing:** Visual bars.
- **Priority:** Launch

### Manage codes (per variant pool) — 🟠 Backend extension
- **Current:** `DigitalCode` model + `addCode` / `disableCode` / `getInventoryCodes` / `getAvailableCodes`. **Codes are keyed by `productId`, not `variantId`.**
- **Missing:** True **per-variant** code pools (schema change) if variants need independent inventory.
- **Approach:** Add `variantId` to `DigitalCode` (+ migration) and scope pools per variant.
- **Priority:** Launch (decide variant granularity early — it affects fulfillment)

### Bulk import codes — 🟢 Already implemented
- **Current:** `addCodesBulk` action + bulk paste UI in `InventoryPanel.tsx` (`addCodesBulkAction`).
- **Missing:** Column-mapping niceties only.
- **Priority:** Launch (no work) / 🟡 polish

### Inventory mode toggle (Auto/Manual) — 🟢 Already implemented
- **Current:** `storeSettings.inventoryMode`, `ProductVariant.stockMode`, `categoryStockModes`.
- **Priority:** Launch (no work)

### Low-stock threshold config — 🟠 Backend extension
- **Current:** Low-stock uses a **hardcoded** `LOW_STOCK_MAX = 5` constant.
- **Missing:** Per-variant (or global) configurable threshold.
- **Approach:** Add a threshold field (setting or variant column).
- **Priority:** Post-launch

---

## H. Customers

### Customer list (search/filter) — 🟢 Already implemented
- **Current:** `Customer` model, `getAdminCustomers`, `CustomersPanel.tsx`.
- **Missing:** Search/filter UI polish.
- **Priority:** Launch (🟡 re-skin)

### Customer detail + LTV + history — 🟢 Already implemented
- **Current:** `CustomerDTO.totalSpent` (LTV, `src/lib/db/orders.ts:367`), `orders` relation, rendered in `CustomersPanel.tsx`.
- **Missing:** Dedicated detail page styling.
- **Priority:** Post-launch (🟡 re-skin)

---

## I. Settings

### Card/tab settings w/ sticky save — 🟡 UI redesign only
- **Current:** `SettingsPanel.tsx` + `saveStoreSettings` over the rich `StoreSettings` shape (`storeSettings.ts`).
- **Missing:** Card/tab layout + sticky save chrome.
- **Priority:** Launch

### Branding (logo, name, tagline, currency, accent) — 🟢 Already implemented
- **Current:** `storeSettings.branding` (siteName, logoText, hero copy, CTAs) + `theme.accentColor` + logo settings; saved via `saveStoreSettings`.
- **Priority:** Launch (no work / 🟡 re-skin)

### Maintenance mode — 🔴 New feature
- **Current:** None in `StoreSettings`.
- **Approach:** Add a `maintenance` flag + storefront gate.
- **Priority:** Post-launch

### Payment methods management — 🟢 Already implemented
- **Current:** `PaymentMethodConfig`, `Bank`, `CryptoWallet` models; `updateMethodConfig`, `addBank`/`updateBank`/`deleteBank`, `addWallet`/`updateWallet`/`deleteWallet`; `PaymentSettingsPanel.tsx`.
- **Priority:** Launch (no work / 🟡 re-skin)

### Review rules (auto-reject, notify) — 🔴 New feature
- **Current:** None (manual review only).
- **Priority:** Future

### Email template editor + variables + preview — 🔴 New feature
- **Current:** Emails are **sent and logged** (`EmailLog`) but templates are **code-defined**, not editable.
- **Missing:** Editable templates (model + editor + variable rendering + send test).
- **Approach:** Add an `EmailTemplate` model + editor.
- **Priority:** Future

### Send test email — 🔴 New feature
- **Current:** None.
- **Priority:** Future

### Legal pages editor — 🔴 New feature
- **Current:** None.
- **Priority:** Post-launch

### Support contacts — 🟢 Already implemented
- **Current:** `SupportConfig` model (`whatsappNumber`, `supportEmail`, `instructions`) + `updateSupportConfig`; plus `storeSettings.footer` contact fields.
- **Priority:** Launch (no work / 🟡 re-skin)

### Feature toggles — 🟠 Backend extension
- **Current:** Homepage section show/hide toggles exist (`storeSettings.homepage.show*`). No general flag system.
- **Missing:** A generic feature-flag mechanism (if needed beyond homepage sections).
- **Priority:** Future

---

## J. Homepage Editor

### Block-based homepage editor (mode) — 🟠 Backend extension
- **Current:** `src/app/admin/editor/page.tsx` + `storeSettings.homepage` (per-section show/hide + titles/subtitles) + `featuredProductIds` + `categoryMedia`.
- **Missing:** Free **block add/reorder** (current model is fixed sections, not arbitrary blocks).
- **Approach:** Re-skin for launch; a true block model is a larger change.
- **Priority:** Post-launch (re-skin) / Future (block model)

### Device preview (desktop/mobile) — 🟡 UI redesign only
- **Current:** Editor renders preview.
- **Missing:** Device toggle.
- **Priority:** Post-launch

### Publish homepage (draft → live) — 🟠 Backend extension
- **Current:** `saveStoreSettings` writes **live immediately** (no draft state).
- **Missing:** Draft vs published versioning.
- **Approach:** Add a draft copy + publish action.
- **Priority:** Future

---

## K. Developer Tools

### API keys (create/rotate/revoke) — 🔴 New feature
- **Current:** None.
- **Priority:** Future

### Webhooks (CRUD + test + log) — 🔴 New feature
- **Current:** None.
- **Priority:** Future

### Supplier API connection + sync — 🔴 New feature
- **Current:** `suppliers` tab is a **placeholder** (`RestoredPanel`, `AdminDashboard.tsx:201`). `ProductVariant.supplierCost`/`supplierCurrency` exist as fields, but no connection/sync logic.
- **Missing:** Connection config + sync engine.
- **Priority:** Future

### Event/audit log — 🟠 Backend extension
- **Current:** `PaymentEvent` is a **payment-scoped** audit trail.
- **Missing:** A general system audit log across entities.
- **Priority:** Future

---

## L. Cross-cutting UI primitives

| Primitive | Status | Notes |
|---|---|---|
| Toast notifications | 🔴 New feature | No toast library in `src/`; build a primitive. |
| Confirmation modals | 🟡 UI redesign only | Destructive actions exist (delete product/variant/category/order); standardise a modal. |
| Loading skeletons | 🟡 UI redesign only | Panels lazy-load with `panelFallback`; add per-region skeletons. |
| Toggle/badge/chip system | 🟡 UI redesign only | Toggles already used across panels; unify to tokens. |
| Empty + error states | 🟡 UI redesign only | Error/empty handling exists (`overviewError`, empty copy); standardise. |
| Filter chips / filter bar | 🟠 Backend extension | Order search exists; chips/filters are new UI (+light query params). |
| Keyboard nav + focus rings | 🔴 New feature | Not systematically present. |
| Drag-and-drop utility | 🟠 Backend extension | `reorderCategories` + `featuredProductIds` ordering exist; DnD UI is new. |

---

## Corrected roadmap (by work type)

> Use this in place of the assumption-based buckets in `08`. Items are the **net real cost** after validation.

### 🟢 Already complete (functional today — no build, only optional re-skin)
- Payment approval / rejection (`confirmPayment`, `approvePayment`, `rejectPayment`)
- Manual code entry + gated delivery + delivery email (`deliverOrder`, `addCode`, `DeliveredCode`)
- Payment proof storage + retrieval (`PaymentProof`, `getPaymentProof`)
- Order timeline / payment events (`PaymentEvent`) + emails-sent log (`EmailLog`)
- Customer list + LTV (`getAdminCustomers`, `totalSpent`)
- Branding, payment methods, support contacts settings (`storeSettings`, `PaymentMethodConfig`, `Bank`, `CryptoWallet`, `SupportConfig`)
- Product/variant CRUD, duplicate, region/currency, stock-mode, quick toggles
- Inventory grouped view, low/out detection, **bulk code import** (`addCodesBulk`)
- Full-page order detail route, fulfillment panel

### 🟡 UI redesign only (data/logic done — re-skin to mockup)
- App shell / consolidated nav (currently tab-switched, not routed)
- Products three-pane workspace + variant rail + sticky save bar (dirty tracking exists)
- Order detail split view + timeline + proof viewer + filter chips
- Inventory grouped layout + stock bars + alert strip
- Settings card/tab layout + sticky save
- Customers list/detail re-skin
- Confirmation modals, skeletons, unified toggles/badges, standardized empty/error states

### 🟠 Backend extension (partial — add schema/action/logic)
- **Per-variant code pools** (add `variantId` to `DigitalCode`) — decide early
- Sidebar live count badges
- Overview deltas + revenue time-series + date range
- Media manager multi-image dropzone (over `ProductMedia`)
- Featured manager view + drag-reorder + variant combobox
- Category flat drag-reorder (re-nest is 🔴)
- Configurable low-stock threshold (replace hardcoded `LOW_STOCK_MAX`)
- Request-new-proof distinct flow
- Filter bar query params; DnD utility
- Homepage editor device preview; (draft/publish is 🔴)

### 🔴 New feature (nothing exists — full build)
- Maintenance mode
- Legal pages editor
- Refund workflow (status exists; tab is a placeholder)
- Environment badge (LIVE/TEST)
- Command palette (⌘K) + global search endpoint
- Email template editor + variables + preview + send test
- Review rules / auto-reject job
- Category **nesting** (parent/child) + SEO fields
- Homepage draft→publish + free block model
- API keys, webhooks, supplier sync, general audit log
- Toast primitive, systematic keyboard nav / focus rings
- Report export (CSV/PDF)

---

## Biggest corrections vs `07`
1. **Orders/Payments are essentially built.** The full review → confirm/reject → manual-code → deliver → email lifecycle, proof storage, timeline events, and email log all exist. `07` flagged most as `assumed` new work — they are 🟢/🟡.
2. **Customers (list + LTV) exist** — 🟢, not new.
3. **Bulk code import exists** (`addCodesBulk`) — `07` marked it `likely-new`; it's 🟢.
4. **Settings coverage is broad** (branding, payment methods, support) — 🟢.
5. **Refunds & Supplier API are placeholders**, not implemented — the nav tabs (`RestoredPanel`) make them *look* present; they are 🔴/🟠.
6. **Codes are product-scoped, not variant-scoped** — the one schema decision that genuinely affects fulfillment; resolve before redesigning Inventory/Products.
