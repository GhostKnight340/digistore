# ghost.ma Admin — Data Model Mapping & Developer Specs

The bridge between the **UI** (`Ghost Admin.dc.html`) and the **data model** (`prisma/schema.prisma`, the source of truth). Read this alongside `06-Claude-Code-Implementation-Notes.md`. Target stack is fixed (see below) — build to it, don't substitute.

---

## 0 · Target stack (authoritative)
- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS** + **shadcn/ui** (Radix primitives) — dark theme only
- **Prisma ORM** → **PostgreSQL (Neon)** — pooled `DATABASE_URL`, `directUrl` for migrations
- **React Hook Form + Zod** for every form
- **Lucide React** icons
- **Server Components by default; Client Components only when interactive** (see §5)

Desktop-first admin. No light theme. Keep components reusable and the architecture clean.

---

## 1 · Screen → Prisma model map

| Screen (DC id) | Primary model(s) | Key relations / fields | Notes |
|---|---|---|---|
| Overview `#s1` | `Order`, `DigitalCode`, `PaymentProof` | aggregates: revenue = Σ `Order.totalMad`; review queue = `Order.status="payment_submitted"` | metrics are computed, not stored |
| Products `#s2` | `Product`, `ProductVariant`, `ProductMedia`, `Category` | `Product.variants`, `.media`, `.category → Category` | slug unique; soft-delete via `active` |
| Featured `#s3` | `ProductVariant.featured`, `StoreSetting["homepage.featured"]` | ordering array in `StoreSetting` | no dedicated order column |
| Order detail / Fulfillment `#s4` | `Order`, `OrderItem`, `DeliveredCode`, `PaymentProof`, `PaymentEvent`, `EmailLog` | `Order.items`, `.deliveredCodes`, `.paymentEvents`, `.emailLogs` | full state machine lives here |
| Inventory `#s5` | `DigitalCode`, `ProductVariant`, `StoreSetting["stock.lowThreshold"]` | group by `variantId, status` | counts computed |
| Store Settings `#s6` | `StoreSetting`, `SupportConfig` | key/value JSON | |
| Payment Settings `#s7` | `PaymentMethodConfig`, `Bank`, `CryptoWallet` | `method` unique per config | bank/usdt/paypal/card |
| Email Templates `#s8` | `EmailLog.templateKey` (+ proposed `EmailTemplate`) | template store not yet a model | see §4 gaps |
| Categories `#s13` | `Category` (+ `Product.category`) | tree/reorder; **no `parentId`** → nesting needs migration | flat for v1 unless added |
| Homepage Editor `#s14` | `StoreSetting` (homepage JSON), `ProductVariant.featured` | blocks in JSON; Trending bound to Featured | header-launched mode |
| Orders list `#s9` | `Order` (+ `OrderItem`, `Customer`) | status tabs = `Order.status`; indexes on `status`, `createdAt`, `paymentMethod` | server-paginated |
| Payment review `#s10` | `Order`, `PaymentProof`, `PaymentEvent`, `Bank` | queue = `payment_submitted` oldest-first | audit = `PaymentEvent[]` |
| Customers `#s11` | `Customer`, `Order`, `EmailLog`, `AuthToken` | `Customer.orders`; LTV computed | Google vs email `authProvider` |
| Developer Tools `#s12` | `EmailLog`, `StoreSetting`, `DigitalCode` (reserved) | email log, health, danger zone | env/simulation from `StoreSetting` |

---

## 2 · Status vocabularies (bind UI badges to these exact strings)
Status fields are **strings** in Postgres; the allowed set is defined by TS unions in `src/lib/types.ts`. Mirror them exactly.

**`Order.status`** → badge:
| value | label | color |
|---|---|---|
| `pending_payment` | Awaiting payment | neutral grey |
| `payment_submitted` | Payment review | amber |
| `payment_confirmed` | To fulfill | blue |
| `delivered` | Delivered | green |
| `payment_issue` | Payment issue | red |
| `rejected` | Rejected | red (muted) |
| `refunded` | Refunded | grey |
| `cancelled` | Cancelled | grey |

**`DigitalCode.status`**: `unused` (green, sellable) · `reserved` (amber, in-flight) · `used` (grey) · `disabled` (red).
**`EmailLog.status`**: `simulated` · `sent` · `failed`/`bounce` (red). **`EmailLog.type`**: `order_received` · `payment_submitted` · `payment_confirmed` · `payment_rejected` · `payment_issue` · `code_delivered`.
**`PaymentEvent.type`**: `status_change` · `proof_uploaded` · `admin_note`.
**`ProductVariant.stockMode`**: `automatic` (supplier) · `manual` (code pool). **`stockControl`**: `manual` default.
**`PaymentMethodConfig.method`**: `bank` · `usdt` · `paypal` · `card`.

Centralize these as `const` maps (`STATUS_LABEL`, `STATUS_TONE`) so the Badge component takes a raw status string and renders label + tone. Never hard-code labels in screens.

---

## 3 · Deeper per-screen dev specs
Shared shell dimensions: **Sidebar 248px** (fixed, full height), **Topbar 60px** (sticky). Content padding **24–28px**. Card radius **14px**; control radius **8–10px**. Hairline borders `rgba(255,255,255,0.07)`. See `05-Design-Tokens.md` / `tokens.json` for the full scale.

### Orders list `#s9`
- **Hierarchy:** `PageHeader` (title, count, search, date-range, Export) → `StatusTabs` (bound to `Order.status`, with counts) → `BulkActionBar` (visible when ≥1 selected) → `DataTable` → `Pagination`.
- **Table columns:** checkbox `34px` · Order `150px` (mono `#GH-` + truncated cuid) · Customer `flex` · Items `200px` · Method `110px` · Total `96px` right-aligned mono · Status `150px` · Date `128px` mono · row-menu `34px`.
- **Spacing:** header row height 36px controls; row padding `12px 18px`; sticky `thead` inside the scroll container.
- **Sorting:** Order & Date sortable (chevron); server-side `orderBy`. **Pagination:** server, `Showing 1–8 of 312`, rows-per-page select.
- **Bulk actions:** Mark delivered / Resend email / Cancel (danger) + Clear selection. Selected rows tint `rgba(62,123,250,0.06)`, checkbox filled accent.
- **shadcn:** `Table`, `Checkbox`, `Tabs`, `DropdownMenu` (row menu), `Button`, `Input`, `Popover`+`Calendar` (date range), `Badge`.
- **Server/Client:** table page is a Server Component (fetch + paginate); selection, bulk bar, sort toggles are a Client island.

### Payment review `#s10`
- **Hierarchy:** 3-pane — `ReviewQueue` (330px) · `ProofViewer` (flex) · `DecisionPanel` (352px).
- **Queue:** segmented filter (Submitted/Issues/Rejected); cards = order #, waiting timer (mono), customer + items, method chip, amount. Active card ringed accent.
- **Proof viewer:** zoom controls + Download; renders `PaymentProof.data` (base64 → `URL.createObjectURL`). Decode on the client; revoke the object URL on unmount.
- **Decision panel:** "Verify against" (expected `totalMad`, `Bank` RIB/holder, reference), customer risk (order/rejected counts), audit trail (`PaymentEvent[]` timeline). Sticky action footer: **Confirm → fulfill** (green), **Request new proof**, **Reject** (danger, confirm modal).
- **shadcn:** `ScrollArea`, `Tabs`/segmented, `Button`, `AlertDialog` (reject confirm), `Separator`.
- **Every action** writes `PaymentEvent` + `EmailLog` (see Flow 4). Auto-advance to next queue item on confirm.

### Customers `#s11`
- **Hierarchy:** `DataTable` (flex) + `ProfilePanel` (360px).
- **Columns:** Customer `flex` (monogram avatar + name + email) · Auth `92px` (Google/Email chip from `authProvider`) · Status `88px` (`emailVerified` → Verified/Unverified) · Orders `74px` right mono · Lifetime `110px` right mono (computed) · Last login `120px` mono (`lastLoginAt`).
- **Profile panel:** avatar + verification badge, 3-up KPI cards (orders / lifetime / rejected), Account facts (provider, joined `createdAt`, verified `emailVerifiedAt`, last login), recent orders list, actions (Email customer / Reset password → `AuthToken`).
- **shadcn:** `Table`, `Avatar`, `Badge`, `Card`, `Button`, `ScrollArea`.
- Google accounts (`googleId` set, no `passwordHash`): hide Reset password.

### Developer Tools `#s12`
- **Hierarchy:** `PageHeader` (+ env pill) → health-check grid `repeat(4,1fr)` → 2-col body: `EmailLog` viewer (`1.5fr`) + right column (email mode, `StoreSetting` JSON read-only, **Danger zone**).
- **Health checks:** Database (Neon latency), Email provider (delivery %), Code pools (reserved > 30 min from `DigitalCode.status="reserved"` + `reservedAt`), Proof storage (base64 size).
- **Email log:** rows from `EmailLog` — status dot, `type` (mono), subject, recipient, timestamp; filter All/Failed/Simulated; "Retry failed", "Open full log".
- **Danger zone:** Release stuck reservations (`reserved → unused` where `reservedAt` old); Purge old proofs (`PaymentProof` for delivered > 90d). Both gated by `AlertDialog`.
- **shadcn:** `Card`, `Switch` (simulation mode), `Tabs`, `AlertDialog`, `Badge`, `ScrollArea`.

---

## 4 · Schema reconciliation (updates `07`/`08` now that the schema is known)
The audit in `07`/`08` was written before the codebase existed. With `schema.prisma` in hand, re-bucket:

**✅ Already in the schema — build UI only, no DB work:**
- Order state machine + timeline → `Order.status` + **`PaymentEvent`** (audit trail exists).
- Emails-sent log → **`EmailLog`** (full, per order + customer, with provider/status/type).
- Payment proof storage → **`PaymentProof`** (base64 in Postgres).
- Code inventory pool with status → **`DigitalCode`** (`unused/reserved/used/disabled`, `reservedAt`, `assignedOrderId`).
- Featured flag → `Product.featured` / `ProductVariant.featured`.
- Region/currency on products → `Product.region`, variant `faceCurrency`.
- Settings (branding, maintenance, accent, homepage) → **`StoreSetting`** (key/value JSON) + `SupportConfig`.
- Payment methods → **`PaymentMethodConfig`**, `Bank`, `CryptoWallet`.
- Customer records + auth → **`Customer`**, `AuthToken`.
- Inventory mode → `ProductVariant.stockMode` / `stockControl`.

**⚠️ NOT in the schema — needs a migration before the feature ships (flag to backend):**
- **Refunds:** no `Refund` model — currently only `Order.status="refunded"` + `PaymentEvent`. Add `Refund` if partial/amount/reason tracking is required (Flow 6).
- **Nested categories:** `Category` has **no `parentId`** — the S9-Categories nesting/tree in `02-Screens.md` needs a self-relation added, or ship flat categories for v1.
- **Homepage blocks:** free-form blocks aren't modeled; homepage lives in `StoreSetting` JSON. Add `HomepageBlock` only if blocks beyond featured are needed (Flow 8).
- **Email templates:** no `EmailTemplate` model — templates are implied by `EmailLog.templateKey`. Add one to make S8 editable/persistent (Flow 13).
- **Internal notes:** no notes table — `PaymentEvent{type:"admin_note"}` covers order notes; customer notes would need a field/table.
- **API keys / webhooks:** not in schema. The redesigned Developer Tools (`#s12`) intentionally **drops** the API-key/webhook UI from the old audit and focuses on email log + health + danger zone, all backed by existing models. Add key/webhook tables only if that functionality is actually required.

**Correction to `08` DB bucket:** most rows there ("emails-sent table", "status-history table", "payment proof storage", "code pool table", "settings") are **already satisfied** by the schema. Only Refunds, category nesting, homepage blocks, and (optionally) email templates remain as genuine DB work.

---

## 5 · Next.js / component architecture

### Suggested folder structure
```
src/
  app/
    (admin)/
      layout.tsx            # AppShell: <Sidebar/> + <Topbar/> (Server)
      overview/page.tsx
      products/page.tsx
      featured/page.tsx
      orders/page.tsx           # #s9 table (Server) + <OrdersClient/>
      orders/review/page.tsx    # #s10
      orders/[id]/page.tsx      # #s4
      inventory/page.tsx
      customers/page.tsx        # #s11
      settings/store/page.tsx
      settings/payments/page.tsx
      settings/email/page.tsx
      settings/developer/page.tsx  # #s12
    homepage-editor/page.tsx  # full-screen mode (outside admin layout)
  components/
    shell/    Sidebar Topbar PageHeader CommandPalette
    ui/       # shadcn/ui generated primitives (button, table, dialog, …)
    admin/    Badge StatusChip DataTable BulkActionBar FilterChips
              StickySaveBar VariantRow OrderTimeline Dropzone
              EmptyState ErrorCard SkeletonRow KpiCard ProofViewer
              ReviewQueue DecisionPanel ProfilePanel
  lib/
    types.ts        # status unions (source of the vocabularies in §2)
    status.ts       # STATUS_LABEL / STATUS_TONE maps
    prisma.ts       # PrismaClient singleton
    format.ts       # MAD currency, dates, cuid truncation
    validations/    # Zod schemas per entity
  server/           # server actions: orders.ts payments.ts products.ts …
```

### Server vs Client
- **Server Components (default):** all list/detail pages — fetch via Prisma directly, paginate, aggregate.
- **Client Components (`"use client"`):** table selection + bulk bar, sticky save bar + dirty tracking, all forms (RHF), drag-reorder (Featured/Homepage), command palette, proof viewer (base64 decode), toggles, tabs, toasts.
- **Server Actions** for every mutation (confirm/reject/deliver/save/import). Revalidate the affected route after write. Wrap each in its Zod schema; return typed errors for inline field display.

### State management
- No global store needed. Server state via RSC fetch + Server Actions + `revalidatePath`. Local UI state (selection, dirty form, open panels) via component state / RHF. Toasts via a small context (`sonner` fits the toast spec). Command palette via `cmdk`.

### Recommended reusable React components
`AppShell`, `Sidebar`, `Topbar`, `PageHeader`, `KpiCard`, `Badge`/`StatusChip`, `Button`, `Toggle`/`Switch`, `Input`/`Select`/`Combobox`, `FilterChips`, `DataTable` (generic, column defs + sort + selection + pagination), `BulkActionBar`, `VariantRow`, `OrderTimeline`, `Dropzone`, `StickySaveBar`, `Modal`/`AlertDialog`, `Toast`, `Tabs`, `Accordion`, `Pagination`, `EmptyState`, `ErrorCard`, `SkeletonRow`, `ProofViewer`, `ReviewQueue`, `DecisionPanel`, `ProfilePanel`.

---

## 6 · Tailwind theme mapping
Load `tokens.json` into `tailwind.config.ts`. Map surfaces and semantics to CSS variables so shadcn's `bg-background` / `text-foreground` resolve correctly.

```ts
// tailwind.config.ts (theme.extend.colors) — values from tokens.json
colors: {
  background: '#08090B',          // app bg
  surface:    '#0C0D11',          // cards / rails
  'surface-2':'#0F1015',          // nested cards
  elevated:   '#121319',          // inputs / controls
  border:     'rgba(255,255,255,0.07)',
  foreground: '#F3F4F7',
  muted:      '#9A9FAB',
  subtle:     '#646A77',
  faint:      '#4D525D',
  accent:     '#3E7BFA',
  'accent-fg':'#EAF0FF',
  success:    '#2EA067',
  'success-fg':'#5BC98C',
  warning:    '#E8A838',
  danger:     '#E05C5C',
},
borderRadius: { control: '9px', card: '14px', pill: '999px' },
fontFamily: { sans: ['Geist','system-ui','sans-serif'], mono: ['Geist Mono','monospace'] },
```

**Common Tailwind recipes** (match the DC exactly):
- Card: `bg-surface-2 border border-border rounded-card p-5`
- Primary button: `h-9 px-4 rounded-control bg-accent text-white text-sm font-semibold`
- Secondary button: `h-9 px-4 rounded-control bg-elevated border border-white/10 text-foreground text-sm font-medium`
- Danger button: `h-9 px-4 rounded-control border border-danger/30 bg-danger/10 text-danger text-sm font-semibold`
- Status badge: `text-xs font-semibold rounded-md px-2 py-0.5 bg-{tone}/15 border border-{tone}/30 text-{tone}-fg`
- Table row: `flex items-center px-[18px] py-3 border-b border-white/5 hover:bg-white/[0.025]`
- Mono numerics: add `font-mono` to every currency/SKU/id/count/timer.
- Focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60`.

---

## 7 · Responsive adaptation (desktop-first, document-only)
No mobile visuals are drawn — this is a desktop ops tool. Adapt by breakpoint:

- **`xl` ≥1440 (design target):** full layout. Sidebar 248px expanded; all 3-pane workspaces show every pane; right panels at full width; tables show all columns.
- **`lg` 1200–1439:** narrow the right/side panels (queue 300 / decision 320 / profile 320); tables keep all columns but tighten padding; sidebar stays expanded.
- **`md` 900–1199:** **collapse right panels** — proof `DecisionPanel`, customer `ProfilePanel`, variant rail, email preview become a **toggle/drawer** (Radix `Sheet`); 3-pane → 2-pane; sidebar collapses to a 64px icon rail (labels on hover); tables drop low-priority columns (Method, cuid) into the row's expandable detail.
- **`sm` <900:** **off-canvas sidebar** (hamburger in topbar → `Sheet`); every workspace stacks to one column; tables become stacked cards (label/value pairs); **sticky save bar and primary actions are retained** and pinned to the bottom; Homepage Editor shows preview-only with a "edit on desktop" notice; touch targets ≥44px.

Rules that never change across breakpoints: the **app shell itself never scrolls** (only inner regions do); **Save / primary actions are always reachable without scrolling**; status colors and vocabularies are identical.

---

## 8 · Icons (Lucide React)
Use Lucide names — do not export SVGs. Sidebar + common mappings:

| Use | Lucide |
|---|---|
| Overview | `LayoutDashboard` |
| Products | `Package` |
| Categories | `List` / `FolderTree` |
| Featured | `Star` |
| Orders | `ShoppingBag` |
| Payment review | `CreditCard` / `ScanLine` |
| Fulfillment | `Check` / `PackageCheck` |
| Refunds | `RotateCcw` |
| Inventory | `Boxes` |
| Customers | `Users` |
| Store settings | `Settings` |
| Payment methods | `CreditCard` |
| Email templates | `Mail` |
| Supplier API | `Cable` / `Link2` |
| Developer tools | `Terminal` / `Code2` |
| Search | `Search` · Chevron `ChevronDown` · Row menu `MoreHorizontal` |
| Success | `Check`/`CheckCircle2` · Warning `AlertTriangle` · Error `AlertCircle`/`XCircle` |
| Upload | `UploadCloud` · Image `ImageIcon` · Download `Download` |

Icon sizes: 16px in nav/controls, 20px in empty/error tiles, 24–30px in large states, 11–13px inline with text. Stroke width 1.6–2.
