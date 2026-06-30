# ghost.ma Admin — Missing Functionality Audit & Roadmap

> 🔁 **Superseded by [`07a-Audit-Validation.md`](./07a-Audit-Validation.md).** This file is the original brief-based audit. Every row has since been re-checked against the real codebase in `07a` and reclassified (🟢 already implemented / 🟡 UI redesign / 🟠 backend extension / 🔴 new feature). **Where `07` and `07a` differ, `07a` wins.** Keep this file for history; plan from `07a`.

> ⚠️ **Important assumption.** This audit compares the **redesign** against the **current admin as described in the project brief** (its stated problems: too many pages, buried actions, save-on-scroll, hidden variant controls, hard-to-manage featured products, orders in tiny drawers, hard-to-read inventory). The actual ghost.ma codebase was **not** provided, so each item is marked with a **confidence** flag. Re-check items marked _assumed_ against the real code and adjust priority before committing to the roadmap.

**Columns:** Feature · Description · Priority (P0 critical / P1 high / P2 medium / P3 nice-to-have) · FE-only? · BE? · DB? · API? · Complexity (Easy/Medium/Hard) · Confidence (likely-new / assumed).

---

## A. Navigation & shell

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| IA consolidation to 6 destinations | Collapse many pages into Catalogue/Orders/Settings groups | P0 | ✅ | — | — | — | Medium | likely-new |
| Persistent full-height sidebar w/ groups + counts | Sidebar with live count badges (orders, review) | P1 | ❌ | ✅ | — | ✅ (counts) | Medium | likely-new |
| Command palette (⌘K) | Global search + jump to orders/products/customers | P1 | ❌ | ✅ | — | ✅ (search) | Hard | likely-new |
| Global search endpoint | Cross-entity search backing the palette | P1 | ❌ | ✅ | maybe (index) | ✅ | Hard | likely-new |
| Environment badge (LIVE/TEST) | Header status + env switch | P2 | ❌ | ✅ | — | ✅ | Medium | assumed |
| Homepage Editor promoted to header | Launch editor as a mode from topbar | P1 | ✅ | — | — | — | Easy | likely-new |
| View store link | Open storefront in new tab | P3 | ✅ | — | — | — | Easy | assumed |

## B. Overview dashboard

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| KPI cards (revenue, orders, deltas) | Aggregated metrics w/ period compare | P1 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Revenue bar chart (7/30d) | Time-series revenue | P1 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Date-range selector | Today / 7d / 30d switch | P2 | ❌ | ✅ | — | ✅ | Easy | likely-new |
| Payment-review queue widget | Oldest-first waiting payments w/ timers | P0 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Out-of-stock / low-stock KPI | Live stock alert counts | P1 | ❌ | ✅ | — | ✅ | Easy | likely-new |
| Export report | Export metrics (CSV/PDF) | P3 | ❌ | ✅ | — | ✅ | Medium | assumed |

## C. Catalogue — Products

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Three-pane workspace (list/editor/variants) | Replace deep forms with split workspace | P0 | ✅ | — | — | — | Hard | likely-new |
| Always-visible variant rail | Per-variant stock + price without expanding | P0 | ❌ | ✅ | maybe | ✅ | Medium | likely-new |
| Sticky save bar + dirty tracking | Save without scrolling | P0 | ✅ | — | — | — | Easy | likely-new |
| Quick toggles (visibility, featured, stock mode) | Inline product flags | P1 | ❌ | ✅ | maybe (flags) | ✅ | Easy | assumed |
| Duplicate product | Clone parent + variants | P2 | ❌ | ✅ | — | ✅ | Medium | assumed |
| Region / currency per product | Currency/region attribute | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Media manager (multi-image, dropzone) | Upload/replace product media | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Stock mode per product/variant (Auto/Manual) | Inventory source toggle | P1 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |

## D. Catalogue — Featured

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Featured manager view | Dedicated management screen | P1 | ✅ | — | — | — | Medium | likely-new |
| Variant search combobox | Find variants to feature | P1 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Drag-reorder featured | Persisted ordering | P1 | ❌ | ✅ | ✅ (order col) | ✅ | Medium | likely-new |
| Live homepage section preview | Mirror "Trending now" | P2 | ✅ | — | — | — | Medium | likely-new |
| Publish featured changes | Persist + push live | P1 | ❌ | ✅ | ✅ | ✅ | Easy | likely-new |

## E. Catalogue — Categories

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Category tree w/ nesting | Parent/child management | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Drag reorder / re-nest | Persisted hierarchy | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Category visibility + SEO fields | Hide, slug, meta | P3 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |

## F. Orders & fulfillment

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Full-page order detail (not drawer) | Replace tiny drawer with split page | P0 | ✅ | — | — | — | Medium | likely-new |
| Confirm payment | Approve + advance status | P0 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |
| Reject payment (+notify) | Reject w/ customer email | P0 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Request new proof | Ask customer to re-upload | P1 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |
| Payment proof preview (full-size) | View uploaded receipt | P1 | ❌ | ✅ | — | ✅ | Easy | assumed |
| Manual code entry (per line) | Enter delivery codes | P0 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Deliver order + send email | Gate on codes+payment, email codes | P0 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Order timeline / event log | Chronological events | P1 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |
| Emails-sent log per order | Track sent transactional mail | P2 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |
| Internal notes | Operator notes on order | P2 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |
| Payment review queue page | Oldest-first review workspace | P0 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Fulfillment view | Orders awaiting delivery | P1 | ❌ | ✅ | — | ✅ | Medium | assumed |
| Refunds view | Manage refunds | P2 | ❌ | ✅ | ✅ | ✅ | Hard | assumed |
| Status badges & filters | Filter orders by status/method/date | P1 | ❌ | ✅ | — | ✅ | Medium | likely-new |
| Auto-reject after window | Expire unverified payments | P3 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |

## G. Inventory

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Product-oriented grouped view | Variants grouped under product | P0 | ✅ | — | — | — | Medium | likely-new |
| Stock alert strip (out/low counts) | Top-of-page alerts | P1 | ❌ | ✅ | — | ✅ | Easy | likely-new |
| Stock-level bars + color counts | Visual stock per variant | P1 | ✅ | — | — | — | Easy | likely-new |
| Manage codes (per variant pool) | View/add/remove codes | P0 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Bulk import codes | Paste/upload + map to variants | P1 | ❌ | ✅ | ✅ | ✅ | Hard | likely-new |
| Inventory mode toggle (Auto/Manual) | Per product/variant source | P1 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |
| Low-stock threshold config | Define "low" per variant | P2 | ❌ | ✅ | ✅ | ✅ | Easy | likely-new |

## H. Customers

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Customer list (search/filter) | Browse customers | P2 | ❌ | ✅ | — | ✅ | Medium | assumed |
| Customer detail + LTV + history | Profile, lifetime value, orders | P2 | ❌ | ✅ | maybe (LTV calc) | ✅ | Medium | assumed |

## I. Settings

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Card/tab settings w/ sticky save | Scannable settings, no long forms | P1 | ✅ | — | — | — | Medium | likely-new |
| Branding (logo, name, tagline, currency, accent) | Store identity config | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Maintenance mode | Close storefront temporarily | P2 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |
| Payment methods management | Enable/configure methods | P1 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Review rules (auto-reject, notify) | Payment-review automation | P2 | ❌ | ✅ | ✅ | ✅ | Medium | likely-new |
| Email template editor + variables + preview | Edit transactional emails | P1 | ❌ | ✅ | ✅ | ✅ | Hard | likely-new |
| Send test email | Preview delivery | P2 | ❌ | ✅ | — | ✅ | Easy | likely-new |
| Legal pages editor | Terms/privacy content | P3 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |
| Support contacts | Support email/phone config | P3 | ❌ | ✅ | ✅ | ✅ | Easy | assumed |
| Feature toggles | Flag-driven features | P3 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |

## J. Homepage Editor

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| Block-based homepage editor (mode) | Add/reorder/edit blocks + preview | P2 | ❌ | ✅ | ✅ | ✅ | Hard | assumed |
| Device preview (desktop/mobile) | Preview toggle | P3 | ✅ | — | — | — | Easy | likely-new |
| Publish homepage | Draft → live | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |

## K. Developer Tools

| Feature | Description | Priority | FE only | BE | DB | API | Complexity | Confidence |
|---|---|---|---|---|---|---|---|---|
| API keys (create/rotate/revoke) | Manage keys | P2 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |
| Webhooks (CRUD + test + log) | Outbound webhooks | P3 | ❌ | ✅ | ✅ | ✅ | Hard | assumed |
| Supplier API connection + sync | Connect/sync external supplier | P2 | ❌ | ✅ | ✅ | ✅ | Hard | likely-new |
| Event/audit log | System event viewer | P3 | ❌ | ✅ | ✅ | ✅ | Medium | assumed |

## L. Cross-cutting UI primitives (mostly FE)

| Feature | Description | Priority | FE only | Complexity | Confidence |
|---|---|---|---|---|---|
| Toast notifications | Async feedback | P1 | ✅ | Easy | likely-new |
| Confirmation modals | Destructive-action guards | P1 | ✅ | Easy | likely-new |
| Loading skeletons | Per-region skeletons | P1 | ✅ | Medium | likely-new |
| Consistent toggle/badge/chip system | Unify controls | P1 | ✅ | Easy | likely-new |
| Empty + error states | Standardised across screens | P1 | ✅ | Easy | likely-new |
| Filter chips / filter bar | Reusable filtering | P1 | ✅ | Medium | likely-new |
| Keyboard navigation + focus rings | A11y + speed | P2 | ✅ | Medium | likely-new |
| Drag-and-drop utility | Featured/categories/homepage | P2 | ✅ | Medium | likely-new |

---

## Likely backend/data work implied by the design
- **Order state machine:** placed → payment review → paid → delivered (+ rejected / refunded), with timeline events and email-send records.
- **Code inventory model:** code pools per variant, status (available/reserved/delivered), bulk import, low-stock thresholds, Auto vs Manual source.
- **Payments:** proof storage, manual review actions, method config, review rules (auto-reject window, notifications), instant vs manual confirmation.
- **Aggregations:** revenue/orders metrics + period compare, stock alert counts, customer LTV.
- **Content:** featured ordering, homepage blocks, email templates w/ variable rendering, branding settings.
- **Search index:** cross-entity command-palette search.
- **Dev platform:** API keys, webhooks, supplier integration, audit log.

> Validate each "assumed" row against the real codebase — several may already exist and only need the **UI redesign** rather than new backend work.
