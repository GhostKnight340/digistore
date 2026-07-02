# ghost.ma Admin — Interaction Flows

Step-by-step user flows for every core admin task, grounded in the real data model (`prisma/schema.prisma`). Each flow lists: **trigger → steps → what changes in the DB → emails → success / error / edge cases**.

Conventions used below:
- `Order.status` values: `pending_payment` · `payment_submitted` · `payment_confirmed` · `payment_issue` · `rejected` · `delivered` · `refunded` · `cancelled`.
- `DigitalCode.status` values: `unused` · `reserved` · `used` · `disabled`.
- `EmailLog.type` values: `order_received` · `payment_submitted` · `payment_confirmed` · `payment_rejected` · `payment_issue` · `code_delivered`.
- Every payment lifecycle mutation **must** write a `PaymentEvent` row (`status_change` / `proof_uploaded` / `admin_note`). Treat this as non-optional — it powers the audit trail and the order timeline.
- Every customer-facing state change **must** write an `EmailLog` row (even in simulation mode — `provider="simulation"`, `status="simulated"`).

---

## Flow 1 · Create a product
**Screen:** S2 Products (three-pane workspace) · **Trigger:** "+ New" in the product list.

1. Click **+ New** → editor opens in *create* mode with an empty, dirty form; sticky save bar shows **"Unsaved — new product"**.
2. Fill **Details**: name (→ auto-suggests `slug`), category (`Category` select), region, currency, price (MAD), delivery type, short/long description, instructions.
3. Set quick-toggles: **Visibility** (`active`), **Featured** (`featured`), **Stock mode** (`ProductVariant.stockMode` = automatic/manual).
4. Upload media → dropzone creates `ProductMedia` rows on save (first image → `imageUrl`).
5. Add at least one **variant** in the right rail (name, `priceMad`, `faceValue`/`faceCurrency`, `stockControl`, `stockMode`).
6. Click **Save product**.

**DB writes:** `Product` (insert) + `ProductVariant[]` + `ProductMedia[]`. `slug` must be unique (`@@unique`).
**Validation (Zod, React Hook Form):** name required; slug required + unique; priceMad > 0 integer; at least one variant.
**Success:** save bar → **"All changes saved"** (green), reverts to idle after 2.5s; green toast; new product appears in the list, selected.
**Error:** duplicate slug → inline field error "Slug already exists" (see ST · Products/ERROR); save failure → danger toast, bar stays "unsaved".
**Edge:** navigating away while dirty → confirm modal "Discard unsaved changes?".

---

## Flow 2 · Edit a product
**Screen:** S2 Products · **Trigger:** select a product row.

1. Click a list row → editor loads that product (accent ring on the row); save bar idle.
2. Change any field or toggle → field marks dirty, save bar flips to **"Unsaved changes"**.
3. Optionally **Duplicate** (clones product + variants with a new slug) or **Delete** (top-right, opens confirm modal — warns if the product has orders).
4. **Save** persists; **Discard** reverts to last-saved values.

**DB writes:** `Product` (update, `updatedAt` auto) + upserted/deleted `ProductVariant` / `ProductMedia`.
**Success / Error:** same save-bar + toast pattern as Flow 1.
**Edge:** deleting a product referenced by `OrderItem` — do **not** hard-delete; set `active=false` (soft delete) or block with a modal, since `OrderItem.product` is a required relation.

---

## Flow 3 · Upload / import digital codes
**Screen:** S5 Inventory · **Trigger:** "+ Codes" on a variant row, or "Bulk import" in the header.

1. Click **+ Codes** (single variant) or **Bulk import** (choose product/variant + upload CSV).
2. Drop `codes_*.csv` → parser runs (ST · Inventory/LOADING shows a progress bar; nothing is written yet).
3. Parser validates each line and checks against existing codes (`DigitalCode @@unique([productId, code])`).
4. If duplicates/invalid rows found → **ERROR** panel lists offending rows + counts, offers **Import N valid** or **Cancel** (ST · Inventory/ERROR).
5. Confirm import → valid codes inserted as `DigitalCode` with `status="unused"`.

**DB writes:** `DigitalCode[]` (insert, `status=unused`, `variantId` set).
**Success:** green toast "N codes imported"; stock bar + counts update; if the variant was out-of-stock, the product flips back to in-stock (ST · Inventory/SUCCESS).
**Error:** parse error → danger banner with line numbers; partial import always previewed before commit — never write duplicates.
**Edge:** a variant on `stockMode=automatic` (supplier) has "+ Codes" hidden unless a manual pool is explicitly enabled.

---

## Flow 4 · Review a payment
**Screen:** S10 Payment review queue (3-pane: queue · proof viewer · decision panel) · **Trigger:** open the queue (badge in sidebar) or click a queue item on Overview.

1. Queue lists orders with `status="payment_submitted"`, **oldest first**, each showing a waiting timer.
2. Select an order → proof viewer renders `PaymentProof.data` (base64 → object URL); decision panel shows **Verify against** (expected `totalMad`, bank/RIB from `Bank`, reference), customer risk (order count, rejected count), and the **audit trail** (`PaymentEvent` list).
3. Operator compares proof to expected amount/account.
4. Choose one:
   - **Confirm payment → fulfill**: `status` → `payment_confirmed`; advances to fulfillment.
   - **Request new proof**: keeps order open, notifies customer.
   - **Reject**: opens confirm modal → `status` → `rejected`.

**DB writes:** `Order.status` update + `PaymentEvent{type:"status_change", fromStatus, toStatus}`.
**Emails:** confirm → `EmailLog{type:"payment_confirmed"}`; reject → `payment_rejected`; request proof → `payment_issue`.
**Success:** confirm → green confirmation, auto-loads next in queue (ST · Payment/SUCCESS). Empty queue → "Queue is clear" (ST · Payment/EMPTY).
**Error:** proof fails to decode → "Proof failed to load", offer Download raw / Request new (ST · Payment/ERROR).
**Edge:** proof missing entirely → dashed "Awaiting proof" placeholder; do not allow Confirm without a proof when `PaymentMethodConfig.proofRequired=true`.

---

## Flow 5 · Fulfill an order (deliver codes)
**Screen:** S4 Order detail / Fulfillment (split view) · **Trigger:** order reaches `payment_confirmed`, or opened from the Orders table.

1. Header strip shows order #, status badge, and always-visible actions.
2. **Code delivery** block: for each `OrderItem` line/quantity, either auto-pull from the `DigitalCode` pool (reserve → `status="reserved"`) or enter codes manually.
3. **Deliver order & send email** stays disabled until **all** codes present **and** payment confirmed.
4. Click Deliver.

**DB writes:** `DeliveredCode[]` (one per delivered unit, linking `orderItemId` + `digitalCodeId` or `manualCode`); reserved `DigitalCode.status` → `used` (`usedAt`, `assignedOrderId`); `Order.status` → `delivered`; `PaymentEvent{status_change}`.
**Emails:** `EmailLog{type:"code_delivered"}` with the codes rendered from the Email Template.
**Success:** green toast; timeline gains "Delivered"; emails-sent list updates.
**Error:** invalid/duplicate code → red field border + helper; insufficient pool stock → block deliver, link to Inventory.
**Edge:** `DeliveredCode @@unique([digitalCodeId])` prevents re-delivering the same code — enforce before write.

---

## Flow 6 · Refund an order
**Screen:** S4 Order detail (Refunds tab reuses the same split) · **Trigger:** "Refund" row action on a `delivered`/`payment_confirmed` order.

> **Schema note:** there is **no dedicated Refund table** in the current schema. A refund is modeled as `Order.status="refunded"` + a `PaymentEvent`. If richer refund records (amount, reason, partial) are required, add a `Refund` model — flag to backend before building.

1. Open the order → **Refund** → confirm modal (amount defaults to `totalMad`, reason field).
2. Confirm.

**DB writes:** `Order.status` → `refunded`; `PaymentEvent{type:"status_change", toStatus:"refunded", note:reason}`. Optionally disable any delivered codes (`DigitalCode.status="disabled"`).
**Emails:** send a refund notification (reuse `payment_rejected`-style template or add a `refunded` type — confirm with backend).
**Success:** status badge → Refunded; timeline entry; toast.
**Edge:** refunding after delivery does not reclaim used codes automatically — surface a warning in the modal.

---

## Flow 7 · Manage inventory
**Screen:** S5 Inventory · **Trigger:** open Inventory.

1. Alert strip summarizes **Out of stock** / **Low stock** / **Codes in stock** (counts derived from `DigitalCode` by `status` + `stock.lowThreshold` from `StoreSetting`).
2. Expand a product group → variant rows with stock bars (unused-code count per `variantId`).
3. Per variant: **Manage** (view/disable individual codes) or **+ Codes** (Flow 3).
4. Toggle a product's inventory **mode** (Automatic vs Manual).

**DB reads:** aggregate `DigitalCode` grouped by `variantId, status`. **DB writes:** `DigitalCode.status` on disable; `ProductVariant.stockMode`/`stockControl` on mode change.
**Success:** counts + bars update live; toast on bulk actions.
**Empty:** no codes anywhere → "No codes in stock" (ST · Inventory/EMPTY).
**Edge:** low-stock threshold is store-configurable (`StoreSetting["stock.lowThreshold"]`), default 5.

---

## Flow 8 · Edit the homepage
**Screen:** S11 Homepage Editor (full-screen mode, launched from the **topbar**, not the sidebar) · **Trigger:** "✎ Homepage Editor" header button.

> **Schema note:** homepage composition is stored in **`StoreSetting`** JSON (e.g. `homepage.featured` = ordered variant ids), not a blocks table. The "Trending now" block is bound to Featured (Flow 9). If free-form blocks are needed, add a `HomepageBlock` model — flag to backend.

1. Editor opens: left block list (Hero, Trending now, Categories, Banner, Footer), center live preview, right block settings.
2. Reorder / toggle / edit blocks → preview updates live (draft state).
3. **Publish** writes the composition.

**DB writes:** `StoreSetting` upsert (`value` JSON, `updatedAt`).
**Success:** "Homepage published" toast; env badge confirms LIVE.
**Error:** publish failure → danger toast, draft retained.
**Edge:** editor is desktop-only; on mobile show preview + a notice.

---

## Flow 9 · Curate featured products
**Screen:** S3 Featured Products (search · ordered list · homepage preview) · **Trigger:** open Featured, or toggle "Featured" on a variant in S2.

1. Search variants (combobox) → **+** adds to the ordered list (already-added disabled; out-of-stock flagged).
2. Drag rows to reorder → the 2×2 homepage preview reflows live.
3. **Publish changes**.

**DB writes:** `ProductVariant.featured=true` + ordering persisted via `StoreSetting["homepage.featured"]` (ordered id array) — the schema has no dedicated ordering column beyond `sortOrder`, so the canonical order lives in `StoreSetting`.
**Emails:** none.
**Success:** "Featured section updated" toast.
**Edge:** removing a variant sets `featured=false` and drops it from the ordered array; keep the two in sync.

---

## Flow 10 · Update store settings
**Screen:** S6 Store Settings (sub-nav + editor + sticky save) · **Trigger:** open Settings → Branding.

1. Edit store identity (name, support email, tagline, currency), accent color, maintenance toggle.
2. Edits mark the save bar dirty.
3. **Save changes**.

**DB writes:** `StoreSetting` upsert per key (identity, accent, `maintenance` flag); support contacts → `SupportConfig`.
**Validation:** support email format (Zod).
**Success:** "All changes saved" + toast.
**Edge:** toggling `maintenance=true` should surface a persistent banner across the storefront — confirm the flag is read at the edge.

---

## Flow 11 · Manage payment methods
**Screen:** S7 Payment Settings · **Trigger:** Settings → Payment methods.

1. Method cards for **bank / usdt / paypal / card** (`PaymentMethodConfig.method`).
2. Toggle **enabled**; set **proofRequired**; edit method-specific fields:
   - bank → `Bank` (accountHolder, RIB, IBAN, SWIFT, instructions).
   - usdt → `CryptoWallet` (network TRC20/BEP20, address, label).
   - paypal → `PaymentMethodConfig.paypalEmail`.
   - card → `PaymentMethodConfig.cardMessage` (disabled/coming-soon by default).
3. Configure review rules (auto-reject window, notify-on-new-proof).

**DB writes:** `PaymentMethodConfig` (upsert by unique `method`), `Bank`, `CryptoWallet`.
**Success:** autosave or explicit save + toast.
**Edge:** disabling the only enabled method should warn — the storefront needs at least one active method.

---

## Flow 12 · Manage customers
**Screen:** S10 Customers (table + profile panel) · **Trigger:** open Customers.

1. Search/filter (name, email, phone; "Verified only").
2. Click a row → profile panel: monogram avatar, verification badge, auth provider (`authProvider` / `googleId`), joined/last-login timestamps, KPIs (orders, lifetime value, rejected count), recent orders (`Order[]`).
3. Actions: **Email customer**, **Reset password** (issues an `AuthToken{type:"password_reset"}`).

**DB reads:** `Customer` + related `Order[]`, `EmailLog[]`. LTV = sum of `Order.totalMad` where delivered/confirmed.
**DB writes (actions):** `AuthToken` (password reset); `EmailLog` for outbound mail.
**Success:** toast on send/reset.
**Empty:** "No customers match" empty state.
**Edge:** `authProvider="google"` accounts have no `passwordHash` — hide "Reset password", show "Managed by Google".

---

## Flow 13 · Manage email templates
**Screen:** S8 Email Templates (list · editor · live preview) · **Trigger:** Settings → Email templates.

1. Select a template (keyed by `EmailLog.templateKey` / type).
2. Edit subject + body with `{variable}` chips (order #, customer name, codes, amount); insert from the variable palette.
3. Preview renders live on a branded white card.
4. **Send test** → sends to the admin; **Save**.

**DB writes:** template store (subject/body/enabled per key — add an `EmailTemplate` model if not present; currently templates are implied by `EmailLog.templateKey`). Sending writes an `EmailLog`.
**Success:** "Template saved"; "Test email sent to …".
**Error:** unknown variable → amber inline warning; send-test failure → danger toast.
**Edge:** `manuallyEdited` on `EmailLog` marks messages whose body was hand-edited before send.

---

## Cross-flow rules (apply everywhere)
- **Optimistic UI** for toggles/reorders; roll back on failure with a danger toast.
- **Dirty tracking** on every editor; block navigation with a confirm modal.
- **Confirm modals** for all destructive/irreversible actions (delete, reject, refund, rotate/revoke, purge).
- **Toasts** for async results (success/danger), auto-dismiss ~4s, with **Undo** where reversible (bulk order actions).
- **Skeletons** on first load; **error cards** with Retry on fetch failure; never a blank pane.
- **Simulation mode** (`StoreSetting` / Developer Tools) routes all mail to `EmailLog` with `status="simulated"` and sends nothing — the UI still shows "sent".
