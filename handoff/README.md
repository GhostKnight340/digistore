# ghost.ma Admin — Implementation Handoff Package

Complete documentation for implementing the ghost.ma back-office admin redesign. The visual source of truth is **`Ghost Admin.dc.html`** (dark, full-screen operations dashboard). These docs describe that design exactly — they do not propose changes.

> Note on the audit: `07` compares the design against the **current admin as described in the brief** (the codebase wasn't available when it was written). It has since been **validated against the real code in `07a-Audit-Validation.md`**, which reclassifies every feature as 🟢 already implemented / 🟡 UI redesign / 🟠 backend extension / 🔴 new feature. **Plan from `07a` — where it and `07` differ, `07a` wins.**

## Contents

| # | File | What it covers |
|---|---|---|
| 1 | `01-Design-Specification.md` | Layout, grid, breakpoints, sidebar/header/save bars, cards, tables, forms, modals, drawers, icons, buttons, toggles, type, colors, radius, shadows, spacing, sizing |
| 2 | `02-Screens.md` | Screen-by-screen: purpose, layout, components, actions, states, interactions, responsive, loading/empty/error/success, hover/focus/disabled (14 screens) |
| 3 | `03-Component-Library.md` | Every reusable component: purpose, props, states, sizing, behaviour |
| 4 | `04-Interactions.md` | Animations, transitions, hover, sticky, collapse, tables, keyboard, skeletons, modals, toasts, scrolling, save |
| 5 | `05-Design-Tokens.md` | Full token reference (human-readable) |
| — | `tokens.json` | Machine-readable design tokens |
| 6 | `06-Claude-Code-Implementation-Notes.md` | Build guide: IA, reuse, identical layouts, sticky, sequence (build first/later) |
| 7 | `07-Missing-Functionality-Audit.md` | Every design feature vs current admin: priority, FE/BE/DB/API, complexity, confidence _(superseded by 07a)_ |
| 7a | `07a-Audit-Validation.md` | **Audit re-validated against the real code** — every feature reclassified 🟢/🟡/🟠/🔴 with files/actions/models, what's missing, approach, priority. Source of truth for scope. |
| 8 | `08-Final-Checklist.md` | Build-order checklist by work type (already-done / UI-only / FE / BE / DB / future) |

## How to use
1. Read `06` first — it orients the whole build and gives the sequence.
2. Theme from `tokens.json` + `05`; build the primitives in `03`.
3. Implement screens per `02`, following motion rules in `04`.
4. Track scope with `07` (roadmap) and `08` (checklist).

## Design system at a glance
- **Fonts:** Geist (UI) + Geist Mono (numbers, SKUs, codes, IDs).
- **Accent:** `#3E7BFA` blue. **Semantics:** green success, amber review/low, red reject/out.
- **Surfaces:** near-black backgrounds, hairline white borders, 14px card radius.
- **Principles:** full-screen shell, never scroll to save, full pages over drawers, product-oriented inventory, minimal line icons, fast-feeling motion.

_Visual reference: open `Ghost Admin.dc.html` — it contains the navigation map, all 8 designed screens, the component library, and layout notes, each with a badge id (S1–S8, LIB)._
