// Daily Reports — period-over-period comparison (spec: "what changed" vs a
// recent baseline). Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { baselineWindow, computeComparison, type ComparableFigures } from "../../src/lib/ai-ops/reports/comparison";

const NOW = new Date("2026-07-22T10:00:00Z"); // Casablanca (UTC+1 in July) → 2026-07-22

test("morning compares against the day before yesterday (a full day)", () => {
  const b = baselineWindow("morning", NOW, "Africa/Casablanca");
  assert.deepEqual(b.range, { start: "2026-07-20", end: "2026-07-20" });
  assert.equal(b.currentIsPartial, false);
});

test("evening compares against all of yesterday and flags the partial day", () => {
  const b = baselineWindow("evening", NOW, "Africa/Casablanca");
  assert.deepEqual(b.range, { start: "2026-07-21", end: "2026-07-21" });
  assert.equal(b.currentIsPartial, true);
});

test("weekly compares against the previous 7-day block", () => {
  const b = baselineWindow("weekly", NOW, "Africa/Casablanca");
  assert.deepEqual(b.range, { start: "2026-07-08", end: "2026-07-14" });
});

test("monthly compares against the month before last, clamped to real days", () => {
  const b = baselineWindow("monthly", NOW, "Africa/Casablanca");
  assert.deepEqual(b.range, { start: "2026-05-01", end: "2026-05-31" });
});

function fig(overrides: Partial<ComparableFigures> = {}): ComparableFigures {
  return {
    revenueMad: 0,
    ordersTotal: 0,
    ordersDelivered: 0,
    paymentMethods: [],
    topProducts: [],
    fulfillmentFailed: 0,
    ...overrides,
  };
}

test("scalar deltas carry a pre-formatted percentage and direction", () => {
  const c = computeComparison(
    fig({ revenueMad: 1800, ordersTotal: 8 }),
    fig({ revenueMad: 2000, ordersTotal: 8 }),
    { baselineLabel: "the day before", currentIsPartial: false, available: true },
  );
  assert.equal(c.revenue.deltaAbs, -200);
  assert.equal(c.revenue.deltaPct, "-10%");
  assert.equal(c.revenue.direction, "down");
  assert.equal(c.ordersTotal.direction, "flat");
});

test("a zero baseline yields no percentage (never invents one)", () => {
  const c = computeComparison(fig({ revenueMad: 500 }), fig({ revenueMad: 0 }), {
    baselineLabel: "b",
    currentIsPartial: false,
    available: true,
  });
  assert.equal(c.revenue.deltaPct, null);
  assert.equal(c.revenue.direction, "up");
});

test("product movement detects new / gone / up / down and skips flat", () => {
  const c = computeComparison(
    fig({ topProducts: [{ name: "PS", unitsSold: 6 }, { name: "Steam", unitsSold: 4 }, { name: "Flat", unitsSold: 2 }] }),
    fig({ topProducts: [{ name: "Steam", unitsSold: 8 }, { name: "Xbox", unitsSold: 3 }, { name: "Flat", unitsSold: 2 }] }),
    { baselineLabel: "b", currentIsPartial: false, available: true },
  );
  const byName = Object.fromEntries(c.productMovements.map((m) => [m.name, m.status]));
  assert.equal(byName.PS, "new");
  assert.equal(byName.Steam, "down");
  assert.equal(byName.Xbox, "gone");
  assert.ok(!("Flat" in byName), "unchanged products are omitted");
});

test("a missing baseline degrades to unknown deltas without throwing", () => {
  const c = computeComparison(fig({ revenueMad: 1800 }), null, {
    baselineLabel: "b",
    currentIsPartial: false,
    available: false,
  });
  assert.equal(c.available, false);
  assert.equal(c.revenue.direction, "unknown");
  assert.equal(c.revenue.deltaPct, null);
  assert.deepEqual(c.productMovements, []);
});
