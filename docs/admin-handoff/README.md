# ghost.ma Admin — Implementation Handoff Package

Complete documentation for implementing the ghost.ma back-office admin redesign. The visual source of truth is **`Ghost Admin.dc.html`** (dark, full-screen operations dashboard); the data source of truth is **`prisma/schema.prisma`**. These docs describe that design exactly — they do not propose changes.

**Target stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind + shadcn/ui · Prisma → PostgreSQL (Neon) · React Hook Form + Zod · Lucide React. Dark theme only, desktop-first. Details in `10 §0`.

> Note on the audit: `07`/`08` were written before the schema was available. **`10-Data-Model-Mapping.md §4` reconciles them against the real `schema.prisma`** — most "DB work" rows already exist; only Refunds, category nesting, homepage blocks, and (optionally) an email-template model remain. Prefer `10` over `07`/`08` where they disagree.

## Contents

| # | File | What it covers |
|---|---|---|
| 1 | `01-Design-Specification.md` | Layout, grid, breakpoints, sidebar/header/save bars, cards, tables, forms, modals, drawers, icons, buttons, toggles, type, colors, radius, shadows, spacing, sizing |
| 2 | `02-Screens.md` | Screen-by-screen: purpose, layout, components, actions, states, interactions, responsive, loading/empty/error/success, hover/focus/disabled (all screens; Orders, Payment review, Customers, Developer Tools now drawn) |
| 3 | `03-Component-Library.md` | Every reusable component: purpose, props, states, sizing, behaviour |
| 4 | `04-Interactions.md` | Animations, transitions, hover, sticky, collapse, tables, keyboard, skeletons, modals, toasts, scrolling, save |
| 5 | `05-Design-Tokens.md` | Full token reference (human-readable) |
| — | `tokens.json` | Machine-readable design tokens |
| 6 | `06-Claude-Code-Implementation-Notes.md` | Build guide: IA, reuse, identical layouts, sticky, sequence (build first/later) |
| 7 | `07-Missing-Functionality-Audit.md` | Every design feature vs current admin: priority, FE/BE/DB/API, complexity, confidence _(pre-schema — see `10 §4`)_ |
| 8 | `08-Final-Checklist.md` | Build-order checklist by work type (already-done / UI-only / FE / BE / DB / future) _(pre-schema — see `10 §4`)_ |
| 9 | `09-Interaction-Flows.md` | 13 step-by-step user flows: trigger → steps → DB writes → emails → success/error/edge, all keyed to Prisma models |
| 10 | `10-Data-Model-Mapping.md` | Screen↔Prisma map, status vocabularies, deeper per-screen dev specs, schema reconciliation, Next.js/shadcn architecture, Tailwind theme, responsive rules, Lucide icons |

## How to use
1. Read `06` first — it orients the whole build and gives the sequence.
2. Read `10` — it binds the UI to the Prisma schema, fixes the stack, and gives per-screen dev specs + the Tailwind theme.
3. Theme from `tokens.json` + `05`; build the primitives in `03`.
4. Implement screens per `02`, following the flows in `09` and motion rules in `04`.
5. Track scope with `10 §4` (schema-accurate), then `07`/`08` for the wider roadmap.

## Design system at a glance
- **Fonts:** Geist (UI) + Geist Mono (numbers, SKUs, codes, IDs).
- **Accent:** `#3E7BFA` blue. **Semantics:** green success, amber review/low, red reject/out.
- **Surfaces:** near-black backgrounds, hairline white borders, 14px card radius.
- **Principles:** full-screen shell, never scroll to save, full pages over drawers, product-oriented inventory, minimal line icons, fast-feeling motion.

_Visual reference: open `Ghost Admin.dc.html` — it contains the navigation map, all 14 designed screens (`#s1`–`#s14`), the screen-states gallery (`#states`), the component library (`LIB`), and layout notes, each with a badge id._
