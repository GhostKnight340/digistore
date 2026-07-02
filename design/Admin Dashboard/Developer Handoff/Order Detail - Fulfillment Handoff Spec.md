# Handoff: ghost.ma — Order Detail · Fulfillment (Admin)

## Overview
The full-page **Order detail / fulfillment** screen from the ghost.ma admin dashboard. This is where an operator reviews a customer's payment proof, enters the purchased digital codes, and delivers the order by email. It is intentionally a full-page split view (not a cramped side drawer) so payment, codes, customer, and timeline are all visible at once.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior. They are **not production code to copy directly**.

`.dc.html` files run on a small internal component runtime (`support.js`) and use a custom `<dc-import>` tag to compose components. Do **not** port that runtime or the tag. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Next.js, etc.) using its established components, styling approach, and routing. If no frontend environment exists yet, pick the most appropriate framework and implement there.

Styling is inline in the prototype. Translate to the codebase's convention (CSS modules, Tailwind, tokens, etc.). Every value needed is documented below so the screen can be built from this README alone.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and states are specified — match them exactly.

---

## Design Tokens

Note: the **admin** surface is slightly darker than the storefront. Frame base `#070809`, sidebar `#0C0D11`, panels `#0F1015`.

### Colors
| Token | Value | Usage |
|---|---|---|
| frame bg | `#070809` | Outer admin frame |
| sidebar bg | `#0C0D11` | Left nav, table total row |
| content bg | `#0A0B0D` | Main content area |
| panel | `#0F1015` | All cards / panels |
| well | `#121319` | Inputs, code rows, chips, buttons (neutral) |
| stripe well | `repeating-linear-gradient(135deg,#15161d,#15161d 8px,#121319 8px,#121319 16px)` | Payment-proof placeholder |
| border | `rgba(255,255,255,0.07)` | Panel borders, dividers |
| border-subtle | `rgba(255,255,255,0.05–0.06)` | Row separators |
| accent | `#3E7BFA` | Primary (Deliver), active nav, code-input focus border |
| accent-text | `#9FB8FF` | Accent labels, "View full", Homepage Editor |
| accent-soft | `rgba(62,123,250,0.13)` | "Manual entry" chip, active nav bg |
| success | `#2EA067` (text `#5BC98C`) | Confirm payment, entered code, LIVE, sent email |
| warning | `#E8A838` | "Payment review" badge, awaiting-review timeline dot |
| danger | `#E05C5C` | Reject payment |
| text | `#F3F4F7` | Primary text |
| text-muted | `#9A9FAB` | Labels, secondary |
| text-faint | `#646A77` | Meta, timestamps, helper text |
| text-dim | `#4d525d` | Nav section headers |

### Typography
- **Fonts:** `Geist` (UI), `Geist Mono` (order id, amounts, references, codes, kbd, timestamps).
| Role | Size | Weight | Notes |
|---|---|---|---|
| Order id `#GH-2418` | 20px | 600 | Geist Mono, -0.01em |
| Panel title (Items, Payment, Timeline…) | 13px | 600 | |
| Item name | 13.5px | 500 | |
| Body / rows | 12.5–13px | 400 | |
| Amounts | 13.5px (total 16px) | 400/600 | Geist Mono |
| Badges / chips | 11–11.5px | 600 | |
| Meta / timestamps / helper | 11–12.5px | 400 | faint, some Geist Mono |

### Spacing & Radii
- Admin frame: **1440 × 920** fixed (sidebar 248px, topbar 60px, order header strip auto).
- Content split: `1fr 372px` (left work area / right context rail).
- Left column padding **22px 26px**; right rail padding **20px**; gap between panels **18px**.
- Panel padding **16px**; header strip **18px 28px**.
- Radii: panel **14px**, inner rows / inputs **10px**, buttons **9–10px**, badges **6px**, avatar **10px**.

### Shadows
- Confirm payment button: `0 6px 18px rgba(46,160,103,0.3)`.
- Frame: `0 40px 120px rgba(0,0,0,0.6)`.
- Active nav item: `inset 0 0 0 1px rgba(62,123,250,0.20)`.

---

## Screen Structure

### Admin chrome (from `AdminShell`)
- **Left sidebar (248px):** logo `ghost.ma` + `admin` mono tag; grouped nav — Overview / *Catalogue*: Products, Categories, Featured / *Orders*: All orders (count `7`, active here), Payment review (count `3`, amber), Fulfillment, Refunds / Inventory, Customers / *Settings*: Store settings, Payment methods, Email templates, Supplier API, Developer tools. Footer: user chip "Younes B. · Owner". Active item = `rgba(62,123,250,0.13)` bg, `#EAF0FF` text, weight 600, inset accent ring.
- **Topbar (60px):** search ("Search or jump to… orders, products, customers", `⌘K`), spacer, **View store** (ghost btn), **Homepage Editor** (accent-outline btn), **LIVE** pill (green dot + mono).

### Order header strip (sticky, below topbar)
- Back chevron button (32px square).
- `#GH-2418` (mono, 20px) + **Payment review** badge (amber tint).
- Sub-line: "Placed 30 Jun 2026, 09:14 · waiting 42 min" (faint).
- Right actions: **Reject payment** (danger outline), **Request new proof** (neutral), **Confirm payment** (green solid, check icon, shadow).

### Left work area (`1fr`, scrollable)
1. **Items** panel (bordered list): row = 40px gradient thumb + name + mono SKU (`STEAM-EU-50 × 1`) + amount. Rows: Steam Wallet 50 EUR → 540 MAD; Steam Wallet 5 EUR ×2 → 118 MAD. **Total** row on `#0C0D11`: **658 MAD** (mono 16px 600).
2. **Payment + Proof** (2-col grid):
   - *Payment*: Method "Bank transfer · CIH", Reference "GH2418-CIH" (mono), Amount "658 MAD" (mono). Label left muted / value right.
   - *Payment proof*: header + "View full" (accent), striped placeholder well with image icon + `receipt_cih.jpg` (mono).
3. **Code delivery** panel: title + **Manual entry** chip (accent-soft) + "1 of 3 codes ready" (right, faint). Three code rows:
   - Steam 50 EUR — filled, green-border, `XXXXX-7K2PA-9MTL4` (mono green), `✓ entered`.
   - Steam 5 EUR — empty input (accent border), "Enter code…", tag `#1`.
   - Steam 5 EUR — empty input (neutral border), "Enter code…", tag `#2`.
   - **Deliver order & send email** button (accent, full width, `opacity .55` disabled) + helper "Enter all codes and confirm payment to enable delivery".

### Right context rail (372px, scrollable)
1. **Customer** panel: MK avatar + "Mehdi Karimi" / "mehdi.k@gmail.com"; divider; "Lifetime orders" → "14 · 8 920 MAD".
2. **Timeline** panel (flex:1): vertical connector dots + label/meta —
   - *Awaiting payment review* (amber dot) "09:14 · proof uploaded by customer"
   - *Order placed* (blue dot) "09:14 · 3 items · 658 MAD"
   - *Checkout started* (blue dot) "09:11"
3. **Emails sent** panel: "Order confirmation · 09:14" (green check), "Code delivery · pending" (faint clock).
4. **+ Add internal note** (ghost button).

---

## Interactions & Behavior
- **Confirm payment** transitions the order out of `Payment review`; enables delivery once all codes are entered. **Reject payment** / **Request new proof** are the alternate decision paths.
- **Code delivery** button is disabled (`opacity .55`, non-interactive) until: (a) every code input filled AND (b) payment confirmed. Clicking it delivers codes and sends the email — after which "Code delivery" in *Emails sent* flips from pending → sent (green check), and a timeline entry is appended.
- **Code inputs**: focus/filled rows use accent border; a validated/entered code uses the green border + `✓ entered`.
- **View full** opens the payment-proof image in a larger viewer.
- Nav active state driven by the shell's `active` prop (`orders` here).

## State Management
- `order`: id, status (`payment_review` | `confirmed` | `fulfilled` | `rejected`), placedAt, waitingMinutes.
- `items[]`: { name, sku, qty, amount }, plus `total`.
- `payment`: { method, reference, amount, proofUrl }.
- `codes[]`: { label, value, status: `entered` | `empty` }; derived `codesReady = filled/total`.
- `customer`: { name, email, lifetimeOrders, lifetimeValue }.
- `timeline[]`, `emails[]` (each { type, status, at }).
- Derived `canDeliver = paymentConfirmed && codes.every(filled)`.

## Design Tokens Summary (quick copy)
```
--admin-bg:#070809; --sidebar:#0C0D11; --content:#0A0B0D; --panel:#0F1015; --well:#121319;
--border:rgba(255,255,255,.07); --accent:#3E7BFA; --accent-text:#9FB8FF; --accent-soft:rgba(62,123,250,.13);
--success:#2EA067; --success-text:#5BC98C; --warning:#E8A838; --danger:#E05C5C;
--text:#F3F4F7; --muted:#9A9FAB; --faint:#646A77;
radii: panel 14 · row/input 10 · button 9-10 · badge 6
split: 1fr / 372px · sidebar 248 · gap 18 · panel pad 16
```

## Assets
- **Fonts**: Geist + Geist Mono via Google Fonts.
- **Icons**: inline SVG, Lucide-style, stroke 1.6–2.2. Icons used: chevron-left, check, image, clock, mail, and the shell nav set (grid, box, list, star, bag, card, refresh, cube, users, gear, code, edit, external-link). Swap for the codebase icon library (Lucide recommended).
- **Product thumbnails & payment proof**: placeholders (gradient / striped wells). Replace with real product art and the uploaded receipt image.
- No raster assets required to reproduce the layout.

## Files
- `Ghost Order Detail.dc.html` — the standalone Order detail · fulfillment screen (this is the extracted `#s4` view). Open in a browser to view.
- `AdminShell.dc.html` — the admin chrome (sidebar + topbar) the screen mounts inside; documents the surrounding navigation. Reference for behavior/structure.
- `support.js` — prototype runtime only. **Do not port.**
- Source of truth in the project: section `#s4` of `Ghost Admin.dc.html`.
