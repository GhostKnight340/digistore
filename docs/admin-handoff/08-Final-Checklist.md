# ghost.ma Admin — Final Implementation Checklist

A concise, build-order checklist distilled from `07-Missing-Functionality-Audit.md`. Buckets are by **type of work**, not by screen.

> ⚠️ **Schema update:** this checklist predates `prisma/schema.prisma`. Most of the 🗄️ Database bucket **already exists** (emails-sent → `EmailLog`, timeline → `PaymentEvent`, proof → `PaymentProof`, code pool → `DigitalCode`, settings → `StoreSetting`). Only **Refunds, category nesting (`Category.parentId`), homepage blocks, and an optional `EmailTemplate` model** remain as real DB work. See `10-Data-Model-Mapping.md §4` for the authoritative reconciliation before starting the DB bucket.

---

## ✅ Already implemented (verify, likely reuse)
> These are **assumed** to exist in the current admin in some form. Confirm, then mostly re-skin.
- [ ] Product CRUD + variants (data layer)
- [ ] Order placement + basic order records
- [ ] Payment confirm / reject (core action)
- [ ] Manual code entry & delivery (core action)
- [ ] Code/stock storage (some form)
- [ ] Basic settings (branding, payment methods, legal)
- [ ] Customer records
- [ ] Email sending (transactional)

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
