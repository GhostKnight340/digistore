// Customer Trust & Conversion content: pure selectors + settings normalization.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  visibleReviews,
  defaultReviews,
  reviewSummary,
  clampRating,
  selectNavigatorTips,
  visibleFaqItems,
  usedFaqCategories,
  visibleDeliverySteps,
  type ReviewSetting,
  type NavigatorTipSetting,
  type FaqItemSetting,
} from "../../src/lib/trust/content";
import { mergeStoreSettings, defaultStoreSettings } from "../../src/lib/storeSettings";

function review(overrides: Partial<ReviewSetting>): ReviewSetting {
  return {
    id: "r",
    name: "Test",
    rating: 5,
    region: "Casablanca",
    product: "Carte Steam",
    date: "2026-01-01",
    text: "Bon service.",
    verified: true,
    status: "approved",
    seeded: false,
    ...overrides,
  };
}

test("visibleReviews keeps only approved, non-empty reviews", () => {
  const reviews = [
    review({ id: "a", status: "approved" }),
    review({ id: "b", status: "pending" }),
    review({ id: "c", status: "hidden" }),
    review({ id: "d", status: "approved", text: "   " }),
  ];
  const result = visibleReviews(reviews);
  assert.deepEqual(
    result.map((r) => r.id),
    ["a"],
  );
});

test("visibleReviews excludes seeded demo reviews (never shown as real)", () => {
  const reviews = [
    review({ id: "real", seeded: false, status: "approved" }),
    review({ id: "demo", seeded: true, status: "approved" }),
  ];
  const result = visibleReviews(reviews);
  assert.deepEqual(
    result.map((r) => r.id),
    ["real"],
  );
});

test("the seeded launch defaults never render as real reviews", () => {
  assert.equal(visibleReviews(defaultReviews).length, 0);
});

test("clampRating rounds and bounds to 1..5", () => {
  assert.equal(clampRating(4.6), 5);
  assert.equal(clampRating(0), 1);
  assert.equal(clampRating(9), 5);
  assert.equal(clampRating(Number.NaN), 5);
});

test("reviewSummary averages and counts", () => {
  const summary = reviewSummary([review({ rating: 5 }), review({ rating: 4 })]);
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 4.5);
  assert.equal(summary.distribution[5], 1);
  assert.equal(summary.distribution[4], 1);
});

const tips: NavigatorTipSetting[] = [
  {
    id: "ps",
    contexts: ["playstation", "psn"],
    type: "compatibility",
    title: "PS",
    message: "Région PlayStation.",
    enabled: true,
  },
  {
    id: "general",
    contexts: ["general"],
    type: "information",
    title: "Gen",
    message: "Livraison après paiement.",
    enabled: true,
  },
  {
    id: "off",
    contexts: ["steam"],
    type: "compatibility",
    title: "Steam",
    message: "Steam.",
    enabled: false,
  },
];

test("selectNavigatorTips matches by context keyword", () => {
  const result = selectNavigatorTips(tips, ["playstation-store", "US"]);
  assert.deepEqual(
    result.map((t) => t.id),
    ["ps"],
  );
});

test("selectNavigatorTips falls back to general when nothing specific matches", () => {
  const result = selectNavigatorTips(tips, ["netflix"]);
  assert.deepEqual(
    result.map((t) => t.id),
    ["general"],
  );
});

test("selectNavigatorTips ignores disabled tips and can drop the general fallback", () => {
  const result = selectNavigatorTips(tips, ["steam"], { includeGeneral: false });
  assert.deepEqual(result, []);
});

test("selectNavigatorTips honors the limit", () => {
  const many = selectNavigatorTips(
    [tips[0], { ...tips[0], id: "ps2" }],
    ["playstation"],
    { limit: 1 },
  );
  assert.equal(many.length, 1);
});

const faqItems: FaqItemSetting[] = [
  { id: "1", category: "delivery", question: "Q1", answer: "A1", enabled: true },
  { id: "2", category: "payments", question: "Q2", answer: "A2", enabled: false },
  { id: "3", category: "delivery", question: "", answer: "A3", enabled: true },
];

test("visibleFaqItems drops disabled and incomplete entries", () => {
  assert.deepEqual(
    visibleFaqItems(faqItems).map((i) => i.id),
    ["1"],
  );
});

test("usedFaqCategories returns only categories with visible items", () => {
  const cats = [
    { id: "delivery", label: "Livraison" },
    { id: "payments", label: "Paiements" },
    { id: "support", label: "Support" },
  ];
  assert.deepEqual(
    usedFaqCategories(cats, faqItems).map((c) => c.id),
    ["delivery"],
  );
});

test("mergeStoreSettings seeds trust content when absent", () => {
  const merged = mergeStoreSettings({});
  assert.ok(merged.whyGhost.length > 0);
  assert.ok(merged.reviews.length > 0);
  assert.ok(merged.navigatorTips.length > 0);
  assert.ok(merged.deliverySteps.length > 0);
  assert.ok(merged.faqItems.length > 0);
  assert.equal(merged.homepage.showFaq, true);
});

test("mergeStoreSettings normalizes and drops malformed content items", () => {
  const merged = mergeStoreSettings({
    reviews: [
      { id: "ok", name: "A", text: "Great", rating: 99, status: "approved" },
      { id: "", name: "bad", text: "no id" }, // dropped: no id
      "nonsense", // dropped: not an object
    ],
    faqItems: [{ id: "q", category: "payments", question: "Q", answer: "A" }],
    navigatorTips: [{ id: "t", message: "hi", contexts: ["steam"] }],
  });
  assert.equal(merged.reviews.length, 1);
  assert.equal(merged.reviews[0].rating, 5); // clamped from 99
  assert.equal(merged.reviews[0].status, "approved");
  assert.equal(merged.faqItems.length, 1);
  assert.equal(merged.faqItems[0].enabled, true); // defaulted
  assert.equal(merged.navigatorTips[0].type, "information"); // defaulted
});

test("visibleDeliverySteps keeps default steps in order", () => {
  const steps = visibleDeliverySteps(defaultStoreSettings.deliverySteps);
  assert.equal(steps[0].id, "choose");
  assert.equal(steps[steps.length - 1].id, "redeem");
});
