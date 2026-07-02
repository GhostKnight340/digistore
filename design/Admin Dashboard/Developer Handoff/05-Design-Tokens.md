# ghost.ma Admin — Design Tokens

Exported from `Ghost Admin.dc.html`. Values are literal — copy them verbatim. A machine-readable `tokens.json` accompanies this file.

---

## Colors

### Backgrounds / surfaces
| Token | Value | Use |
|---|---|---|
| `--bg-canvas` | `#070809` | Outermost canvas behind the app frame |
| `--bg-app` | `#0A0B0D` | Storefront-adjacent app bg / email preview pane |
| `--bg-sidebar` | `#0C0D11` | Sidebar, summary/total rows |
| `--surface` | `#0F1015` | Cards, panels |
| `--surface-input` | `#121319` | Inputs, secondary buttons, list rows |
| `--surface-elevated` | `#15161d` | Modals, toasts, dragged rows |
| `--surface-elevated-2` | `#1B1D27` | Highest elevation |

### Text
| Token | Value |
|---|---|
| `--text` | `#F3F4F7` |
| `--text-muted` | `#9A9FAB` |
| `--text-faint` | `#646A77` |
| `--text-fainter` | `#4d525d` |
| `--text-body-on-light` | `#1a1d24` (email preview only) |

### Accent (blue)
| Token | Value |
|---|---|
| `--accent` | `#3E7BFA` |
| `--accent-strong` | `#5E92FF` |
| `--accent-soft` | `rgba(62,123,250,0.13)` |
| `--accent-border` | `rgba(62,123,250,0.30)` |
| `--accent-ring` | `rgba(62,123,250,0.20)` |
| `--accent-text` | `#9FB8FF` |
| `--accent-text-strong` | `#EAF0FF` |
| `--accent-grad` | `linear-gradient(145deg,#3E7BFA,#2B5FD9)` |

### Semantic
| Token | Value | Use |
|---|---|---|
| `--success` | `#2EA067` | Confirm, in-stock |
| `--success-text` | `#5BC98C` | Success label text |
| `--success-soft` | `rgba(46,160,103,0.14)` | Badge bg |
| `--success-border` | `rgba(46,160,103,0.28)` | Badge border |
| `--warning` | `#E8A838` | Review, low stock |
| `--warning-soft` | `rgba(232,168,56,0.14)` | Badge bg |
| `--warning-border` | `rgba(232,168,56,0.28)` | Badge border |
| `--danger` | `#E05C5C` | Reject, out of stock |
| `--danger-soft` | `rgba(224,92,92,0.08–0.14)` | Card / badge bg |
| `--danger-border` | `rgba(224,92,92,0.25–0.30)` | Card / badge border |

### Borders
| Token | Value |
|---|---|
| `--border-hairline` | `rgba(255,255,255,0.06)` |
| `--border` | `rgba(255,255,255,0.07)` |
| `--border-input` | `rgba(255,255,255,0.10)` |
| `--border-strong` | `rgba(255,255,255,0.13)` |
| `--border-faint` | `rgba(255,255,255,0.04)` |

### Accent swatch palette (Settings → Branding)
`#3E7BFA` (default) · `#7C5CFF` · `#2EA067` · `#E8A838`

---

## Typography
| Token | Value |
|---|---|
| `--font-ui` | `'Geist', -apple-system, system-ui, sans-serif` |
| `--font-mono` | `'Geist Mono', monospace` |
| weights | 400 / 500 / 600 / 700 |

| Role | Size | Weight | Letter-spacing |
|---|---|---|---|
| Display | 56px | 600 | −0.035em |
| H2 (section) | 30px | 600 | −0.02em |
| Page title | 20–22px | 600 | −0.01–0.02em |
| Card title | 13.5–15px | 600 | — |
| Body | 13–13.5px | 400 | — |
| Meta | 11.5–12.5px | 400 | — |
| Eyebrow | 11px | 600 | 0.08em, uppercase |
| KPI number | 27px | 600 (mono) | −0.02em |
| Line height | 1.5 body | | |

---

## Spacing (4px base)
`4 · 6 · 8 · 9 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 26 · 28`

| Token | Value | Use |
|---|---|---|
| `--pad-content` | 24–28px | Content area |
| `--pad-card` | 16–22px | Card interior |
| `--pad-row-y` | 9–14px | Table/list rows |
| `--gap-card` | 14px | Cards in a row |
| `--gap-group` | 16–18px | Stacked groups |
| `--gap-icon` | 7–11px | Icon ↔ label |

---

## Border radius
| Token | Value |
|---|---|
| `--r-frame` | 16px |
| `--r-card` | 14px |
| `--r-control` | 9px |
| `--r-small` | 8px |
| `--r-chip` | 6px |
| `--r-pill` | 999px |

---

## Icon sizes
| Token | Value | Use |
|---|---|---|
| `--icon-nav` | 16px | Sidebar |
| `--icon-inline` | 14px | Buttons, meta |
| `--icon-feature` | 18–22px | Empty/error/feature |
| stroke | 1.6–2px | line icons, `currentColor` |

---

## Shadow levels
| Token | Value |
|---|---|
| `--shadow-frame` | `0 40px 120px rgba(0,0,0,0.6)` |
| `--shadow-primary` | `0 6px 18px rgba(62,123,250,0.32)` |
| `--shadow-success` | `0 6px 18px rgba(46,160,103,0.30)` |
| `--shadow-toast` | `0 10px 26px rgba(0,0,0,0.4)` |
| `--shadow-modal` | `0 16px 36px rgba(0,0,0,0.5)` |

---

## Component spacing / sizing
| Token | Value |
|---|---|
| `--shell-w` / `--shell-h` | 1440 / 920 (mockup) |
| `--sidebar-w` | 248px |
| `--settings-subnav-w` | 210px |
| `--topbar-h` | 60px |
| `--savebar-h` | 60px |
| `--navitem-h` | 36px |
| `--btn-h` | 36–38px |
| `--btn-h-sm` | 28–30px |
| `--input-h` | 38–40px |
| `--toggle` | 40 × 23px |
| `--search-w` | 420px max |

---

## Grid / container widths
| Token | Value |
|---|---|
| KPI row | `repeat(4,1fr)` gap 14 |
| Overview body | `1.55fr 1fr` gap 14 |
| Order detail | `1fr 372px` |
| Products workspace | `288px · 1fr · 320px` |
| Featured workspace | `300px · 1fr · 360px` |
| Email workspace | `248px · 1fr · 340px` |
| Settings | `210px · 1fr` |
| Notes/cover max | 980–1100px |

---

## Breakpoints
| Token | Min width | Behaviour |
|---|---|---|
| `--bp-xl` | 1440 | Full layout |
| `--bp-lg` | 1200 | Narrow right panels |
| `--bp-md` | 900 | Collapse right panels, 2-pane editors |
| `--bp-sm` | <900 | Off-canvas sidebar, stacked editors |
