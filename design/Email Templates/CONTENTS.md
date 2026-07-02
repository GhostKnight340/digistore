# GhostMA — Email Templates

The transactional email system was authored as **one design file** plus exported renders.
It is built from a small set of master templates that share one header, footer, type scale,
button set and spacing — only the icon, title, message, CTA and status color change per message
type. Nothing here is newly generated.

## Files
- **Ghost Email System — All Templates & Components.dc.html** — the full system: master templates, status badges, component library, and design tokens (desktop + mobile).
- **support.js** — prototype runtime (keep alongside the .dc.html). Not for production.
- **Developer Handoff/Email System — Implementation Guide.md** — build guide (MJML / React Email), full tokens, per-template specs.
- **Assets/** — exported logos, icon set, and rendered PNG previews (desktop + mobile, and full-template renders).

## Message / template index
Each message below is a variant of a master template (differing icon + status color). The full
rendered previews are in `Assets/`.

| Requested message | Master template / render |
|---|---|
| Order Received | Order-update template → `Assets/rendered-previews (full templates)/Template 2 — Order Updates.png` |
| Payment Received | Order-update / action template (Template 2 / 3) |
| Payment Confirmed | Order-update template → Template 2 |
| Order Delivered | Delivery template → `Template 4 — Delivery.png` |
| Support Reply | Support & refund template → `Template 5 — Support & Refund.png` |
| Email Verification | Account & security template → `Template 1 — Account & Security.png` |
| Password Reset | Account & security template → `Template 1 — Account & Security.png` |
| Shared Components | `#components` section of the .dc.html + `Assets/Component Library & Status Badges.png` |
| Assets | `Assets/` — logos (SVG + PNG), icon set (SVG), rendered previews |
| Developer Handoff | `Developer Handoff/` folder |

## Renders
- `Assets/rendered-previews (desktop & mobile)/` — per-template desktop + mobile PNGs.
- `Assets/rendered-previews (full templates)/` — the five full master-template renders.
