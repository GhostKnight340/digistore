# GhostMA — Admin Dashboard

All admin screens were authored as **one consolidated design file**, with each screen as a
labelled section. Open the main file in a browser and use the badge id (e.g. `#s1`) in the URL,
or scroll to the section. Nothing here is newly generated — this is the existing work, organized.

## Files
- **Ghost Admin — Operations Dashboard (all screens).dc.html** — the full dashboard, every screen below.
- **Order Detail — Fulfillment (standalone screen).dc.html** — the Order-detail screen extracted as its own file.
- **Admin Shell — Shared Sidebar & Topbar.dc.html** — the reusable admin chrome the screens mount inside.
- **support.js** — prototype runtime (keep next to the .dc.html files so they render). Not for production.
- **Developer Handoff/** — full implementation spec, screen specs, component library, tokens, interaction flows, Prisma schema.

## Screen index (section id inside the main file)
| Requested screen | Where it lives |
|---|---|
| Dashboard Overview | `#s1` — Overview dashboard |
| Products | `#s2` — Catalogue / products workspace (list) |
| Product Details | `#s2` — product editor + variants (within the products workspace) |
| Categories | `#s13` — Categories tree + editor |
| Featured Products | `#s3` — Featured products manager |
| Orders | `#s9` — Orders list |
| Order Details | `#s4` — Order detail / fulfillment (also the standalone file) |
| Payment Review | `#s10` — Payment review queue + proof viewer |
| Fulfillment | `#s4` — same full-page fulfillment view (code delivery) |
| Refunds | Nav item under Orders; follows the Orders-list pattern (`#s9`). Spec: Developer Handoff `10-Data-Model-Mapping.md` |
| Inventory | `#s5` — Inventory workspace |
| Customers | `#s11` — Customers table + profile panel |
| Store Settings | `#s6` — Settings (tabbed) |
| Payment Methods | `#s7` — Payment methods |
| Email Templates | `#s8` — Email templates (admin editor) — full designs in the Email Templates folder |
| Homepage Editor | `#s14` — Homepage editor (full-screen mode) |
| Supplier API | Nav item; developer/integration surface — see `#s12` Developer tools + handoff |
| Developer Handoff | `Developer Handoff/` folder |
| Components | `#components` — Component library section |
| Assets | Inline SVG (Lucide-style) icons; no raster assets required — documented in Developer Handoff |

## States
Empty / loading / error / success versions for the key workspaces are in the **`#states`**
section of the main file (control-strip / screen-states gallery).
