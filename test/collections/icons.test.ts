// Collection icon + accent resolution. Pure — no DB, no network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  APPROVED_COLLECTION_ICONS,
  DEFAULT_COLLECTION_ICON,
  normalizeAccentColor,
  normalizeCollectionIcon,
  resolveCollectionIcon,
} from "../../src/lib/collections/icons";

test("normalizeCollectionIcon accepts only approved keys", () => {
  assert.equal(normalizeCollectionIcon("gaming"), "gaming");
  assert.equal(normalizeCollectionIcon("GAMING"), "gaming");
  assert.equal(normalizeCollectionIcon(" gift "), "gift");
  assert.equal(normalizeCollectionIcon("skull"), "");
  assert.equal(normalizeCollectionIcon(""), "");
  assert.equal(normalizeCollectionIcon(undefined), "");
  assert.equal(normalizeCollectionIcon(42), "");
});

test("resolveCollectionIcon: explicit admin icon wins over everything", () => {
  assert.equal(resolveCollectionIcon("globe", "Gaming", ["jeux"]), "globe");
});

test("resolveCollectionIcon: derives from name/aliases when no explicit icon", () => {
  assert.equal(resolveCollectionIcon("", "Gaming"), "gaming");
  assert.equal(resolveCollectionIcon("", "Cartes cadeaux"), "gift");
  assert.equal(resolveCollectionIcon("", "Abonnements et divertissement"), "subscription");
  assert.equal(resolveCollectionIcon("", "Logiciels"), "software");
  assert.equal(resolveCollectionIcon("", "Nouveautés"), "sparkle");
  assert.equal(resolveCollectionIcon("", "Produits populaires"), "trending");
  assert.equal(resolveCollectionIcon("", "Global"), "globe");
  assert.equal(resolveCollectionIcon("", "Sélection du Navigator"), "navigator");
  // accent-insensitive + alias-driven
  assert.equal(resolveCollectionIcon("", "Divers", ["jeux video"]), "gaming");
});

test("resolveCollectionIcon: falls back to the generic key when nothing matches", () => {
  assert.equal(resolveCollectionIcon("", "Zzz random"), DEFAULT_COLLECTION_ICON);
  assert.equal(DEFAULT_COLLECTION_ICON, "collection");
});

test("normalizeAccentColor accepts only safe 3/6-digit hex", () => {
  assert.equal(normalizeAccentColor("#3e7bfa"), "#3e7bfa");
  assert.equal(normalizeAccentColor("#FFF"), "#FFF");
  assert.equal(normalizeAccentColor("  #a1b2c3  "), "#a1b2c3");
  assert.equal(normalizeAccentColor("red"), null);
  assert.equal(normalizeAccentColor("rgb(1,2,3)"), null);
  assert.equal(normalizeAccentColor("#12"), null);
  assert.equal(normalizeAccentColor("javascript:alert(1)"), null);
  assert.equal(normalizeAccentColor(""), null);
  assert.equal(normalizeAccentColor(null), null);
});

test("the approved icon set is stable and includes the required concepts", () => {
  for (const key of [
    "collection",
    "gaming",
    "gift",
    "subscription",
    "software",
    "sparkle",
    "trending",
    "globe",
    "navigator",
  ]) {
    assert.ok(
      (APPROVED_COLLECTION_ICONS as readonly string[]).includes(key),
      `missing icon: ${key}`,
    );
  }
});
