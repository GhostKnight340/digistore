# ghost.ma Admin — Screen-by-Screen Documentation

Each screen lists: Purpose · Layout · Visible components · Actions · States · Interactions · Responsive · Loading · Empty · Error · Success · Hover · Focus · Disabled.

**Status legend:**
- 🟢 **In mockup** — fully designed in `Ghost Admin.dc.html`.
- 🟡 **Specified** — defined here from the system; not yet drawn (build to these rules).

**DC section-id map (updated):** the mockup now draws every screen plus a states gallery. Note these are numbered by DC section id, which differs from the S-numbers below:
- `#s9` **Orders list** (all states) 🟢 · `#s10` **Payment review queue** (all states) 🟢 · `#s11` **Customers** 🟢 · `#s12` **Developer Tools** 🟢 · `#s13` **Categories** 🟢 · `#s14` **Homepage Editor** 🟢
- `#states` **Screen states gallery** — empty / loading / error / success for Orders, Payment review, Products, Inventory.
- Every screen in the brief is now drawn. Data-model grounding is in `10-Data-Model-Mapping.md`; step-by-step flows in `09-Interaction-Flows.md`.

Shared chrome on every screen: **Sidebar (248px)** + **Topbar (60px)** as defined in `01-Design-Specification.md` §5–6.

---

## S1 · Overview 🟢

- **Purpose:** the morning glance — revenue, order queue, alerts, what needs the operator today.
- **Layout:** content padding 26/28px → page header row → KPI grid `repeat(4,1fr)` → two-column body `1.55fr 1fr` (revenue chart | payment-review queue).
- **Visible components:** greeting + date; date-range segmented control (Today / 7d / 30d); Export button; 4 KPI cards (Revenue, Orders, Awaiting review, Out-of-stock); bar chart (7 bars, Friday highlighted); payment-review queue list with "Open review queue →".
- **Actions:** switch range, export, open an order from the queue, jump to review queue.
- **States:** range-selected; KPI delta up/down (green/red); warning/danger-tinted KPI cards when counts > 0.
- **Interactions:** hover a bar → tooltip with exact value; hover queue row → highlight + cursor; click row → S7 Order detail.
- **Responsive:** `lg` chart and queue stack 1fr/1fr; `md` KPIs wrap to 2×2; `sm` single column.
- **Loading:** KPI numbers + bars as shimmer skeletons; queue shows 3 skeleton rows.
- **Empty:** queue empty → "No payments waiting" mini empty state; chart with no sales → flat baseline + caption.
- **Error:** if metrics fail → inline error card replacing the chart ("Couldn't load revenue · Retry").
- **Success:** export → toast "Report exported".
- **Hover:** bars lighten; queue rows get `#15161d` bg.
- **Focus:** range segments and Export are tab-focusable with accent ring.
- **Disabled:** Export disabled (greyed, no shadow) while a report is generating.

---

## S2 · Products (Catalogue) 🟢

- **Purpose:** manage parent products and their variants in one workspace.
- **Layout:** three panes — **product list (288px)** | **editor (flex)** | **variant rail (320px)**; editor has a scrolling body + **sticky save bar (60px)**.
- **Visible components:** list with category group headers, filter input, "+ New"; editor header (thumb, name, Active/Featured badges, mono SKU/slug, Duplicate, Delete); quick-toggle row (Visibility, Featured, Stock mode); Details field grid (name, category select, region/currency, SKU prefix); Media (thumb + dashed dropzone); variant rail (per-variant cards: label, stock chip, SKU, price); sticky save bar (unsaved status, Discard, Save product).
- **Actions:** select product, new, duplicate, delete, toggle visibility/featured, change stock mode, edit fields, upload media, add/edit/remove variant, save, discard.
- **States:** selected product (accent ring in list); active vs hidden; featured on/off; stock mode Automatic vs Manual; variant stock in-stock/low/out (green/amber/red border); unsaved vs saved.
- **Interactions:** click list item → load editor; toggle switches flip instantly + mark unsaved; "+ Add" variant; drag media; delete asks for confirm modal.
- **Responsive:** `md` variant rail → tab/drawer; list collapses to a dropdown above the editor on `sm`.
- **Loading:** list skeleton rows; editor field skeletons.
- **Empty:** no products → centered empty state ("No products yet · Create your first product"); no variants → "Add a variant".
- **Error:** save failure → toast (danger) + save bar stays "unsaved"; media upload error → red helper under dropzone.
- **Success:** save → bar flips to "All changes saved" + green toast.
- **Hover:** list rows lighten; delete button tints stronger red; variant cards lift slightly.
- **Focus:** all inputs/toggles focus-ringed; Save reachable via keyboard.
- **Disabled:** Save disabled when no unsaved changes; "+ Codes" hidden when stock mode = Automatic with supplier.

---

## S3 · Featured Products 🟢

- **Purpose:** curate and order the homepage "Trending now" section.
- **Layout:** three panes — **Add variant search (300px)** | **ordered featured list (1fr, drag)** | **homepage preview (360px)**.
- **Visible components:** variant search combobox + results (with "+" add, already-added disabled, out-of-stock flagged); ordered list rows (drag handle, position mono index, thumb, name, price/stock, remove ×); homepage preview (2×2 product grid mirroring the order); "Publish changes".
- **Actions:** search, add variant, remove, drag-reorder, publish.
- **States:** item added/disabled; out-of-stock (red), low (amber); dragging (elevated row); unpublished changes.
- **Interactions:** drag rows to reorder → preview reflows live; add/remove updates both list and preview; publish persists.
- **Responsive:** `md` preview collapses to a toggle; `sm` search becomes a top field, list full-width.
- **Loading:** list + preview skeletons.
- **Empty:** no featured items → empty state in the list + placeholder grid in preview.
- **Error:** publish failure → danger toast, changes retained.
- **Success:** publish → "Featured section updated" toast.
- **Hover:** add buttons brighten; drag handle shows grab cursor; remove × tints.
- **Focus:** combobox results keyboard-navigable (↑/↓/Enter); reorder operable via keyboard (move up/down).
- **Disabled:** already-added rows greyed; Publish disabled with no changes.

---

## S4 · Order Detail / Fulfillment 🟢

- **Purpose:** review payment, enter/deliver codes, track the order — on one full page, never a drawer.
- **Layout:** header strip (back, order #, status, actions) → split body `1fr 372px`. Left: Items, Payment + Proof (2-col), Code delivery. Right: Customer, Timeline, Emails sent, Add note.
- **Visible components:** order # (mono) + status badge + waiting time; **always-visible actions** (Reject / Request new proof / Confirm payment); items table with total; payment facts; payment-proof preview (View full); code-delivery block (manual-entry chips: entered vs input fields, per-line) + "Deliver order & send email" (disabled until ready) + helper; customer card (LTV); vertical timeline; emails-sent list; add-note button.
- **Actions:** back, confirm payment, reject (confirm modal), request new proof, enter codes, deliver order, add internal note, view proof full-size.
- **States:** status (Payment review / Paid / Delivered / Rejected); per-code entered vs pending; deliver enabled only when all codes present AND payment confirmed; email sent vs pending.
- **Interactions:** confirm → status advances + timeline entry; enter all codes → deliver button enables; deliver → sends email, adds timeline + email entries, toast.
- **Responsive:** `md` right panel moves below the left content as stacked cards; header actions wrap; `sm` single column, actions in a sticky header.
- **Loading:** skeleton for items/timeline; action buttons disabled.
- **Empty:** no proof uploaded → dashed placeholder "Awaiting proof"; no codes entered → empty inputs.
- **Error:** invalid code / duplicate → red field border + helper; action failure → danger toast.
- **Success:** confirm/deliver → green toast + updated badges and timeline.
- **Hover:** action buttons shift fill; proof preview shows "View full" affordance.
- **Focus:** code inputs tabbable in order; primary actions keyboard-reachable.
- **Disabled:** Deliver disabled (55% opacity) until prerequisites met; Confirm hidden once Paid.

---

## S5 · Inventory 🟢

- **Purpose:** product-oriented stock management and code pools (not a flat SKU table).
- **Layout:** page header (+ Bulk import) → alert strip `repeat(3,1fr)` (Out of stock / Low stock / Codes in stock) → grouped table (product header rows → indented variant rows).
- **Visible components:** bulk-import button; 3 alert cards; product group rows (chevron, thumb, name, variant/code count, stock-mode badge); variant rows (label, mono SKU, stock progress bar, count chip, Manage / + Codes).
- **Actions:** expand/collapse group, bulk import, manage codes, add codes, toggle inventory mode (Automatic / Manual) per product.
- **States:** in-stock (green), low (amber), out (red, "+ Codes" CTA); stock mode Automatic vs Manual entry; group expanded/collapsed.
- **Interactions:** click group header → expand/collapse; Manage → code list view/drawer; + Codes → paste/import codes; bulk import → upload + map.
- **Responsive:** `md` progress bar narrows; `sm` rows stack label/SKU/count vertically; alert strip wraps.
- **Loading:** alert counts + rows skeleton.
- **Empty:** no products → empty state; product with 0 codes → "0 · out" + prominent + Codes.
- **Error:** import parse error → danger banner with line numbers; supplier unreachable → error card (auto-restock paused, retrying).
- **Success:** import → "N codes added" toast + counts update.
- **Hover:** rows lighten; Manage/+ Codes buttons tint.
- **Focus:** group headers and row actions keyboard-operable.
- **Disabled:** Manage disabled for Automatic-mode variants without manual pool.

---

## S6 · Store Settings 🟢

- **Purpose:** branding & global store configuration, scannable and card-based.
- **Layout:** settings sub-nav (210px) | content with scrolling body + **sticky save bar**. Sections: Store identity card, Accent color card, Maintenance toggle card.
- **Visible components:** sub-nav (Branding active, + Homepage, Payment methods, Email templates, Legal pages, Support contacts, Feature toggles, Developer tools); logo replace; identity field grid (store name, support email, tagline, currency select); accent swatches; maintenance toggle; sticky save (saved status, Discard, Save changes).
- **Actions:** switch settings tab, replace logo, edit fields, pick accent, toggle maintenance, save/discard.
- **States:** active sub-nav item; saved vs unsaved; maintenance on/off; selected accent (ring).
- **Interactions:** tab switch loads section; edits mark unsaved; accent click selects; toggle flips.
- **Responsive:** `md` sub-nav collapses to a top tab bar; field grid → single column.
- **Loading:** field skeletons.
- **Empty:** n/a (settings always populated).
- **Error:** invalid email → field error; save failure → danger toast.
- **Success:** save → "All changes saved" + toast.
- **Hover:** swatches scale; rows/buttons tint.
- **Focus:** inputs/toggles ringed; sub-nav arrow-navigable.
- **Disabled:** Save disabled when saved.

---

## S7 · Payment Settings 🟢

- **Purpose:** enable payment methods and proof-review rules, with clear status.
- **Layout:** settings sub-nav (210px) | content. Method cards stacked → "Review rules" 2-col card grid.
- **Visible components:** "+ Add method"; method cards (icon, name, status badges [Active / Manual review / Instant / Disabled], description, enable toggle); review-rule cards (Auto-reject window, Notify on new proof toggle).
- **Actions:** add method, enable/disable method, configure rules, save.
- **States:** Active (accent border) vs Disabled (dimmed, off toggle); Manual review vs Instant; rule values.
- **Interactions:** toggle method on/off; edit rule values; disabled methods show requirement ("Stripe connection required").
- **Responsive:** `md` review rules → single column; method card content wraps.
- **Loading:** method card skeletons.
- **Empty:** no methods → empty state prompting "+ Add method".
- **Error:** connection error on a provider → danger badge + helper.
- **Success:** change → autosave/toast.
- **Hover:** cards lift; toggles tint.
- **Focus:** toggles and value fields ringed.
- **Disabled:** card greyed (70% opacity), toggle off, when prerequisites missing.

---

## S8 · Email Templates 🟢

- **Purpose:** edit transactional emails with variables and a live preview.
- **Layout:** three panes — **template list (248px)** | **editor (flex, sticky save)** | **live preview (340px)**.
- **Visible components:** template list (name, trigger, enabled dot green/amber/grey); editor (title + Enabled badge + Send test; Subject field; Body editor with highlighted `{variable}` chips; variable palette); preview (rendered branded email on white card); sticky save (unsaved status, Discard, Save template).
- **Actions:** select template, edit subject/body, insert variable, send test, save/discard, enable/disable.
- **States:** selected template (accent row); enabled/disabled; unsaved; variable chips.
- **Interactions:** click template → load; click variable chip → insert at cursor; edits update preview live; send test → toast.
- **Responsive:** `md` preview collapses to a toggle/tab; `sm` list → dropdown, editor full-width.
- **Loading:** editor + preview skeleton.
- **Empty:** template with empty body → preview shows placeholder.
- **Error:** unknown variable → amber inline warning; send-test failure → danger toast.
- **Success:** save → "Template saved"; test → "Test email sent to …".
- **Hover:** list rows + variable chips tint.
- **Focus:** subject/body focusable; variable palette buttons tabbable.
- **Disabled:** Save disabled when saved; Send test disabled while sending.

---

## S9 · Categories 🟢 *(drawn as `#s13`)*

- **Purpose:** organise products into a category tree used by storefront nav and filters.
- **Layout:** two panes — category tree (left, 340px, drag-reorder + nest) | category detail (right): identity header, Details grid (name, slug, parent select, accent color, tagline), visibility toggle, cover gradient, product count; **sticky save bar**.
- **Visible components:** tree rows (drag handle, color swatch, name, mono count; nested rows indented), "+ New"; detail form; visibility toggle; gradient preview.
- **Data:** `Category` (slug unique, `tagline`, `accentColor`, `gradient`, `active`, `sortOrder`). **⚠️ Nesting shown in the tree needs a `Category.parentId` self-relation migration** — see `10 §4`; ship flat for v1 if not added.
- **Actions:** create, rename, set parent, reorder, nest/unnest, toggle visibility, delete, save.
- **States:** selected (accent ring), nested/indented, hidden (dimmed), drag.
- **Interactions:** drag to reorder/nest; click → detail; delete asks confirm (warns if products attached).
- **Responsive / Loading / Empty / Error / Success / Hover / Focus / Disabled:** mirror S2 patterns (tree+editor+sticky save, confirm modal for destructive, skeleton rows, empty state "No categories yet").

---

## S10 · Customers 🟢 *(drawn as `#s11`)*

- **Purpose:** customer profiles, order history, lifetime value.
- **Layout:** table (flex, searchable/filterable) + **profile panel (360px)** — split, not a separate route.
- **Visible components:** search + "Verified only" filter; rows (monogram avatar, name, email, Auth chip [Google/Email from `authProvider`], Status [`emailVerified`], Orders, Lifetime value, Last login `lastLoginAt`); profile panel (avatar + verification badge, 3-up KPI cards, Account facts, recent orders, Email customer / Reset password).
- **Actions:** search/filter, open customer, open an order, email customer, reset password (issues `AuthToken`).
- **States:** selected (accent left-border), verified/unverified chip, sortable columns.
- **Interactions:** row click → profile panel; sort columns; pagination.
- **Data:** `Customer` (+ `Order[]`, `EmailLog[]`, `AuthToken`); LTV computed from delivered/confirmed `Order.totalMad`. See `10 §3`.
- **Responsive / Loading / Empty / Error / Success / Hover / Focus / Disabled:** standard table patterns (skeleton rows, "No customers match" empty, hover row tint, focusable rows, pagination disabled at bounds). Google accounts hide "Reset password".

---

## S11 · Homepage Editor 🟢 *(drawn as `#s14`, header button, distinct mode)*

- **Purpose:** compose the storefront homepage (hero, featured, category grid, banners) — opened from the **header**, not the sidebar.
- **Layout:** full-screen editor mode (1440×920) — top bar (Exit, Draft badge, device toggle desktop/mobile, Save draft, Publish); left **block list (270px)** with per-block enable toggles + drag handles; center **live canvas preview** (rendered storefront on a dashed backdrop, selected block ringed accent); right **block settings (300px)**.
- **Visible components:** block rows (Hero banner, Trending now [Featured-bound], Category grid, Promo banner, Footer); live hero + product grid + category grid preview; settings panel (title, products-shown, "bound to Featured" callout, show-prices toggle, Remove block).
- **Data:** homepage composition stored in **`StoreSetting`** JSON (e.g. `homepage.featured` ordered ids). **⚠️ Free-form blocks beyond featured need a `HomepageBlock` model** — see `10 §4`. "Trending now" is bound to S3 Featured (edit products there).
- **Actions:** add/remove/reorder/toggle blocks, edit block settings, device-preview toggle, save draft, publish.
- **States:** draft vs published, block selected (ring), block enabled/disabled, device = desktop/mobile.
- **Interactions:** drag blocks; edits reflect in preview live; publish upserts `StoreSetting`.
- **Responsive / Loading / Empty / Error / Success / Hover / Focus / Disabled:** editor is desktop-only; mobile shows preview-only with a notice; skeleton on load; empty homepage → "Add your first block"; publish failure → danger toast; success → "Homepage published".

---

## S12 · Developer Tools 🟢 *(drawn as `#s12`)*

- **Purpose:** environment, diagnostics and escape hatches — grounded in the real schema (`EmailLog`, `StoreSetting`, `DigitalCode`), not a generic API-key console. *(The old API-keys/webhooks concept was dropped — those tables don't exist in the schema; see `10 §4`.)*
- **Layout:** full content page — page header (+ PRODUCTION DATA pill) → health-check grid `repeat(4,1fr)` → 2-col body: **Email log** (`1.5fr`) + right column (Email sending mode, `StoreSetting` JSON read-only, **Danger zone**).
- **Visible components:** health cards (Database/Neon, Email provider, Code pools reserved > 30 min, Proof storage size); email-log rows (status dot, `EmailLog.type`, subject, recipient, timestamp, All/Failed/Simulated filter); simulation-mode toggle + Send test; read-only `StoreSetting` JSON; danger zone (Release stuck reservations, Purge old proofs).
- **Actions:** filter/retry email log, toggle simulation mode, send test email, release reserved codes, purge old `PaymentProof`.
- **States:** health green/amber, email sent/simulated/failed, simulation on/off.
- **Interactions:** retry failed → toast; danger actions → `AlertDialog` confirm; send test → toast.
- **Responsive / Loading / Empty / Error / Success / Hover / Focus / Disabled:** health cards + log rows skeleton on load; "No emails in range" empty; failed rows tinted red; destructive actions gated by confirm modal; toggle + buttons focusable.

---

### Cross-screen note
**Every screen in the brief is now fully drawn** — Orders list, Payment review, Customers, Developer Tools (DC `#s9`–`#s12`), Categories (`#s13`), Homepage Editor (`#s14`), plus the states gallery (`#states`). All screens reuse the same primitives — list/tree+editor+sticky save, split detail, grouped/paginated table, settings sub-nav, confirm modal, toast, status badges — so nothing introduces new visual language. Bind every screen to the models and status strings in `10-Data-Model-Mapping.md`.
