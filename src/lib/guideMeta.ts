/**
 * Derived, read-only facts about a guide document — computed from the existing
 * typed content blocks (see src/lib/guide.ts). No new data is stored: these are
 * pure functions over `GuideBlock[]`, so the server page and any client widget
 * (TOC, meta strip) share one source of truth. Client-safe (no `server-only`).
 *
 * We deliberately only surface facts we can HONESTLY derive — step count and a
 * transparent reading-time estimate. We do not infer "difficulty", regions, or
 * view counts: that data doesn't exist and must never be fabricated.
 */

import type { GuideBlock } from "./guide";

/** Words per minute for the reading-time estimate (typical prose average). */
const WORDS_PER_MINUTE = 200;
/** Extra minutes added per activation step (following instructions ≠ reading). */
const MINUTES_PER_STEP = 0.25;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  // Strip tags from the limited HTML stored in paragraph/warning blocks so we
  // count words, not markup.
  return trimmed
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Total number of individual activation steps across all `steps` blocks. */
export function countSteps(blocks: GuideBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    if (block.type === "steps") total += block.items.length;
  }
  return total;
}

/**
 * Rough, transparent time estimate in whole minutes — always rendered with a "≈"
 * prefix so it reads as an estimate, never a measured value. Counts words in the
 * text-bearing blocks plus a small per-step cost for following instructions.
 */
export function estimateReadingMinutes(blocks: GuideBlock[]): number {
  let words = 0;
  let steps = 0;
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "warning":
        words += countWords(block.text);
        break;
      case "steps":
        steps += block.items.length;
        words += block.items.reduce((sum, item) => sum + countWords(item), 0);
        break;
      case "list":
        words += block.items.reduce((sum, item) => sum + countWords(item), 0);
        break;
      default:
        break;
    }
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE + steps * MINUTES_PER_STEP));
}

export interface TocItem {
  id: string;
  text: string;
}

/**
 * Table-of-contents entries from the guide's `heading` blocks. Each heading
 * block already carries a stable `id` (guaranteed non-empty by
 * `normalizeGuideBlocks`), which GuideContent emits as the anchor target.
 */
export function buildToc(blocks: GuideBlock[]): TocItem[] {
  const out: TocItem[] = [];
  for (const block of blocks) {
    if (block.type === "heading") out.push({ id: block.id, text: block.text });
  }
  return out;
}
