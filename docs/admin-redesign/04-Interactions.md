# ghost.ma Admin — Interaction Specification

How the admin should feel in motion. The visual design is dark, fast and lightweight; motion must reinforce "fast-feeling," never decorate. Default easing and durations below; override only where noted.

**Global motion defaults**
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (standard) for most; `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) for entrances.
- Durations: micro 120ms · standard 180ms · overlay 220ms · page 240ms.
- Respect `prefers-reduced-motion`: drop transforms, keep opacity fades only.

---

## 1. Animations
- **Toasts:** slide 8px + fade in (180ms), auto-dismiss after ~4s, fade+slide out.
- **Modals:** backdrop fade (160ms) + dialog scale 0.97→1 + fade (200ms).
- **KPI/skeletons:** shimmer sweep loop while loading.
- **Bar chart:** bars grow from baseline on first paint (240ms, staggered ~30ms).
- **Drag (featured/inventory/categories):** dragged row lifts (elevated shadow + 1.02 scale), others shift with 160ms transition.
- Keep it minimal — no parallax, no bounce, no looping ambient motion.

## 2. Transitions
- Hover color/bg/border: 120ms.
- Toggle knob slide + track color: 160ms.
- Accordion expand/collapse: height/opacity 200ms.
- Sidebar collapse (responsive): width 200ms.
- Active-nav indicator: bg + ring crossfade 140ms.

## 3. Hover effects
- **Buttons:** fill/border shift (primary slightly lighter, danger stronger tint), optional 1px lift on prominent CTAs.
- **List/table rows:** bg → `#15161d`, cursor pointer.
- **Cards (interactive):** subtle lift + border brighten.
- **Chart bars:** lighten + show value tooltip.
- **Icon buttons:** bg appears (`rgba(255,255,255,0.06)`).
- Hover never shifts layout (reserve space for borders/rings).

## 4. Page transitions
- Route change: content area crossfades (opacity 0→1, 8px upward, 240ms); sidebar/topbar persist (no remount).
- Homepage Editor opens as a **mode overlay** (fade/scale from the header button), with its own Exit.

## 5. Sticky behaviour
- Topbar: sticky top, blurred bg, always visible.
- Save bars: sticky to the bottom of the editor's scroll region.
- Order-detail header strip: sticky above the split body so primary actions stay reachable.
- Table headers: sticky within their scroll container for long tables.
- Section sub-nav (settings): sticky alongside scrolling content.

## 6. Collapse behaviour
- Inventory product groups + categories: accordion collapse with animated chevron; state remembered during the session.
- Responsive sidebar: `lg/md` may collapse to icon-rail (label tooltips on hover); `sm` off-canvas drawer with scrim.
- Right detail panels (`md`): collapse to a toggle button; expanding slides in 200ms.

## 7. Table interactions
- **Sort:** click column header → sort asc/desc, indicator arrow; 1 active sort at a time.
- **Select:** row checkbox (or row click in selection mode) → bulk toolbar appears; "select all" in header.
- **Grouping:** group header rows expand/collapse their children.
- **Inline actions:** row-level buttons (Manage, + Codes, View) reachable without opening the row.
- **Row open:** click opens the detail page/panel (orders, customers).
- **Pagination / infinite:** numbered pagination by default; long live lists (orders) may stream new rows in.

## 8. Keyboard navigation
- `⌘K` / `Ctrl+K`: command palette.
- Palette: ↑/↓ move, Enter select, Esc close.
- `Tab` order follows visual order; visible focus ring (accent) on every interactive element.
- Editors: `⌘S` saves (when dirty); Esc discards a focused inline edit.
- Modals: focus-trapped, Esc closes, Enter triggers primary.
- Toggles: Space/Enter; segmented: ←/→.
- Lists/combobox: type-ahead filter; ↑/↓/Enter to pick.

## 9. Loading skeletons
- Every data region has a skeleton: KPI numbers, chart bars, list rows, table rows, editor fields, timeline, preview.
- Skeletons match final layout dimensions (no layout shift on load).
- Buttons that trigger async work show a spinner + disabled state, not a full-page loader.

## 10. Confirmation dialogs
- Required for destructive/irreversible actions: delete product/category, reject payment, revoke API key, rotate key, publish homepage.
- Danger confirms use the danger-tone modal (red primary).
- Confirms state the consequence ("The customer will be notified by email.").

## 11. Toast behaviour
- Triggered by completed async actions (save, deliver, import, publish, copy).
- Tone matches outcome; failures persist slightly longer and may include a Retry action.
- Stack vertically, newest on top/bottom-right; max ~3 visible, older collapse.

## 12. Scrolling behaviour
- The **app shell never scrolls**; only inner regions do (content area, sidebar nav, individual panels).
- Each three-pane workspace gives each pane its own scroll.
- Custom thin scrollbars (`rgba(255,255,255,0.08)` thumb).
- No element uses `scrollIntoView` that could move the whole shell; scroll happens inside containers.

## 13. Save behaviour
- Edits set a **dirty** flag → save bar shows "Unsaved changes" (amber).
- Save → optimistic UI where safe; on success bar flips to "All changes saved" (green) + toast; on failure stays dirty + danger toast.
- Discard reverts to last-saved snapshot (confirm if many changes).
- Navigating away while dirty → "Discard changes?" guard.
- Some surfaces autosave (payment rules, toggles) and show inline "Saved" rather than a bar.

---

### Performance feel
- Instant hover/press feedback (≤120ms).
- Skeletons within ~100ms of navigation.
- No blocking spinners for actions under ~300ms — use optimistic updates + toast.
