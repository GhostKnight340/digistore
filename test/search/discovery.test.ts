// Discovery-upgrade search ranking: new aliases, region/denomination matching,
// and guide ranking. Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { aliasCanonicalTerms, scoreMatch } from "../../src/lib/search/text";

test("new aliases resolve to canonical terms (ps5, gta 6, xbox pass)", () => {
  assert.ok(aliasCanonicalTerms("ps5").includes("playstation"));
  assert.ok(aliasCanonicalTerms("ps4").includes("playstation"));
  assert.ok(aliasCanonicalTerms("gta 6").includes("gta vi"));
  assert.ok(aliasCanonicalTerms("gta6").includes("gta vi"));
  assert.ok(aliasCanonicalTerms("xbox pass").includes("game pass"));
});

test("exact product title ranks above a description-only match (test 1)", () => {
  const exact = scoreMatch({ kind: "product", title: "Steam Wallet" }, "steam wallet");
  const desc = scoreMatch(
    { kind: "product", title: "Netflix", haystack: "compatible steam wallet" },
    "steam wallet",
  );
  assert.ok(exact > desc);
});

test("PS5 alias surfaces a PlayStation product (test 2)", () => {
  const score = scoreMatch(
    { kind: "product", title: "PlayStation Store", aliasText: "psn playstation" },
    "ps5",
  );
  assert.ok(score > 0);
});

test("region/denomination query matches via haystack (test 3)", () => {
  // "Steam 20 EUR France" — region + denomination live in the haystack so the
  // parent product still surfaces even though the title is just "Steam Wallet".
  const record = {
    kind: "product" as const,
    title: "Steam Wallet",
    haystack: "FR france 20 EUR 50 EUR",
  };
  assert.ok(scoreMatch(record, "steam 20 eur") > 0);
  assert.ok(scoreMatch(record, "france") > 0);
});

test("a guide is rankable on the product content tiers (test 6)", () => {
  // Guides are scored with kind:"product" against title + platform/aliases.
  const score = scoreMatch(
    { kind: "product", title: "Comment activer une carte Steam", aliasText: "steam" },
    "activer carte steam",
  );
  assert.ok(score > 0);
});

test("non-matching query scores zero (drops the record)", () => {
  assert.equal(scoreMatch({ kind: "product", title: "Steam" }, "zzzz"), 0);
});
