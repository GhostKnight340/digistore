# GhostMA — Customer Profile

The customer account area was authored as **one design file** with three switchable views plus
device and empty/populated states. Open the file in a browser — the control strip at the top
toggles Desktop/Mobile and Populated/Empty; the sidebar/tabs switch views. Nothing here is
newly generated.

## Files
- **Ghost Account — Customer Profile (Dashboard, Orders, Security).dc.html** — the full account area (all views + states + in-file spec section at the bottom).
- **support.js** — prototype runtime (keep alongside the .dc.html). Not for production.
- **Developer Handoff/** — full redesign spec: tokens, screens, components, interactions, state model.

## Screen / view index
| Requested screen | Where it lives |
|---|---|
| Dashboard | Dashboard view (`/compte`) — info cards + personal info + recent orders |
| Orders | Orders view (`/compte/commandes`) — full history with filters |
| Order Details | "Voir le code" action on order rows (Orders view) |
| Security | Security view (`/compte/securite`) — password, 2FA, active sessions |
| Personal Information | "Informations personnelles" panel within the Dashboard view |
| Empty States | Empty order state — toggle "Populated/Empty" in the top control strip |
| Components | Order-row / info-card / panel components — documented in Developer Handoff |
| Assets | Inline SVG (Lucide-style) icons; no raster assets required — see Developer Handoff |
| Developer Handoff | `Developer Handoff/` folder |

## Responsive
Desktop and Mobile (440px frame, 860px breakpoint) versions are both in the file — switch with
the "Desktop/Mobile" toggle in the top control strip.
