// Public-search text primitives: normalization, aliases, ranking. Pure — no DB.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSearch,
  tokenize,
  aliasCanonicalTerms,
  scoreMatch,
} from "../../src/lib/search/text";

test("normalizeSearch folds accents, case, and punctuation/spacing", () => {
  assert.equal(normalizeSearch("Catégorie"), "categorie");
  assert.equal(normalizeSearch("Play  Station!!"), "play station");
  assert.equal(normalizeSearch("google-play"), "google play");
  assert.equal(normalizeSearch("  Steam  "), "steam");
});

test("tokenize splits normalized words", () => {
  assert.deepEqual(tokenize("steam 20 eur"), ["steam", "20", "eur"]);
  assert.deepEqual(tokenize(""), []);
});

test("aliases resolve to canonical storefront terms", () => {
  assert.ok(aliasCanonicalTerms("psn").includes("playstation"));
  assert.ok(aliasCanonicalTerms("Play Station").includes("playstation"));
  assert.ok(aliasCanonicalTerms("googleplay").includes("google play"));
  assert.ok(aliasCanonicalTerms("itunes").includes("apple"));
  assert.ok(aliasCanonicalTerms("freefire").includes("free fire"));
  assert.deepEqual(aliasCanonicalTerms("zzzz"), []);
});

test("alias 'PSN' matches a PlayStation product (test 12)", () => {
  const score = scoreMatch({ kind: "product", title: "PlayStation" }, "psn");
  assert.ok(score > 0, "PSN should match PlayStation");
});

test("exact product-title match outranks a broad category partial (test 11)", () => {
  const exactProduct = scoreMatch({ kind: "product", title: "Steam" }, "steam");
  const categoryPartial = scoreMatch({ kind: "category", title: "Steam Games" }, "steam");
  assert.ok(
    exactProduct > categoryPartial,
    "an exact product must never be buried below a category match",
  );
});

test("ranking tiers: exact > prefix > partial > none", () => {
  const exact = scoreMatch({ kind: "product", title: "Steam Wallet" }, "steam wallet");
  const prefix = scoreMatch({ kind: "product", title: "Steam Wallet" }, "steam");
  const partial = scoreMatch({ kind: "product", title: "Carte Steam" }, "steam");
  const none = scoreMatch({ kind: "product", title: "Roblox" }, "steam");
  assert.ok(exact > prefix, "exact beats prefix");
  assert.ok(prefix > partial, "prefix beats partial");
  assert.ok(partial > 0, "partial still matches");
  assert.equal(none, 0, "no overlap → no match");
});

test("a more specific query still matches the parent product (Steam 20 EUR)", () => {
  const score = scoreMatch({ kind: "product", title: "Steam" }, "steam 20 eur");
  assert.ok(score > 0, "superset query should still match the product");
});

test("accent-insensitive matching works both ways", () => {
  assert.ok(scoreMatch({ kind: "category", title: "Catégorie" }, "categorie") > 0);
  assert.ok(scoreMatch({ kind: "category", title: "Categorie" }, "catégorie") > 0);
});

test("collection aliasText contributes to matching", () => {
  const score = scoreMatch(
    { kind: "collection", title: "Promotions", aliasText: "soldes deals" },
    "soldes",
  );
  assert.ok(score > 0, "a collection alias should match");
});

test("description only matches at the lowest tier", () => {
  const titleHit = scoreMatch({ kind: "product", title: "Steam" }, "steam");
  const descHit = scoreMatch(
    { kind: "product", title: "Roblox", haystack: "Recharge Steam disponible" },
    "steam",
  );
  assert.ok(descHit > 0 && descHit < titleHit, "description match ranks below a title match");
});
