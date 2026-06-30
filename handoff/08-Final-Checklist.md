# ghost.ma Admin — Final Implementation Checklist

A concise, build-order checklist. Buckets are by **type of work**, not by screen.

> 🔁 **Validated against the real codebase in [`07a-Audit-Validation.md`](./07a-Audit-Validation.md) — use `07a`'s corrected roadmap as the source of truth.** The "Already implemented" list below is no longer assumption-based: every item was confirmed in code (file/action/model cited in `07a`). The remaining buckets still hold, but several rows shrank to re-skins once validated — `07a` marks each 🟢/🟡/🟠/🔴.

---

## ✅ Already implemented (confirmed in code — reuse, optional re-skin)
> Verified in `07a`. These work today; do **not** rebuild.
- [x] Product/variant CRUD + duplicate + region/currency + stock-mode + quick toggles (`saveParentProduct`, `saveVariant`, `duplicateParentProduct`)
- [x] Order placement + records + status-filtered queries (`createOrder`, `getAdminOrdersPage`)
- [x] Payment confirm / reject / issue (`confirmPayment`, `approvePayment`, `rejectPayment`, `markPaymentIssue`)
- [x] Manual code entry + gated delivery + delivery email (`deliverOrder`, `addCode`, `DeliveredCode`)
- [x] Payment proof storage + retrieval (`PaymentProof`, `getPaymentProof`)
- [x] Order timeline events + emails-sent log + internal notes (`PaymentEvent`, `EmailLog`, `getOrderEmailLogs`)
- [x] Code/stock storage + **bulk import** (`DigitalCode`, `addCodesBulk`) — *product-scoped, not variant-scoped (see 🗄️ below)*
- [x] Settings: branding, payment methods, support contacts (`storeSettings`, `PaymentMethodConfig`, `Bank`, `CryptoWallet`, `SupportConfig`) — *legal pages NOT yet*
- [x] Customer records + LTV (`getAdminCustomers`, `totalSpent`)
- [x] Email sending (transactional) + logging (`EmailLog`) — *template editing NOT yet*
- [x] Full-page order detail route + fulfillment panel + inventory grouped view

---

## 🎨 UI redesign only (no/low backend — re-skin existing data)
- [ ] App shell: full-height sidebar + sticky topbar + content regions
- [ ] Consolidated 6-destination IA + grouped nav
- [ ] Order detail as **full-page split view** (replace tiny drawer)
- [ ] Products **three-pane workspace** + always-visible variant rail
- [ ] **Sticky save bars** + dirty tracking on all editors
- [ ] Inventory **product-grouped** view + stock bars
- [ ] Card/tab **settings** layout
- [ ] Consistent **toggle / badge / status chip** system
- [ ] Empty / error / loading **skeleton** states everywhere
- [ ] Toast + confirmation-modal patterns
- [ ] Homepage Editor promoted to **header** launch
- [ ] Geist + Geist Mono + token theme applied globally

---

## 🖥️ Frontend work (new UI behaviour, may need light API)
- [ ] Command palette (⌘K) UI + keyboard nav
- [ ] Filter bar + filter chips (orders, customers, inventory)
- [ ] Drag-and-drop (Featured order, Categories tree, Homepage blocks)
- [ ] Featured manager UI (search + order + live preview)
- [ ] Email template editor UI (variable chips + live preview + send test)
- [ ] Overview dashboard widgets (KPIs, chart, queue) wiring
- [ ] Inventory bulk-import UI (upload + column mapping)
- [ ] Accordions, tabs, pagination, sortable tables
- [ ] Device-preview toggle (Homepage Editor)
- [ ] Keyboard focus rings, focus-trap modals, reduced-motion

---

## ⚙️ Backend work (new endpoints / logic)
> ⚠️ Per `07a`, several rows below **already exist** and are not new backend: order state machine + timeline (`PaymentEvent`), emails-sent log (`EmailLog`), deliver-order gating (`deliverOrder`), bulk code import (`addCodesBulk`), inventory mode (`stockMode`/`inventoryMode`), featured ordering (`featuredProductIds`), customer LTV (`totalSpent`). Treat those as 🟢. Genuinely new: metrics deltas/series, request-new-proof, auto-reject job, configurable low-stock threshold, global search, draft/publish, review rules, supplier sync, API keys/webhooks/audit log, env switch.
- [ ] Metrics aggregation (revenue, orders, deltas, period compare)
- [ ] Payment-review queue (oldest-first, waiting timers)
- [ ] Request-new-proof flow + customer notification
- [ ] Order **state machine** + timeline events + emails-sent log
- [ ] Deliver-order gating (codes present + payment confirmed) + email codes
- [ ] Auto-reject-after-window job + notifications
- [ ] Stock alert counts (out/low) + low-stock thresholds
- [ ] Bulk code import processing
- [ ] Inventory mode (Automatic vs Manual) handling
- [ ] Global search endpoint (command palette)
- [ ] Featured ordering + publish
- [ ] Homepage blocks render/publish
- [ ] Email template rendering with variable substitution + send test
- [ ] Payment review rules (auto-reject, notify)
- [ ] Supplier API connection + sync
- [ ] API keys + webhooks + audit log
- [ ] Customer LTV / history aggregation
- [ ] Environment (LIVE/TEST) switch

---

## 🗄️ Database work (schema additions/changes — validate first)
> ⚠️ Per `07a`, these tables/columns **already exist** — do NOT recreate: status enum + timeline (`PaymentEvent`), emails-sent (`EmailLog`), internal notes (`PaymentEvent.admin_note`), payment proof (`PaymentProof`), featured ordering (`featuredProductIds`), region/currency (`Product.region`, `faceCurrency`), branding/support settings (`storeSettings`, `SupportConfig`). Still needed: **`variantId` on `DigitalCode`** (codes are product-scoped today), category nesting + SEO, email-templates table, maintenance/feature-flag/legal settings, refunds, API keys/webhooks/audit-log, low-stock threshold field, homepage blocks + draft/publish.
- [ ] Order status enum + status-history / timeline table
- [ ] Emails-sent table (per order)
- [ ] Internal notes table (orders, customers)
- [ ] Code inventory: pool table w/ status (available/reserved/delivered), low-stock threshold, source mode
- [ ] Payment proof storage + review-rule config
- [ ] Featured: ordering column / table
- [ ] Homepage: blocks/content table
- [ ] Email templates table (subject, body, variables, enabled)
- [ ] Settings: branding, maintenance, accent, feature flags, support contacts
- [ ] Categories: nesting (parent_id, order), visibility, SEO
- [ ] Region/currency on products
- [ ] API keys, webhooks, audit log tables
- [ ] Refunds table

---

## 🌟 Optional future improvements
- [ ] Resizable splitter panels (persisted width)
- [ ] Saved filter views / segments
- [ ] CSV/PDF report export
- [ ] Real-time order stream (websockets) on Overview & Orders
- [ ] Bulk actions on order/product tables
- [ ] Role-based permissions / multi-admin
- [ ] Activity feed / notifications center
- [ ] Light theme variant
- [ ] Mobile-optimised order processing

---

## Recommended build sequence (TL;DR)
1. **Shell + tokens + primitives** → 2. **Orders (table → detail → confirm/reject/deliver)** → 3. **Payment review + Overview** → 4. **Products + variants (sticky save)** → 5. **Inventory + codes** → 6. **Featured** → 7. **Settings + Payment + Email** → 8. **Categories + Customers** → 9. **Homepage Editor + Developer Tools** → 10. **Polish (palette, skeletons, DnD, a11y)**.
