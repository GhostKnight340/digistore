// Recently-viewed local history: dedup, newest-first ordering, cap, clear.
// Pure logic — we polyfill a minimal localStorage/window. Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { recordView, getRecentSlugs, clearRecent } from "../../src/lib/recentlyViewed";

// Minimal in-memory localStorage/window. The module only touches `window` at
// call time (guarded by `typeof window`), so setting it here — after the static
// import but before any test runs — is sufficient.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  clear() {
    this.store.clear();
  }
}
const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };

beforeEach(() => storage.clear());

test("records a product once (test 17)", () => {
  recordView("steam-100", 12, 1000);
  recordView("steam-100", 12, 2000); // same parent → still one entry
  assert.deepEqual(getRecentSlugs(), ["steam-100"]);
});

test("re-viewing moves a product to newest (test 18)", () => {
  recordView("a", 12, 1000);
  recordView("b", 12, 2000);
  recordView("c", 12, 3000);
  assert.deepEqual(getRecentSlugs(), ["c", "b", "a"]);
  recordView("a", 12, 4000); // re-view a → jumps to front
  assert.deepEqual(getRecentSlugs(), ["a", "c", "b"]);
});

test("variants collapse to their parent slug (test 19)", () => {
  // Callers always pass the PARENT slug, so two different denominations of the
  // same product record a single entry.
  recordView("steam-wallet", 12, 1000);
  recordView("steam-wallet", 12, 2000);
  assert.deepEqual(getRecentSlugs(), ["steam-wallet"]);
});

test("history is capped at the configured maximum", () => {
  for (let i = 0; i < 20; i++) recordView(`p${i}`, 12, 1000 + i);
  const slugs = getRecentSlugs();
  assert.equal(slugs.length, 12);
  assert.equal(slugs[0], "p19"); // newest first
});

test("clear empties the history (test 22)", () => {
  recordView("a", 12, 1000);
  clearRecent();
  assert.deepEqual(getRecentSlugs(), []);
});
