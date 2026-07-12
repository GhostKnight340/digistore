# Handoff: Ghost.ma Category Hero

**Design → Engineering handoff · v1.0 · July 2026 · Final — no design decisions open.**

The companion reference is `reference_Category Hero.dc.html` in this bundle (open in a browser; use the Tweaks `brand` prop to preview every category). This README is the machine-readable summary for Claude Code. Where they differ, the reference file wins.

## Overview

Replaces the current category-page hero (boxed panel with a lone brand logo) on **every** catalogue category page of ghost.ma. New pattern: full-bleed dark hero with a brand-tinted halo, a fan of three of our **own card designs** bleeding off the right edge, badge + headline + subcopy + two CTAs on the left. One component, parameterized per brand — never ship a giant third-party logo as the hero image again.

## About the design files

`reference_Category Hero.dc.html` is an **HTML design reference** — a prototype showing intended look and behavior, not production code. Recreate it in the site's existing stack. `assets/marques/` contains the final brand marks — use as-is, never redraw or recolor.

## Fidelity

**High-fidelity.** All sizes, colors, offsets, and copy strings are exact.

## Brand matrix (one hero per category)

| brand key | Display name | Accent | Denominations shown (front → back) | Unit | Headline |
|---|---|---|---|---|---|
| `steam` | Steam Wallet | `#66C0F4` | 5 · 20 · 100 | EUR | Rechargez votre Steam Wallet |
| `playstation` | PlayStation Store | `#4a9eff` | 10 · 25 · 50 | EUR | Cartes PlayStation Store |
| `xbox` | Xbox | `#3fae3f` | 5 · 25 · 100 | EUR | Cartes cadeaux Xbox |
| `google-play` | Google Play | `#00F076` | 5 · 25 · 100 | EUR | Cartes cadeaux Google Play |
| `itunes` | iTunes | `#FB5BC5` | 5 · 25 · 100 | EUR | Cartes cadeaux iTunes |
| `apple` | Apple Gift Card | `#c9d1d9` | 5 · 25 · 100 | EUR | Apple Gift Card |
| `netflix` | Netflix | `#E50914` | 15 · 25 · 50 | EUR | Cartes cadeaux Netflix |
| `pubg` | PUBG Mobile | `#F2A900` | 60 · 325 · 660 | UC | UC PUBG Mobile |
| `free-fire` | Free Fire | `#FFB300` | 100 · 310 · 520 | Diamants | Diamants Free Fire |

Subcopy strings are final per brand — copy them verbatim from the reference file's logic (`BRANDS` map). Steam's subcopy enumerates the full denomination range (5, 10, 20, 50, 100 €); other card brands use the "payez en dirhams, code officiel par e-mail" formula; PUBG/Free Fire use the account top-up formula.

Denomination values shown on the artwork are decorative range markers, not the buy list — the product grid below the hero remains the source of truth. Feed them from the same catalogue data if convenient.

## Layout spec (1440px reference; hero min-height 720px)

- **Canvas**: `#07090f`, `overflow: hidden`, text `#f2f5fa`, font **Sora** (Google Fonts; weights 400–800).
- **Halo**: `radial-gradient(900px 640px at 78% 42%, accent@0.16, accent@0.05 45%, transparent 70%)` + secondary `radial-gradient(700px 500px at 95% 85%, rgba(37,99,235,0.10), transparent 65%)`.
- **Grid texture**: 56px square grid lines at `rgba(255,255,255,0.025)`, masked to a radial zone around the artwork.
- **Card fan** (absolute container, right edge flush, `top: 50%; translateY(-54%)`, 640×560):
  - Back card: 340×214, `rotate(-14deg)`, top 40 / right 300, opacity 0.55, border accent@0.18.
  - Middle card: 360×226, `rotate(-6deg)`, top 130 / right 150, opacity 0.8, border accent@0.28, label "CARTE CADEAU".
  - Front card: 380×238, `rotate(3deg)`, top 240 / right 44, border accent@0.40, glow `0 0 60px accent@0.12`, labels "CODE DIGITAL" + "Livré par e-mail" in accent. **Front card must sit fully inside the viewport — no clipped text.**
  - Cards use dark neutral gradients (`#1b2a3d → #0c1420` family), radius 18–20px, colored logo on front, white/mono logo on back cards.
- **Left fade** over artwork: `linear-gradient(90deg, #07090f 0% → 34%, 55%@0.55, transparent 75%)` so text stays readable.
- **Content column**: max-width 1200 centered, padding 96/48/72, flex column `gap: 28px`.
  - Badge pill: accent dot 7px + uppercase label, bg accent@0.08, border accent@0.28.
  - H1: 64px / 1.04 / 800 / letter-spacing −0.025em, max-width 620px.
  - Subcopy: 17px / 1.65, `#a7b4c6`, max-width 520px.
  - CTAs: primary "Voir les produits →" — site blue `#2563eb` (hover `#1d4ed8`), 12px radius, 15/28 padding, shadow `rgba(37,99,235,0.35)`. Secondary "Contacter le support" — `rgba(255,255,255,0.05)` + 1px `rgba(255,255,255,0.14)` border. **Primary CTA stays site-blue on every brand** — only the ambient/artwork tint changes.

## Accent derivation

All brand tinting derives from the single accent hex: bg/badge `@0.08`, borders `@0.18 / 0.28 / 0.40`, glow `@0.12`, halo `@0.16 → @0.05`, badge text `@0.90`. Implement as one `rgba(accent, α)` helper — no per-brand hand-tuned colors.

## Assets (`assets/marques/`)

- `{brand}.svg` — colored mark, front card + any full-color use.
- `white/{brand}.svg` — white mono mark, muted back cards.
- `free-fire.png` / `free-fire-ff.png` — Free Fire has no SVG; use PNG for all card positions.
- `colors.json` — canonical accent hexes (PlayStation and Xbox accents are brightened for dark-bg contrast: `#0070D1→#4a9eff`, `#107C10→#3fae3f`; keep these UI values).

## Responsive

- ≤ 1024px: scale card fan to ~0.8, keep right-edge bleed; H1 48px.
- ≤ 720px: hide the card fan entirely (halo stays), H1 40px, content full-width, CTAs stack if needed. Never show clipped cards on mobile.

## Accessibility

- Card fan container: `aria-hidden="true"` (decorative).
- Front-card logo `alt` = brand name; muted logos `alt=""`.
- CTA contrast: white on `#2563eb` passes AA; badge text derives from accent — verify AA per brand at 12.5px/600 (darken label if a brand fails).

## Don'ts

Third-party logo as the whole hero panel · clipped text on cards · brand-colored primary CTA · stat strip below CTAs (removed by design) · MAD denominations on card artwork (catalogue is EUR / UC / Diamants) · redrawn or recolored brand marks.

## QA checklist

- [ ] All 9 brands render via the single component with only `brand` changing.
- [ ] Front card fully inside viewport at every width; no mid-word clipping.
- [ ] Accent tint applied via the derivation table only.
- [ ] Steam shows 5/20/100 EUR; PUBG 60/325/660 UC; Free Fire 100/310/520 Diamants.
- [ ] Primary CTA `#2563eb` on all brands.
- [ ] Card fan hidden ≤ 720px; `aria-hidden` set.
- [ ] Sora loaded with weights 400–800; fallback `system-ui`.
- [ ] Subcopy strings match the reference verbatim.

## Files in this bundle

- `reference_Category Hero.dc.html` — approved hero reference (open in browser; brand switch via Tweaks).
- `support.js` — runtime required by the reference file (not for production).
- `assets/marques/` — final brand marks + `colors.json` (use verbatim).
