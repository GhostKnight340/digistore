# ghost.ma Admin — Claude Code Implementation Notes

Written for the AI implementing this admin. Read `01`–`05` first, then `09` (interaction flows) and `10` (data-model mapping — the Prisma bridge + stack). This doc tells you **how to build it efficiently and in what order**. Do not redesign — match the mockup (`Ghost Admin.dc.html`) and the tokens (`tokens.json`).

## Target stack (fixed — see `10 §0`)
Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Prisma → PostgreSQL (Neon) · React Hook Form + Zod · Lucide React · Server Components by default, Client only when interactive. **Dark theme only.**

---

## Which screens exist
**Fully designed (build to pixel intent) — every screen in the brief:** Overview, Products, Featured Products, Order Detail / Fulfillment, Inventory, Store Settings, Payment Settings, Email Templates, **Orders list (`#s9`)**, **Payment review queue (`#s10`)**, **Customers (`#s11`)**, **Developer Tools (`#s12`)**, **Categories (`#s13`)**, **Homepage Editor (`#s14`)** — plus a **screen-states gallery (`#states`)** (empty/loading/error/success for Orders, Payment review, Products, Inventory).

**Implied list views** behind detail pages: Fulfillment, Refunds — same grouped/paginated table as Orders list, different columns/filter.

---

## How they're connected (information architecture)
```
AppShell (Sidebar + Topbar) ── wraps every route
├─ /overview
├─ /catalogue
│   ├─ /products           (list+editor+variant rail)
│   ├─ /categories         (tree+editor)
│   └─ /featured           (search+order+preview)
├─ /orders
│   ├─ /                   (All orders table)
│   ├─ /review             (Payment review queue)
│   ├─ /fulfillment        (table)
│   ├─ /refunds            (table)
│   └─ /orders/:id         (Order Detail / Fulfillment)
├─ /inventory
├─ /customers
│   └─ /customers/:id
└─ /settings
    ├─ /store · /payments · /email · /supplier · /legal · /developer

Homepage Editor → /homepage-editor  (opened from the TOPBAR button; full-screen mode, not in sidebar)
```
- Overview queue rows → `/orders/:id`. Inventory "+ Codes" → code pool for a variant. Featured ↔ Products (a variant's Featured toggle reflects in `/featured`). Email templates are referenced by order events (delivery email).

## Which components should be reused
Build these once, use everywhere (see `03-Component-Library.md`): **Sidebar, Topbar, PageHeader, Card, Button, Badge/StatusChip, Toggle (+segmented), Input/Select/Combobox, FilterChips, Table (with grouping + row actions), VariantRow, OrderTimeline, Dropzone, StickySaveBar, Modal, Toast, Tabs, Accordion, Pagination, EmptyState, ErrorCard, SkeletonRow.**

Two layout wrappers carry most screens:
- `EditorLayout` = scrolling body + StickySaveBar (Products, Settings, Email, Categories).
- `Workspace3Pane` = fixed left + flex center + fixed right (Products, Featured, Email).
- `SplitDetail` = `1fr · 372px` + sticky header strip (Order detail, Customer detail).

## Which layouts are identical
- **Settings sub-pages** (Store, Payment, Email, Legal, Support, Feature toggles, Developer) all share the 210px settings sub-nav + content; only the content cards differ.
- **Products / Featured / Email** all share the three-pane workspace skeleton (different side-panel content).
- **Order list / Fulfillment / Refunds / Customers** are the same grouped/sortable Table with different columns.
- **Order detail / Customer detail** share the SplitDetail + timeline cards.

## Which elements should be sticky
- Topbar (top), Sidebar (full height, fixed).
- StickySaveBar (bottom of editor scroll region).
- Order-detail header strip (above split body).
- Long-table headers (within their scroll container).
- Settings sub-nav (alongside scrolling content).

## Which pages should never scroll (as a whole)
- **The app shell never scrolls.** Only inner regions scroll.
- Overview, Order detail, three-pane workspaces are designed to **fit one viewport** at ≥1440 with internal panels scrolling — the operator should not scroll the page to reach Save or primary actions.

## Which panels are resizable
- None are required for v1. Good future enhancement: draggable splitter between editor and right panel in Products / Order detail / Email. If implemented, persist width per user. Treat as optional.

## Which interactions are expected
See `04-Interactions.md` in full. Must-haves: command palette (`⌘K`), sticky save with dirty tracking, drag-reorder (Featured, Categories, Homepage blocks), accordion (Inventory groups), confirm modals for destructive actions, toasts for async results, skeletons on load, keyboard focus rings everywhere.

## How responsiveness should behave
- Desktop-first ops tool. `xl ≥1440` full; `lg 1200–1439` narrow right panels; `md 900–1199` collapse right panels → toggle, three-pane → two-pane; `sm <900` off-canvas sidebar, stacked editors, save bar retained. Don't optimise for phones — degrade gracefully.

---

## What to implement first (v1 — operational core)
Order matters; each builds on the last.
1. **AppShell** — Sidebar + Topbar + routing + active-state. (Unblocks everything.)
2. **Design tokens** — load `tokens.json` into your theme (CSS vars / Tailwind config). Geist + Geist Mono.
3. **Primitives** — Button, Badge, Toggle, Input/Select, Card, Table, Modal, Toast, EmptyState, ErrorCard, Skeleton.
4. **Orders** — All orders table → **Order Detail / Fulfillment** (payment confirm/reject, code entry, deliver, timeline). This is the revenue-critical path.
5. **Payment review** queue + Overview KPIs/queue.
6. **Products** workspace (list + editor + variants) with sticky save.
7. **Inventory** (grouped, alerts, manage/import codes).

## What can come later (v2)
8. **Featured Products** manager (drag-reorder + preview).
9. **Settings** (Store, Payment) with sticky save + autosave toggles.
10. **Email Templates** (editor + live preview + send test).
11. **Categories**, **Customers**.
12. **Homepage Editor** (mode), **Developer Tools**.
13. **Polish:** command palette, skeletons everywhere, drag/keyboard niceties, resizable splitters.

---

## Build guidance
- Use a real component library only if it can be themed to these exact tokens; otherwise hand-build primitives — they're small.
- Numbers, currency (MAD), SKUs, codes, IDs, timers, counts → **Geist Mono**.
- Currency is **MAD** by default (store-configurable); format with thin/space grouping as in mockups (`48 920 MAD`).
- Status semantics are fixed: green=success/in-stock/paid, amber=review/low, red=reject/out, blue=neutral/active/featured.
- Keep elevation from surface lightness + hairline borders; use the few defined shadows sparingly.
- Accessibility: visible focus rings, focus-trapped modals, `prefers-reduced-motion`, ≥44px touch targets on `sm`.

## Out of scope for the implementer
- Don't invent new screens, colors, or flows.
- Don't convert important workflows (orders) into drawers — the design explicitly uses full pages/splits.
- Don't move Homepage Editor into the sidebar — it's a header-launched mode by design.
