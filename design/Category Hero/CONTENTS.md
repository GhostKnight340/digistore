# GhostMA — Category Hero

The category-page hero was authored as **one design file** parameterized per brand. Open the
file in a browser — the Tweaks `brand` prop switches between all nine categories. It replaces the
current boxed panel + lone brand logo with a full-bleed dark hero: brand-tinted halo, a fan of
three of our own card designs bleeding off the right edge, and badge + headline + subcopy + two
CTAs on the left. Nothing here is newly generated.

## Files
- **reference_Category Hero.dc.html** — the full hero (all brands via the `brand` Tweaks prop, plus the in-file spec logic and `BRANDS` map that owns the verbatim copy strings).
- **support.js** — prototype runtime (keep alongside the .dc.html). Not for production.
- **assets/marques/** — final brand marks (colored + `white/` mono) and `colors.json` canonical accents. Use verbatim — never redraw or recolor. These mirror `public/marques/` in the app.
- **README.md** — the machine-readable engineering handoff: layout spec, brand matrix, accent-derivation table, responsive/a11y rules, don'ts, and QA checklist. Where README and the reference file differ, **the reference file wins**.

## Brand / category index
| brand key | Category | Accent | Denominations (front → back) | Unit |
|---|---|---|---|---|
| `steam` | Steam Wallet | `#66C0F4` | 5 · 20 · 100 | EUR |
| `playstation` | PlayStation Store | `#4a9eff` | 10 · 25 · 50 | EUR |
| `xbox` | Xbox | `#3fae3f` | 5 · 25 · 100 | EUR |
| `google-play` | Google Play | `#00F076` | 5 · 25 · 100 | EUR |
| `itunes` | iTunes | `#FB5BC5` | 5 · 25 · 100 | EUR |
| `apple` | Apple Gift Card | `#c9d1d9` | 5 · 25 · 100 | EUR |
| `netflix` | Netflix | `#E50914` | 15 · 25 · 50 | EUR |
| `pubg` | PUBG Mobile | `#F2A900` | 60 · 325 · 660 | UC |
| `free-fire` | Free Fire | `#FFB300` | 100 · 310 · 520 | Diamants |

## Responsive
One component, three widths: full fan at 1440px reference (hero min-height 720px), fan scaled ~0.8
at ≤ 1024px, fan hidden entirely at ≤ 720px (halo stays). See README "Responsive".
