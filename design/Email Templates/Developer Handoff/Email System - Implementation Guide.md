# ghost.ma — Transactional Email System · Implementation Guide

A single cohesive email system. **Four master templates** share one header, footer, type
scale, button set, spacing and container language. Only the **icon, title, message, CTA and
status color** change between messages.

> Design source: `Ghost Email System.dc.html` (visual reference, desktop + mobile).
> Build target: MJML or React Email. **Do not** copy the design-doc HTML verbatim — rebuild
> with the tokens below using email-safe, table-based, inline-styled markup.

---

## 1. Foundations (design tokens)

### Color

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#09090B` | Outer email background |
| `surface` | `#0C0C0F` | Email body container (600px) |
| `card` | `#131316` | Inner cards (info, order, payment, timeline) |
| `footer` | `#08080A` | Footer band |
| `border` | `rgba(255,255,255,0.07)` | Card / divider borders |
| `border-strong` | `rgba(255,255,255,0.12)` | Secondary button border |
| `text` | `#F4F4F5` | Headings, primary values |
| `text-body` | `#C9C9CE` | Paragraph body |
| `muted` | `#9A9AA3` | Labels, subtitles |
| `faint` | `#5E5E68` | Meta, mono labels, `.ma` in logo |
| `accent` | `#3E7BFA` | Primary button, links, info |
| `accent-light` | `#5E92FF` | Link text, accent on dark |

**Status colors (muted / Linear-style).** Each has: solid, text-on-dark, tint bg, tint border.

| Status | Solid | Text | Tint bg | Tint border |
|---|---|---|---|---|
| Information | `#3E7BFA` | `#5E92FF` | `rgba(62,123,250,0.10)` | `rgba(62,123,250,0.24)` |
| Success | `#3F9E78` | `#6FC2A0` | `rgba(63,158,120,0.10)` | `rgba(63,158,120,0.24)` |
| Warning | `#C99A4E` | `#DDB36B` | `rgba(201,154,78,0.10)` | `rgba(201,154,78,0.24)` |
| Error | `#C75D63` | `#E0888D` | `rgba(199,93,99,0.10)` | `rgba(199,93,99,0.24)` |

### Typography — **Geist**, fallback `-apple-system, system-ui, sans-serif`. Mono: **Geist Mono**.

| Role | Size / weight | Notes |
|---|---|---|
| Email title (`h2`) | 27 / 600 | letter-spacing −0.032em, line 1.18 |
| Logo & section | 18–19 / 600 | letter-spacing −0.03em |
| Body & subtitle | 15–15.5 / 400 | muted, line 1.64 |
| Card values | 13.5–14.5 / 500–600 | |
| Mono labels | 11 / 0.13em uppercase | Geist Mono, faint |
| Legal | 11.5 / 400 | faint |

Mobile drops title to ~22, body to ~14.

### Spacing — 4px base

`8` icon gap · `14` card padding · `18` row padding · `26` between blocks ·
`40` desktop side padding · `20` mobile side padding · `42/40` body top/bottom padding (desktop).

### Corner radius

`9` inner badge/copy chip · `12` button · `14` card · `16` code-delivery card · `20` email shell · `999` status badge.

### Shadows

- Primary CTA: `0 8px 24px rgba(62,123,250,0.28)`
- Email shell (doc only, not in clients): `0 34px 80px rgba(0,0,0,0.6)`

### Icons

Stroke style, 1.8–2.2 weight, rounded caps/joins, inside a 60px (desktop) / 56px (mobile)
rounded container tinted with the status color. SVGs in `exports/ghost-email/icons/`.

---

## 2. The four master templates

| # | Template | Emails that use it | Distinctive parts |
|---|---|---|---|
| 1 | **Information générale** | Bienvenue · Vérification d'email · Réinitialisation du mot de passe · Instructions de paiement | Hero icon, title, message, info box (request details), primary CTA + copy-link, info banner |
| 2 | **Suivi de commande** | Commande reçue · Preuve de paiement reçue · Paiement confirmé · Mise à jour de remboursement | Status badge, **timeline**, order summary, payment card, primary CTA |
| 3 | **Action requise** | Paiement rejeté · Nouvelle preuve de paiement demandée | **Large warning banner**, reason card, numbered "what to do" steps, mini order, primary + secondary (support) CTA, deadline warning |
| 4 | **Livraison** (premium) | Commande livrée | **Success banner**, product card, **code reveal** (dashed, copy chip), redeem steps, primary CTA, support card |

All four are the same shell:

```
┌─ HEADER ───────── logo · context label ─┐
│  [optional banner: warning / success]    │
│  BODY: icon? · badge? · title · subtitle │
│        · template-specific blocks         │
│        · primary CTA (· secondary)        │
│        · closing banner                   │
├─ FOOTER ─ logo · tagline · social ───────┤
│  support line · legal line                │
└──────────────────────────────────────────┘
```

---

## 3. Component hierarchy

```
EmailShell (600px, surface #0C0C0F on canvas #09090B)
├── Header
│   ├── Logo            "ghost" #F4F4F5 + ".ma" #5E5E68, no icon
│   └── ContextLabel    mono, faint — or #{{order_number}}
├── Banner (optional)   Warning (T3) | Success (T4)
├── Body (40px / 20px mobile)
│   ├── HeroIcon        60px tinted container + status-colored stroke icon
│   ├── StatusBadge     pill: dot + {{status_badge}}
│   ├── EmailTitle      {{email_title}}
│   ├── Subtitle        {{email_subtitle}}
│   ├── Message         {{message}}
│   ├── InfoBox         titled key/value card (#131316)
│   ├── OrderSummary    product row + subtotal/shipping/total
│   ├── ProductList     icon + name + qty + price rows
│   ├── PaymentCard     method / reference key-values
│   ├── Timeline        done / current / pending steps
│   ├── CodeDeliveryCard  product + dashed code + copy chip
│   ├── AlertBox        info | success | warning | error variants
│   ├── PrimaryButton   #3E7BFA, 50px, radius 12
│   ├── SecondaryButton outline, border-strong
│   └── SupportCard     icon + text + "Aide →"
└── Footer
    ├── Logo (small)
    ├── Tagline
    ├── SocialLinks     X · Instagram · WhatsApp (34px circles)
    ├── SupportLine     {{support_email}} · {{support_whatsapp}}
    └── LegalFooter     © {{current_year}} · Conditions · Confidentialité · Se désabonner
```

**Reusable across every email:** Header, Logo, Footer, SocialLinks, SupportLine, LegalFooter,
typography, buttons, spacing, containers, AlertBox shapes, StatusBadge shape.

**Changes per email only:** hero icon glyph, status color (badge/banner/icon tint), and the
`{{placeholders}}`.

---

## 4. Dynamic variables

| Variable | Appears in | Example |
|---|---|---|
| `{{customer_name}}` | greeting / message | "Yassine" |
| `{{email_title}}` | all | "Votre commande est livrée" |
| `{{email_subtitle}}` | all | short supporting line |
| `{{message}}` | T1 | body paragraph |
| `{{status_badge}}` | T2, T3, T4 | "Livré", "Rejeté" |
| `{{order_number}}` | T2–T4 header | "GHM-10428" |
| `{{order_items}}` | T2, T4, components | product name |
| `{{variant_name}}` `{{quantity}}` | order rows | "100 MAD · Qté 1" |
| `{{subtotal}}` `{{total}}` | summaries | "100 MAD" |
| `{{payment_method}}` | T2, payment card | "Virement bancaire" |
| `{{payment_reference}}` | payment card | mono ref |
| `{{payment_instructions}}` | T1 (payment variant) | RIB / steps |
| `{{reason}}` | T3 | rejection reason |
| `{{step_1}}…{{step_3}}` | T3 / redeem | numbered instructions |
| `{{redeem_step_1..3}}` | T4 | how to use code |
| `{{delivery_code}}` | T4 | the code (mono) |
| `{{delivery_date}}` | T4 | timestamp |
| `{{device}}` `{{location}}` `{{ip_address}}` | T1 security | request details |
| `{{expiry_date}}` `{{deadline}}` | T1 / T3 | link expiry / response deadline |
| `{{button_label}}` `{{button_url}}` | all | CTA |
| `{{payment_url}}` `{{order_url}}` `{{delivery_url}}` | per template | CTA targets |
| `{{support_email}}` `{{support_whatsapp}}` | footer / support | contact |
| `{{current_year}}` | legal footer | "2026" |

---

## 5. Responsive behavior

Mobile is **purpose-built**, not a shrink.

| Aspect | Desktop (≥600) | Mobile (≤599) |
|---|---|---|
| Shell width | 600px, radius 20 | fluid 100%, radius 22 |
| Side padding | 40px | 20px |
| Header | logo left + context label right | logo centered (or logo + order # for T2) |
| Cards | bordered `#131316` boxes | **full-bleed rows** with top/bottom hairlines, no side border |
| Timeline (T2) | vertical, dated steps | **horizontal** 4-dot progress strip |
| Title align | left | centered |
| Buttons | 50px | 54px, full width (larger tap target) |
| Footer | full (tagline + social + legal) | condensed (support + © only) |
| Banners (T3/T4) | inline row | centered stacked block |

In MJML use `<mj-column>` stacking + `mj-media-query` / `mso`-safe table fallbacks; force tap
targets ≥ 44px; keep the code-reveal chip and copy button thumb-reachable.

---

## 6. Build notes

- One 600px `<mj-section>` / table wrapper, `#0C0C0F` on `#09090B`.
- Inline every style; provide `bgcolor` + nested table fallbacks for Outlook.
- Geist via web font `<link>` with `system-ui` fallback — never rely on the web font alone.
- Status is a **single variable** that drives icon glyph + badge/banner/icon color together;
  centralize it so one value flips the whole email's accent.
- Code/reference/IP/timestamps always in **Geist Mono**.
- Test in Gmail (web + app), Apple Mail, Outlook.

Assets: `exports/ghost-email/logo/` (wordmark SVG) · `exports/ghost-email/icons/` (icon SVGs) ·
`exports/ghost-email/png/` (rendered template previews).
