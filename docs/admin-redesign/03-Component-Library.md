# ghost.ma Admin — Component Library

Every reusable component, with: **Purpose · Props · States · Sizing · Behaviour**. All tokens referenced here are defined in `05-Design-Tokens.md`. Props are written as a guide for the implementation framework (React-style), not as existing code.

---

## 1. Sidebar
- **Purpose:** persistent primary navigation across the whole admin.
- **Props:** `active` (nav key), `counts` (map: navKey → number), `user` ({name, role, initials}).
- **States:** item active / inactive / hover; group label; item with count badge; (responsive) expanded / icon-rail / off-canvas.
- **Sizing:** 248px wide; item 36px tall, radius 9px; icon 16px; header & footer 60px / auto.
- **Behaviour:** fixed full height; nav region scrolls independently; active item gets accent-soft bg + ring + light text; counts are right-aligned chips (accent for neutral, amber/red for attention).

## 2. Top navigation (Topbar)
- **Purpose:** global search, primary mode actions, environment + status.
- **Props:** `onSearch`, `env` (LIVE/TEST), `onViewStore`, `onHomepageEditor`.
- **States:** default; search focused; env LIVE (green) / TEST (amber); button hover/active.
- **Sizing:** 60px tall; search 420px max × 38px.
- **Behaviour:** sticky; blurred translucent bg; `⌘K` opens command palette; Homepage Editor is accent-tinted to stand out.

## 3. Page header
- **Purpose:** in-content title block + page-level actions.
- **Props:** `title`, `subtitle`, `actions[]`, optional `rangeControl`.
- **States:** with/without actions; with/without range selector.
- **Sizing:** title 20–22px; sits in content padding (24–28px); 18–22px bottom gap.
- **Behaviour:** actions right-aligned via `margin-left:auto`; may include segmented control + secondary buttons.

## 4. Toolbar
- **Purpose:** contextual actions above a list/table (new, import, bulk).
- **Props:** `actions[]`, `selectionCount`.
- **States:** default; bulk-selection mode (shows count + bulk actions).
- **Sizing:** 28–38px controls.
- **Behaviour:** when rows selected, swaps to a bulk-action bar.

## 5. Search / Command palette
- **Purpose:** find or jump to orders, products, customers; run commands.
- **Props:** `placeholder`, `scopes[]`, `onSelect`, `shortcut`.
- **States:** idle; focused; open (results); empty results; loading.
- **Sizing:** trigger 38px; palette overlay centered, ~560px.
- **Behaviour:** `⌘K`; arrow keys navigate, Enter selects, Esc closes; grouped results by type.

## 6. Filter chips
- **Purpose:** active filters + add-filter affordances.
- **Props:** `filters[]` ({label, value, removable}), `available[]`.
- **States:** active (accent), addable (neutral, "+"), removable (× shown).
- **Sizing:** 6px chip radius, ~6×11px padding, 12px text.
- **Behaviour:** click × removes; "+" opens a value picker; in a wrapping flex row with gap.

## 7. Product card / preview
- **Purpose:** compact product representation (list rows, homepage preview tiles).
- **Props:** `thumb`, `name`, `meta`, `price`, `badges[]`, `selected`.
- **States:** default / selected (accent ring) / hover; status badges (Active, Featured).
- **Sizing:** list row ~30px thumb; preview tile 70px image header + 9–10px padding.
- **Behaviour:** click selects/opens; preview tiles mirror Featured ordering.

## 8. Variant row
- **Purpose:** one product variant with stock + price.
- **Props:** `label`, `sku`, `price`, `stock` ({count, level}), `mode`.
- **States:** in-stock (green) / low (amber) / out (red border + CTA); selected; editing.
- **Sizing:** card 11–13px padding, radius 11px; stock chip 6px radius mono.
- **Behaviour:** out-of-stock surfaces a "+ Codes" CTA; lives in the variant rail or inventory table.

## 9. Order timeline
- **Purpose:** chronological order events.
- **Props:** `events[]` ({label, time, type}).
- **States:** event type colors (placed=accent, review=amber, delivered=accent/green); current vs past.
- **Sizing:** 8–9px node dots, 1.5px connector line, 11–12.5px text.
- **Behaviour:** vertical rail; newest at top; connector omitted on the last node.

## 10. Upload component (dropzone)
- **Purpose:** drag-and-drop file/image/code intake.
- **Props:** `accept`, `multiple`, `label`, `onDrop`.
- **States:** idle (dashed) / drag-over (accent border) / uploading (progress) / error (red helper) / filled (thumb).
- **Sizing:** ≥84px tall; dashed border 1.5px; diagonal-stripe bg.
- **Behaviour:** click or drop; shows mono filename when filled; replace affordance.

## 11. Sticky save bar
- **Purpose:** persistent save/discard for editors.
- **Props:** `dirty` (bool), `onSave`, `onDiscard`, `saveLabel`.
- **States:** unsaved (amber dot) / saved (green check) / saving (spinner, disabled).
- **Sizing:** 60px tall; primary button 38px.
- **Behaviour:** pinned to bottom of the editor's scroll region (not viewport); Save disabled when not dirty.

## 12. Toggle
- **Purpose:** boolean on/off; segmented variant for 2–3 options.
- **Props:** `checked`/`value`, `onChange`, `options[]` (segmented).
- **States:** on / off / focus / disabled.
- **Sizing:** 40×23px track, 18px knob; segmented pill 6–8px radius.
- **Behaviour:** instant flip; marks parent form dirty; keyboard toggle (Space/Enter, ←/→ for segments).

## 13. Badge
- **Purpose:** non-interactive status / metadata label.
- **Props:** `tone` (success/warning/danger/accent/neutral), `text`, optional `dot`.
- **States:** tone variants.
- **Sizing:** 11–11.5px text, 6px radius, ~2–3×8px padding.
- **Behaviour:** purely presentational; soft bg + matching border + tone text.

## 14. Modal
- **Purpose:** focused confirm/edit dialog.
- **Props:** `title`, `body`, `actions[]`, `tone` (default/danger), `onClose`.
- **States:** open / closing; danger confirm.
- **Sizing:** card radius 12px, ~420px wide; backdrop dim+blur.
- **Behaviour:** focus-trapped; Esc + backdrop close; primary action reflects tone; returns focus to trigger.

## 15. Toast
- **Purpose:** transient action feedback.
- **Props:** `tone`, `title`, `description`, `duration`, `action?`.
- **States:** success / warning / danger / info; entering / leaving.
- **Sizing:** ~320px, radius 11px, toast shadow.
- **Behaviour:** stacks bottom/top-right; auto-dismiss (~4s) + manual close; slide+fade in/out.

## 16. Status chip / count pill
- **Purpose:** inline counts (nav badges, stock counts, waiting timers).
- **Props:** `value`, `tone`.
- **States:** accent (neutral count), amber (attention), red (critical), green (ok).
- **Sizing:** 11px mono, 6px radius.
- **Behaviour:** sits right-aligned in rows/nav.

## 17. Accordion
- **Purpose:** expandable groups (inventory product groups, settings sub-sections).
- **Props:** `title`, `meta`, `defaultOpen`, `children`.
- **States:** collapsed / expanded; chevron rotation.
- **Sizing:** header row ~14px padding; children indented ~64px (inventory).
- **Behaviour:** click header toggles; chevron animates; preserves state per group.

## 18. Tabs
- **Purpose:** switch sub-views (settings sub-nav, preview device toggle).
- **Props:** `tabs[]`, `active`, `onChange`, `orientation` (vertical for settings).
- **States:** active (accent-soft + ring) / inactive / hover.
- **Sizing:** vertical item 8×11px padding, 8px radius; horizontal segmented for compact toggles.
- **Behaviour:** keyboard arrow navigation; active persists.

## 19. Pagination
- **Purpose:** page through long tables (orders, customers).
- **Props:** `page`, `pageCount`, `onChange`, `pageSize?`.
- **States:** first/last disabled; current page highlighted; loading.
- **Sizing:** 30px controls, mono page numbers.
- **Behaviour:** prev/next + numbered; disabled at bounds; optional page-size select.

## 20. Table
- **Purpose:** row-based data display (orders, inventory, customers, dev tools) — never a dense DB grid.
- **Props:** `columns[]`, `rows[]`, `groupBy?`, `rowActions[]`, `selectable?`, `sort`.
- **States:** default / hover (row tint) / selected / grouped / loading (skeleton) / empty / error.
- **Sizing:** row padding 11–14px; hairline separators; mono numeric cells.
- **Behaviour:** optional grouping with header rows + indented children; inline progress bars, chips, and row-action buttons; sortable columns; selection enables the bulk toolbar.

---

### Composition rules
- Editors = scrolling body (`flex:1; overflow-y:auto`) + **Sticky save bar** (`flex-shrink:0`).
- Workspaces = fixed side columns + flexible center (`288/300/248px · 1fr · 320/360/340px`).
- Detail pages = `1fr · 372px` split, header strip owns primary actions.
- All spacing via flex/grid `gap`; never margin-based inline flow.
