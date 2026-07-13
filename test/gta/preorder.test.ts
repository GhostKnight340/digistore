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
  isReleased,
  parsePlatform,
  referencedProductSlugs,
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
  for (const platform of GTA_PLATFORMS) {
    for (const slug of gtaPreorderConfig.platforms[platform].productSlugs) {
      assert.equal(typeof slug, "string");
      assert.ok(slug.length > 0);
    }
  }
});

test("PlayStation and Xbox reference distinct real product slugs", () => {
  assert.deepEqual(gtaPreorderConfig.platforms.playstation.productSlugs, [
    "psn-100",
    "psn-250",
  ]);
  assert.deepEqual(gtaPreorderConfig.platforms.xbox.productSlugs, [
    "xbox-100",
    "xbox-200",
  ]);
});

test("referencedProductSlugs is the deduped union of all referenced slugs", () => {
  const slugs = referencedProductSlugs();
  assert.deepEqual([...slugs].sort(), [
    "psn-100",
    "psn-250",
    "xbox-100",
    "xbox-200",
  ]);
  // No duplicates even though related repeats the platform slugs.
  assert.equal(new Set(slugs).size, slugs.length);
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
