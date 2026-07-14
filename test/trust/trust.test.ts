// Customer Trust & Conversion pure helpers: contextual tip selection and
// review summarize/sort/publish rules. Pure — no DB, no network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONTEXTUAL_TIPS,
  FAQ_ITEMS,
  pickContextualTip,
} from "../../src/lib/trust";
import {
  SEED_REVIEWS,
  publishedReviews,
  sortReviews,
  summarizeReviews,
  type Review,
} from "../../src/lib/reviews";

test("pickContextualTip prefers a specific context over the general fallback", () => {
  const tip = pickContextualTip(["playstation"]);
  assert.equal(tip?.id, "playstation-region");
});

test("pickContextualTip is case-insensitive and trims tokens", () => {
  assert.equal(pickContextualTip(["  Steam  "])?.id, "steam-region");
});

test("pickContextualTip falls back to the general tip when nothing matches", () => {
  const tip = pickContextualTip(["totally-unknown-brand"]);
  assert.equal(tip?.contexts.includes("general"), true);
});

test("pickContextualTip with no contexts still returns the general tip", () => {
  assert.equal(pickContextualTip([])?.id, "general-delivery");
});

test("every tip has a general fallback available", () => {
  assert.ok(CONTEXTUAL_TIPS.some((tip) => tip.contexts.includes("general")));
});

test("FAQ item ids are unique (deep links must be stable)", () => {
  const ids = FAQ_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("publishedReviews hides non-approved reviews", () => {
  const reviews: Review[] = [
    { ...SEED_REVIEWS[0], id: "a", status: "approved" },
    { ...SEED_REVIEWS[0], id: "b", status: "pending" },
    { ...SEED_REVIEWS[0], id: "c", status: "hidden" },
  ];
  const published = publishedReviews(reviews);
  assert.deepEqual(published.map((r) => r.id), ["a"]);
});

test("summarizeReviews computes count, average and distribution from approved only", () => {
  const reviews: Review[] = [
    { ...SEED_REVIEWS[0], id: "a", rating: 5, status: "approved" },
    { ...SEED_REVIEWS[0], id: "b", rating: 4, status: "approved" },
    { ...SEED_REVIEWS[0], id: "c", rating: 1, status: "pending" }, // ignored
  ];
  const summary = summarizeReviews(reviews);
  assert.equal(summary.count, 2);
  assert.equal(summary.average, 4.5);
  assert.equal(summary.distribution[4], 1); // one 5★
  assert.equal(summary.distribution[3], 1); // one 4★
});

test("summarizeReviews on an empty list is safe", () => {
  const summary = summarizeReviews([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.average, 0);
});

test("sortReviews orders by rating and recency", () => {
  const reviews: Review[] = [
    { ...SEED_REVIEWS[0], id: "old-5", rating: 5, date: "2026-01-01" },
    { ...SEED_REVIEWS[0], id: "new-3", rating: 3, date: "2026-06-01" },
  ];
  assert.deepEqual(sortReviews(reviews, "recent").map((r) => r.id), ["new-3", "old-5"]);
  assert.deepEqual(sortReviews(reviews, "highest").map((r) => r.id), ["old-5", "new-3"]);
  assert.deepEqual(sortReviews(reviews, "lowest").map((r) => r.id), ["new-3", "old-5"]);
});

test("seed reviews are all approved and verified (placeholder data is display-ready)", () => {
  for (const review of SEED_REVIEWS) {
    assert.equal(review.status, "approved");
    assert.equal(review.verifiedPurchase, true);
  }
});
