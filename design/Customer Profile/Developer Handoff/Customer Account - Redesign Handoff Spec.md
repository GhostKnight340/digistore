# Handoff: ghost.ma — Customer Account Redesign

## Overview
A premium redesign of the ghost.ma customer account area (the "Mon compte" / "Espace client" section) for a digital gift-card & game-code store. It covers the account dashboard, orders history, and security settings, in a dark, modern SaaS/e-commerce style. Existing page functionality is preserved — this is a visual + hierarchy redesign, not a feature change.

## About the Design Files
The file in this bundle (`Ghost Account.dc.html`) is a **design reference created in HTML** — a working prototype showing the intended look and behavior. It is **not production code to copy directly**.

`.dc.html` files run on a small internal component runtime (`support.js`). Do **not** try to ship that runtime. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Next.js, etc.) using its established components, styling approach, and routing. If no frontend environment exists yet, pick the most appropriate framework for the project and implement there.

The prototype uses inline styles throughout. Translate those into the codebase's convention (CSS modules, Tailwind, styled-components, design tokens, etc.). All exact values are documented below so you can implement from this README alone.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and interaction states are specified. Recreate the UI closely using the codebase's existing libraries and patterns. Match the design tokens below exactly.

---

## Design Tokens

### Colors
| Token | Hex / value | Usage |
|---|---|---|
| bg | `#0A0B0D` | Page background (outer canvas `#08090B`) |
| surface | `#121319` | Card base, navbar chip, controls |
| surface-2 | `#171922` | Secondary button background |
| well / input | `#0C0D11` | Inputs, order rows, nested wells |
| card-gradient | `linear-gradient(180deg,#121319,#0F1015)` | Panels / cards |
| identity-gradient | `linear-gradient(160deg,#151b28,#0f1218)` | Sidebar identity card |
| border | `rgba(255,255,255,0.07)` | Default borders / dividers |
| border-strong | `rgba(255,255,255,0.12)` | Secondary button, hover borders |
| accent | `#3E7BFA` | Primary actions, active nav, badges |
| accent-light | `#5E92FF` | Accent text, links, eyebrow labels |
| accent-soft | `rgba(62,123,250,0.12)` | Accent tint backgrounds |
| success | `#2fbf71` (text `#43cf86`) | Verified, "Livré", current session |
| warning | `#f5a524` | "En cours" order status |
| danger | `#f0616d` | Déconnexion, disconnect session, danger |
| text | `#F3F4F7` | Primary text |
| text-muted | `#9A9FAB` | Secondary text |
| text-faint | `#646A77` | Labels, meta, placeholders |
| text-dim | `#8891a3` | Descriptions |

### Typography
- **Font families:** `Geist` (UI), `Geist Mono` (labels, order refs, amounts, code). Google Fonts.
- **Weights loaded:** Geist 400/500/600/700, Geist Mono 400/500.

| Role | Size | Weight | Tracking / notes |
|---|---|---|---|
| Page title (h1) | 33px | 600 | letter-spacing -0.03em (26px on mobile) |
| Card / section title (h2) | 17px | 600 | -0.01em |
| Spec/section big | 26px | 600 | -0.02em |
| Info card value | 16px | 600 | -0.01em |
| Body | 14.5px | 400 | line-height 1.5 |
| Secondary / description | 13–13.5px | 400 | color muted/dim |
| Nav item | 14px | 500 (600 active) | |
| Mono label | 11px | 500 | letter-spacing 0.14–0.18em, uppercase, faint |
| Order ref / amount | 12–14px | 400/600 | Geist Mono |

### Spacing & Radii
- Page max-width: **1200px** (frame `1180px` desktop, `440px` mobile).
- Content grid: `264px 1fr`, gap **26px**.
- Section gap (stacked panels): **20px**.
- Card padding: **26px** (info cards 20–22px; 22/18px on mobile).
- Row / small-card gap: **10–16px**.
- Radii: input **11px**, order row **13px**, info card **16px**, panel/card **18px**, identity card **18px**, pill **999px**.

### Shadows / Effects
- Primary button shadow: `0 8px 22px -6px rgba(62,123,250,0.55)`; hover `0 12px 30px -6px rgba(62,123,250,0.7)`.
- Focus ring: `0 0 0 3px rgba(62,123,250,0.16)` + `border-color:#3E7BFA`.
- Card frame shadow: `0 50px 130px -40px rgba(0,0,0,0.85)`.
- Ambient glow: radial `rgba(62,123,250,0.07)` at top-right of page; radial `rgba(62,123,250,0.22)` blur in identity card.
- Navbar: `position:sticky; backdrop-filter:blur(16px); background:rgba(10,11,13,0.78)`.
- Transitions: **0.15–0.18s ease** on border/background/transform; toggle **0.2s ease**.

---

## Screens / Views

The design is a single account area with three routes and two orthogonal states (device, orders-present). Suggested routes: `/compte`, `/compte/commandes`, `/compte/securite`.

### Shared chrome

**Navbar** (sticky, 64px tall, blurred):
- Left: logo — 30px rounded-8px blue-gradient square with a 11px white outlined square inside + wordmark `ghost` + `.ma` in `#5E92FF`.
- Search (max 400px, 38px, `#121319`, radius 10): magnifier icon, placeholder "Rechercher un produit numérique…", `Ctrl K` mono kbd chip on the right.
- Nav links (muted): **Catalogue**, **Suivi commande**, **Support**.
- Cart icon with badge "1" (blue pill, 2px page-colored ring).
- Account chip (pill, `#121319`): 28px "Z" gradient avatar + "Zakariya F." + chevron.

**Sidebar** (264px, sticky top:88px):
- **Identity card** (identity-gradient, radius 18, glow): 46px rounded-14 gradient avatar "Z", name "Zakariya Finnaoui", email "ziko.you13@gmail.com", plus a green **"Compte vérifié"** pill (check icon).
- **Nav** (vertical): *Tableau de bord* (grid icon), *Commandes* (bag icon, right-aligned count chip `5`), *Sécurité* (shield icon). Active item: `rgba(62,123,250,0.12)` bg, `rgba(62,123,250,0.28)` border, `#5E92FF` text, weight 600. Inactive: transparent, muted text.
- Divider, then **Déconnexion** button — full width, danger tint (`rgba(240,97,109,0.06)` bg, `rgba(240,97,109,0.22)` border, `#f0616d` text, logout icon).

**Footer**: 4-col grid (`1.6fr 1fr 1fr 1fr`) — brand blurb + PRODUITS / AIDE / LÉGAL link columns (mono uppercase headings). Bottom bar: "© 2026 ghost.ma · Tous droits réservés" and "Paiements sécurisés" with lock icon.

**Page header**: eyebrow mono label "ESPACE CLIENT" (`#5E92FF`), h1 title, muted subtitle. Title/subtitle change per view:
- dashboard → "Mon compte" / "Gérez votre profil, vos commandes et votre sécurité."
- orders → "Mes commandes" / "Historique complet de vos achats numériques."
- security → "Sécurité" / "Protégez votre compte et vos codes."

### 1. Dashboard (`/compte`)
Purpose: overview of identity, editable profile info, recent orders.
- **Info cards row** (3 cols): **NOM** (person icon) → "Zakariya Finnaoui" / "GhostKnight"; **E-MAIL** (mail icon) → "ziko.you13@gmail.com" / "Adresse principale"; **STATUT** (shield, green-tinted card `rgba(47,191,113,0.22)` border) → "Vérifié" / "E-mail confirmé". Labels are mono uppercase faint.
- **Informations personnelles** panel: icon-badge + title + description "Ajoutez un numéro pour sécuriser vos commandes.". Phone input (48px, phone icon, placeholder `+212 6 00 00 00 00`) with focus ring. **Enregistrer** primary button below (max 420px column). Saving → spinner + "Enregistrement…", then "Enregistré ✓".
- **Commandes récentes** panel: header "Commandes récentes" / "Vos derniers achats liés à ce compte." + **Tout voir** secondary button (arrow icon) that navigates to Orders. Shows first 3 orders (see order-row spec) OR the empty state.

### 2. Orders (`/compte/commandes`)
Purpose: full order history.
- Populated: panel with a toolbar — search field ("Rechercher une commande…") + segmented filter (Toutes / Livrées / En cours, "Toutes" active blue). Below, full list of order rows, each with a **Voir le code** blue-tint action button on the right.
- Empty: centered empty state (see below).

### 3. Security (`/compte/securite`)
- **Mot de passe** panel: icon-badge + title + "Choisissez un mot de passe fort et unique.". 3 password inputs in a `1fr 1fr` grid (current spans full width; new + confirm side by side), 46px, focus ring. Primary button **Mettre à jour le mot de passe**.
- **2FA** panel: shield icon-badge + "Authentification à deux facteurs" / "Ajoutez une couche de protection à la connexion." + a toggle switch on the right (46×26 track, 20px knob; off `rgba(255,255,255,0.12)`, on `#3E7BFA`, knob slides left 3px → 23px).
- **Sessions actives** panel: title + "Appareils actuellement connectés à votre compte." + list: "Chrome · Windows" / "Casablanca, Maroc · Maintenant" with green **"Cet appareil"** pill; "Safari · iPhone" / "Rabat, Maroc · Il y a 3 jours" with danger **Déconnecter** button.

### Order row component (used in recent + full list)
`display:flex; align-items:center; gap:14px; padding:13–14px; background:#0C0D11; border:1px solid rgba(255,255,255,0.06); radius:13px`. Hover → border `rgba(255,255,255,0.14)`.
- **Platform thumbnail**: 44–46px rounded-11 well with a diagonal-stripe repeating-gradient and mono platform code (STEAM / PSN / XBOX / NTND) in `#5A6070`.
- **Product name** (14px, 600) + mono meta line "`#GH-4821` · 28 juin 2026" (12px, faint).
- **Status pill**: Livré → green tint; En cours → amber tint; Remboursé → neutral grey tint. `radius 999; padding 4px 11px; 11.5px 600`.
- **Amount** (mono, 14px, 600, right-aligned).
- (Orders page only) **Voir le code** button — blue tint (`rgba(62,123,250,0.10)` bg, `rgba(62,123,250,0.3)` border, `#5E92FF`).

Sample order data:
```
STEAM  Steam Wallet 200 MAD          #GH-4821  28 juin 2026  200 MAD  Livré
PSN    PlayStation Store 150 MAD     #GH-4790  19 juin 2026  150 MAD  Livré
XBOX   Xbox Game Pass · 3 mois       #GH-4753  11 juin 2026  320 MAD  En cours
STEAM  Steam Wallet 100 MAD          #GH-4699  2 juin 2026   100 MAD  Livré
NTND   Nintendo eShop 250 MAD        #GH-4601  21 mai 2026   250 MAD  Remboursé
```

### 4 & 5. Empty vs. Populated orders state
Both Dashboard "Commandes récentes" and the Orders page have these two states.
- **Empty state**: centered — 60–66px rounded well with a blue bag icon, heading "Aucune commande pour le moment", muted explainer, and a **Parcourir le catalogue** primary button (arrow icon).
- **Populated state**: the order rows described above.

### 6. Mobile version
Frame max-width 440px. Breakpoint at **860px** for real responsive behavior.
- Content grid `264px 1fr` → **single column**.
- Sidebar hidden; replaced by a **horizontal scrollable tab bar** (Tableau de bord / Commandes / Sécurité; active tab = solid blue).
- Navbar: search field and text nav links hidden; logo + cart + account chip remain.
- Info-cards row 3 → 1 column; footer 4 → 2 columns; panel padding reduces (22/18px); h1 → 26px.

---

## Interactions & Behavior
- **Navigation**: sidebar items and mobile tabs switch the active view (route). "Tout voir" and empty-state CTA navigate to Orders / catalogue.
- **Phone save**: button enters loading (spinner, "Enregistrement…", `opacity .75`, `cursor:progress`) for ~1.3s, then shows "Enregistré ✓". Editing the field again clears the saved flag.
- **2FA toggle**: knob slides, track color animates (0.2s ease).
- **Filters** (orders): segmented control; wire to filter the list by status.
- **Hover states**: buttons lift `translateY(-1px)`; rows/secondary buttons brighten border; tinted buttons deepen tint.
- **Focus**: inputs get `border-color:#3E7BFA` + 3px accent ring.
- All transitions 0.15–0.2s ease.

## State Management
- `view`: `'dashboard' | 'orders' | 'security'` (prefer real routing).
- `phone`: string; `saving`: bool; `saved`: bool.
- `twofa`: bool.
- Orders should come from an API/`orders` collection; `ordersState` empty/populated is derived from whether the collection is non-empty (in the prototype it's a manual toggle for demoing both states).
- Order status enum: `Livré` (delivered), `En cours` (processing), `Remboursé` (refunded).

## Assets
- **Fonts**: Geist + Geist Mono via Google Fonts (`https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500`).
- **Icons**: inline SVG, Lucide-style, stroke width 1.7–2, no heavy fills. Swap for the codebase's icon library (Lucide recommended). Icons used: grid/dashboard, shopping-bag, shield, log-out, user, mail, phone, search, cart, chevron-down, arrow-right, lock, monitor, smartphone, check.
- **Platform thumbnails**: placeholder diagonal-stripe wells with mono platform codes — replace with real platform artwork/logos when available.
- No raster image assets are required to reproduce the layout.

## Files
- `Ghost Account.dc.html` — the full design reference (dashboard, orders, security, empty/populated, mobile, plus an in-file design-spec section at the bottom). Open in a browser to interact. The control strip at the top toggles Desktop/Mobile and Populated/Empty; the sidebar/tabs switch views.
- `support.js` — the prototype runtime only. **Reference for behavior, do not port.**
