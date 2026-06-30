# ghost.ma Admin — Design Specification

> Source of truth: `Ghost Admin.dc.html` (dark, full-screen back-office for a digital-products marketplace).
> This document describes the design as built. It does **not** propose changes.

---

## 1. Overall layout

The admin is a **fixed, full-viewport application shell** — no public website header or footer. Every screen is composed inside a single reusable shell (`AdminShell`) measuring **1440 × 920** in the canvas mockups (the implementation target is fluid — see Breakpoints).

```
┌───────────────────────────────────────────────────────────┐
│ SIDEBAR (248px) │ TOPBAR (60px, sticky)                     │
│                 ├───────────────────────────────────────────┤
│  nav groups     │                                           │
│  (scrolls)      │   CONTENT AREA (fills, owns its scroll)   │
│                 │                                           │
│                 ├───────────────────────────────────────────┤
│  user footer    │   STICKY SAVE BAR (60px, when editing)    │
└───────────────────────────────────────────────────────────┘
```

Three structural regions:

1. **Sidebar** — fixed width 248px, full height, its own vertical scroll, persists across every screen.
2. **Main column** — flex:1, contains the topbar (fixed) and the content area (scrolls).
3. **Content area** — each screen owns its internal layout: single scroll, split-view, or three-pane. Editors append a **sticky save bar** pinned to the bottom of *their own* scroll region.

**Core principle:** _the user should never scroll to the bottom of a page to save._ Saving is always reachable via a sticky bottom bar or top-right header actions.

---

## 2. Navigation

Six top-level destinations, with two grouped clusters. **Homepage Editor is intentionally NOT in the sidebar** — it is a prominent button in the header because it is a distinct editing *mode*, not a list.

```
Overview
Catalogue ── Products · Categories · Featured
Orders    ── All orders · Payment review · Fulfillment · Refunds
Inventory
Customers
Settings  ── Store settings · Payment methods · Email templates
             Supplier API · Legal pages · Developer tools
```

- Sidebar groups use uppercase mono section labels (`CATALOGUE`, `ORDERS`, `SETTINGS`).
- Live counts appear as right-aligned pill badges on nav items (e.g. All orders `7`, Payment review `3`).
- The **Settings** cluster also renders as a left **sub-nav column (210px)** inside Settings screens, so settings sub-pages don't reuse the global sidebar for their internal tabs.

---

## 3. Grid system

- **No rigid 12-column grid.** Layout is **flexbox + CSS grid with `gap`**, never margin-based inline flow.
- KPI / card rows: `display:grid; grid-template-columns:repeat(N,1fr); gap:14px`.
- Split editors: `grid-template-columns:1fr 372px` (order detail) or `1.55fr 1fr` (overview), `gap:14–16px`.
- Three-pane workspaces (Products, Featured, Email) use fixed side columns + a flexible center: e.g. `288px | 1fr | 320px`.
- Standard gutters: **14px** between cards in a row, **16–18px** between stacked card groups.

---

## 4. Breakpoints

The mockups are fixed at 1440px. Implementation targets:

| Breakpoint | Width | Behaviour |
|---|---|---|
| `xl` | ≥ 1440 | Full layout, all panels visible, right detail panels expanded. |
| `lg` | 1200–1439 | Sidebar persists; right detail panels narrow (≈300px) or become collapsible. |
| `md` | 900–1199 | Right panels collapse to a toggle; three-pane workspaces drop to two-pane (list + editor, variants in a drawer/tab). |
| `sm` | < 900 | Sidebar collapses to icon-rail or off-canvas drawer; topbar search becomes an icon; editors stack single-column with sticky save bar retained. |

The admin is **desktop-first**; it is an operations tool, not a storefront. Below `md` it degrades gracefully but is not optimised for phones.

---

## 5. Sidebar behaviour

- Width **248px**, background `#0C0D11`, right border `1px solid rgba(255,255,255,0.07)`.
- **Header** (60px): logo mark + `ghost.ma` / `admin` lockup, bottom border.
- **Nav** (flex:1, scrolls): item height **36px**, radius **9px**, horizontal padding **12px**, gap **3px**, icon 16px + 11px gap to label (13.5px).
  - **Active item:** background `rgba(62,123,250,0.13)`, text `#EAF0FF`, weight 600, inset ring `inset 0 0 0 1px rgba(62,123,250,0.20)`.
  - **Inactive:** transparent, text `#9A9FAB`, weight 400.
- **Footer** (user card): avatar monogram, name + role, chevron; sits on a top border, never scrolls.
- Active highlight is data-driven via an `active` key (one of: overview, products, categories, featured, orders, payment, fulfillment, refunds, inventory, customers, settings, payments, email, supplier, developer).

---

## 6. Header behaviour

- Height **60px**, sticky, background `rgba(10,11,13,0.6)` + `backdrop-filter:blur(12px)`, bottom border.
- Left: **command search** — 420px max, 38px tall, magnifier icon, placeholder "Search or jump to… orders, products, customers", `⌘K` mono hint chip.
- Right cluster (in order): **View store** (outlined, external-link icon) · **Homepage Editor** (accent-tinted, pencil icon, weight 600) · **environment badge** (`LIVE`, green dot + mono label).
- The admin profile lives in the **sidebar footer**, not the header (the header keeps actions, not identity).

---

## 7. Sticky save bars

- Height **60px**, top border `1px solid rgba(255,255,255,0.08)`, background `rgba(12,13,17,0.85)` + blur, horizontal padding 26–28px.
- **Left:** save status —
  - Unsaved → amber dot + "Unsaved changes" (`#E8A838`).
  - Saved → green check + "All changes saved" (`#5BC98C` / muted text).
- **Right:** `Discard` (secondary) + `Save …` (primary accent). Primary may carry shadow `0 6px 18px rgba(62,123,250,0.32)`.
- Pinned to the bottom of the editor's own scroll region (`flex-shrink:0` after a scrolling `flex:1` body) — **not** the viewport bottom, so it stays visible regardless of content length.
- Appears on: Product editor, Settings, Email template editor. (Order detail uses header-strip actions instead.)

---

## 8. Cards

- Background `#0F1015`, border `1px solid rgba(255,255,255,0.07)`, radius **14px**.
- Internal padding **16–22px** depending on density.
- Section/group title: 13–15px weight 600, or an uppercase mono eyebrow (`11px`, `letter-spacing:0.08em`, color `#4d525d`).
- **Status-tinted cards** swap the border (and a faint bg wash) to the semantic hue — e.g. warning card border `rgba(232,168,56,0.22)`, danger `rgba(224,92,92,0.22)`, accent `rgba(62,123,250,0.22)`.

---

## 9. Tables

The admin deliberately avoids "database-looking" grids. Tables are **row-based flex layouts** with generous height and grouping.

- Header row: uppercase mono labels or a simple bold caption, bottom border.
- Data rows: 11–14px vertical padding, hairline separators `rgba(255,255,255,0.04–0.06)`.
- **Grouping:** rows can nest under a product/category header row (Inventory groups variants under their product, with an indent of ~64px on child rows).
- Numbers, SKUs, codes and counts use **Geist Mono**.
- Inline cells can host **progress bars** (stock level), **status chips**, and **row actions** (Manage / + Codes buttons, 30px tall).
- Total / summary rows use a darker fill `#0C0D11` and a top border.

---

## 10. Forms

- Field label: 12px, `#9A9FAB`, 6px below-gap.
- Input / select: height **38–40px**, background `#121319`, border `1px solid rgba(255,255,255,0.1)`, radius **9px**, padding `0 13px`, text 13.5px.
- Focused/active inputs use an accent border `rgba(62,123,250,0.3)`.
- Selects show a right chevron (14px, `#646A77`).
- Two-column field grids: `grid-template-columns:1fr 1fr; gap:14px`.
- Mono is used for code-like values (SKU prefixes, references).

---

## 11. Modals

- Centered dialog, background `#15161d`, border `1px solid rgba(255,255,255,0.1)`, radius **12px**, padding 16px, shadow `0 16px 36px rgba(0,0,0,0.5)`.
- Title 13.5px weight 600 + supporting line 12px muted.
- Actions right-aligned: `Cancel` (secondary, 32px) + confirm (semantic; destructive = danger red).
- Used for confirmations (reject payment, delete product). Backdrop: dim + slight blur (implementation).

---

## 12. Drawers

- **Deliberately minimised.** Important work (orders, product editing) uses full pages or split views, never a cramped side drawer — this was an explicit fix from the old admin.
- Drawers are acceptable only for lightweight, non-blocking peeks (e.g. a quick variant add on small screens, notifications). Right-side, ~360px, same surface tokens as cards.

---

## 13. Icons

- **Lightweight line icons**, 1.6–2px stroke, `currentColor`, no fills (Feather/Lucide style).
- Sizes: **16px** sidebar nav, **14px** inline buttons/meta, **18–22px** feature glyphs and empty/error states.
- Minimal usage — icons clarify, they don't decorate. No emoji in chrome (the one 🎮 appears only inside sample email *content*).

---

## 14. Buttons

| Variant | Fill | Border | Text | Use |
|---|---|---|---|---|
| Primary | `#3E7BFA` | none | `#fff` 600 | Save, primary CTA |
| Secondary | `#121319` | `rgba(255,255,255,0.12)` | `#F3F4F7` 500 | Discard, View store |
| Danger | `rgba(224,92,92,0.08)` | `rgba(224,92,92,0.3)` | `#E05C5C` 600 | Reject, Delete |
| Success | `#2EA067` | none | `#fff` 600 | Confirm payment |
| Ghost / tertiary | transparent | optional hairline | `#9A9FAB` / `#9FB8FF` | low-emphasis links |

- Default height **36–38px**, radius **9px**, padding `0 14–22px`, 13px text.
- Small buttons (inline table/row actions): 28–30px, 12px text, radius 8px.
- Icon + label gap: 7px.

---

## 15. Toggles

- Track 40 × 23px, radius 999px; knob 18px circle, 2.5px inset.
- **On:** track `#3E7BFA`, knob right, white knob.
- **Off:** track `rgba(255,255,255,0.1)`, knob left, knob `#9A9FAB`.
- Segmented variant (Auto / Manual, date ranges): pill group, active segment uses accent-soft bg + light text.

---

## 16. Typography

- **UI font:** `Geist` (400/500/600/700).
- **Mono font:** `Geist Mono` (400/500) — numbers, currency, SKUs, codes, IDs, counts, keyboard hints, eyebrow labels.
- Scale (as used):

| Token | Size / weight | Use |
|---|---|---|
| Display | 56px / 600, ls −0.035em | Doc cover only |
| H2 | 30px / 600, ls −0.02em | Section titles (canvas) |
| Page title | 20–22px / 600 | In-screen page heading |
| Card title | 13.5–15px / 600 | Card / group headers |
| Body | 13–13.5px / 400 | Default UI text |
| Meta | 11.5–12.5px | Secondary / muted info |
| Eyebrow | 11px / 600, ls 0.08em, uppercase | Group labels |
| KPI number | 27px / 600 mono | Stat values |

- Line-height ~1.5 body; titles tightened with negative letter-spacing.

---

## 17. Colors

See `05-Design-Tokens.md` for the full token table. Summary:

- **Backgrounds:** app `#0A0B0D`, sidebar `#0C0D11`, card `#0F1015`, input `#121319`, elevated `#15161d`.
- **Text:** primary `#F3F4F7`, muted `#9A9FAB`, faint `#646A77`, fainter `#4d525d`.
- **Accent (blue):** `#3E7BFA`, strong `#5E92FF`, soft `rgba(62,123,250,0.13)`, on-accent text `#9FB8FF` / `#EAF0FF`.
- **Semantic:** success `#2EA067`/text `#5BC98C`, warning `#E8A838`, danger `#E05C5C`.
- **Borders:** hairline `rgba(255,255,255,0.06)`, default `rgba(255,255,255,0.07)`, input `rgba(255,255,255,0.1)`, strong `rgba(255,255,255,0.13)`.

---

## 18. Border radius

| Token | Value | Use |
|---|---|---|
| frame | 16px | App shell outer frame |
| card | 14px | Cards, panels |
| control | 9px | Buttons, inputs, selects |
| small | 8px | Small buttons, segmented controls, chips-as-buttons |
| chip | 6px | Status badges, count pills, kbd hints |
| pill | 999px | Toggles, round dot pills |
| avatar | 8–10px | Monogram avatars (rounded square) |

---

## 19. Shadows

| Level | Value | Use |
|---|---|---|
| frame | `0 40px 120px rgba(0,0,0,0.6)` | App shell elevation (mockup) |
| primary glow | `0 6px 18px rgba(62,123,250,0.32)` | Primary / accent buttons |
| success glow | `0 6px 18px rgba(46,160,103,0.3)` | Confirm payment button |
| toast | `0 10px 26px rgba(0,0,0,0.4)` | Toasts, floating featured row |
| modal | `0 16px 36px rgba(0,0,0,0.5)` | Modals |
| email preview | `0 12px 30px rgba(0,0,0,0.5)` | Email preview card |

Shadows are used sparingly — elevation comes mostly from surface lightness + hairline borders, not heavy drop shadows.

---

## 20. Spacing system

Base unit **4px**. Common steps: 4 · 6 · 8 · 9 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26 · 28.

- Content area padding: **24–28px**.
- Card padding: **16–22px**.
- Row vertical padding: **9–14px**.
- Inter-card gap: **14px**; group gap: **16–18px**.
- Icon-to-label: **7–11px**.

---

## 21. Component sizing (quick reference)

| Element | Size |
|---|---|
| App shell | 1440 × 920 (mockup) |
| Sidebar | 248px wide |
| Settings sub-nav | 210px wide |
| Topbar / save bar | 60px tall |
| Command search | 420px max, 38px tall |
| Nav item | 36px tall |
| Button (default) | 36–38px tall |
| Button (small) | 28–30px tall |
| Input / select | 38–40px tall |
| Toggle | 40 × 23px |
| Avatar (monogram) | 30–38px |
| KPI card | ~1fr × ~100px |
| Product list column | 288px |
| Variant rail | 320px |
| Order detail right panel | 372px |
| Email preview panel | 340px |
