// GTA VI pre-order campaign config + pure helpers. No DB, no network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GTA_PLATFORMS,
  GTA_RELEASE_ISO,
  daysUntilRelease,
  gtaFaqItems,
  gtaPreorderConfig,
  gtaReleaseDate,
  isRecommendableGiftCard,
  isReleased,
  parsePlatform,
  referencedBrandKeys,
} from "../../src/lib/gtaPreorder";

const BEFORE = new Date("2026-07-13T12:00:00.000Z");
const RELEASE = new Date(GTA_RELEASE_ISO);
const AFTER = new Date("2026-11-20T00:00:00.000Z");

test("official release date is 19 November 2026", () => {
  const d = gtaReleaseDate();
  // 19 Nov 2026 00:00 UTC+1 → 18 Nov 2026 23:00 UTC.
  assert.equal(d.getUTCFullYear(), 2026);
  assert.equal(d.getUTCMonth(), 10); // November (0-indexed)
  assert.equal(GTA_RELEASE_ISO, "2026-11-19T00:00:00+01:00");
});

test("isReleased is false before, true on/after the release instant", () => {
  assert.equal(isReleased(BEFORE), false);
  assert.equal(isReleased(RELEASE), true);
  assert.equal(isReleased(AFTER), true);
});

test("daysUntilRelease counts down and floors to 0 after release", () => {
  assert.ok(daysUntilRelease(BEFORE) > 100);
  assert.equal(daysUntilRelease(RELEASE), 0);
  assert.equal(daysUntilRelease(AFTER), 0);
});

test("parsePlatform only accepts known platforms", () => {
  assert.equal(parsePlatform("playstation"), "playstation");
  assert.equal(parsePlatform("xbox"), "xbox");
  assert.equal(parsePlatform("nintendo"), null);
  assert.equal(parsePlatform(undefined), null);
  assert.equal(parsePlatform(""), null);
});

test("both launch platforms are configured, and only those two", () => {
  assert.deepEqual(GTA_PLATFORMS, ["playstation", "xbox"]);
  assert.deepEqual(Object.keys(gtaPreorderConfig.platforms).sort(), [
    "playstation",
    "xbox",
  ]);
});

test("release info lists PS5 and Xbox Series X|S — no PS4/Xbox One/PC", () => {
  const platforms = gtaPreorderConfig.releaseInfo.platforms;
  assert.deepEqual(platforms, ["PlayStation 5", "Xbox Series X|S"]);
  const blob = JSON.stringify(gtaPreorderConfig).toLowerCase();
  assert.equal(blob.includes("playstation 4"), false);
  assert.equal(blob.includes("xbox one"), false);
  // "PC" as a launch platform must not be claimed anywhere in the copy.
  assert.equal(/\bpc\b/.test(blob), false);
});

test("no hardcoded unofficial game price is present in the config copy", () => {
  // The config must not assert any specific game/edition price; product prices
  // come live from the catalogue, never from this file.
  assert.equal(gtaPreorderConfig.seo.title.includes("DH"), false);
});

test("recommendations are resolved by real catalogue brand, not fixed slugs", () => {
  // The config points at brand keys (playstation/xbox) so the live PSN / Xbox
  // gift-card products already on the site are what render — never a fixed slug
  // list that could go stale.
  assert.equal(gtaPreorderConfig.platforms.playstation.brandKey, "playstation");
  assert.equal(gtaPreorderConfig.platforms.xbox.brandKey, "xbox");
  const blob = JSON.stringify(gtaPreorderConfig);
  assert.equal(blob.includes("psn-100"), false);
  assert.equal(blob.includes("xbox-100"), false);
});

test("referencedBrandKeys is the deduped union of all referenced brands", () => {
  const keys = referencedBrandKeys();
  assert.deepEqual([...keys].sort(), ["playstation", "xbox"]);
  assert.equal(new Set(keys).size, keys.length);
});

test("subscriptions are excluded from recommended gift cards", () => {
  // Real store-credit gift cards pass; subscriptions do not (case/accent-insensitive).
  assert.equal(isRecommendableGiftCard("Xbox Gift Cards"), true);
  assert.equal(isRecommendableGiftCard("PlayStation FR"), true);
  assert.equal(isRecommendableGiftCard("Carte PSN 250 MAD"), true);
  assert.equal(isRecommendableGiftCard("Xbox Game Pass"), false);
  assert.equal(isRecommendableGiftCard("Xbox Game Pass Essential"), false);
  assert.equal(isRecommendableGiftCard("PlayStation Plus 12 mois"), false);
  assert.equal(isRecommendableGiftCard("PS Plus Essential"), false);
});

test("FAQ maps to active, ordered items with unique questions", () => {
  const items = gtaFaqItems();
  assert.ok(items.length >= 6);
  items.forEach((item, index) => {
    assert.equal(item.active, true);
    assert.equal(item.sortOrder, index);
    assert.ok(item.question.length > 0);
    assert.ok(item.answer.length > 0);
  });
  const questions = items.map((i) => i.question.toLowerCase());
  assert.equal(new Set(questions).size, questions.length);
});

test("navigator tip is enabled, compatibility type, not first-person", () => {
  const tip = gtaPreorderConfig.navigatorTip;
  assert.equal(tip.enabled, true);
  assert.equal(tip.type, "compatibility");
  assert.ok(tip.message.length > 0);
  // No first-person mascot voice.
  assert.equal(/\bje\b|\bj['’]/i.test(tip.message), false);
});

test("copy never uses the misleading 'Acheter GTA VI' wording", () => {
  const blob = JSON.stringify(gtaPreorderConfig).toLowerCase();
  assert.equal(blob.includes("acheter gta"), false);
});

test("disclosure links point at real internal policy/support routes", () => {
  const d = gtaPreorderConfig.disclosure;
  for (const href of [d.refundHref, d.supportHref, d.compatibilityHref]) {
    assert.ok(href.startsWith("/"));
  }
  assert.equal(d.refundHref, "/refunds");
  assert.equal(d.supportHref, "/support");
});
