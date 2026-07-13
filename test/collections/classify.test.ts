// Pure collection classifier. No DB, no network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isGaming,
  isGiftCard,
  isSubscription,
  isSoftware,
  inEurope,
  inUnitedStates,
  isGlobal,
  type ClassifiableProduct,
} from "../../src/lib/collections/classify";

function make(overrides: Partial<ClassifiableProduct>): ClassifiableProduct {
  return {
    id: "p1",
    slug: "p1",
    name: "",
    brand: null,
    category: "",
    categoryName: "",
    regions: [],
    ...overrides,
  };
}

test("gaming platforms are classified as Gaming", () => {
  assert.ok(isGaming(make({ name: "Steam Wallet 100 MAD", category: "steam" })));
  assert.ok(isGaming(make({ name: "PlayStation Store 250", category: "playstation" })));
  assert.ok(isGaming(make({ name: "Xbox Gift Card", category: "xbox" })));
  assert.ok(isGaming(make({ name: "Valorant 1000 VP", category: "valorant" })));
  assert.ok(isGaming(make({ name: "Free Fire Diamonds", category: "freefire" })));
});

test("non-gaming products are not Gaming", () => {
  assert.equal(isGaming(make({ name: "Windows 11 Pro", category: "software" })), false);
  assert.equal(isGaming(make({ name: "Netflix Abonnement", category: "streaming" })), false);
});

test("gift-card brands and store wallets are Cartes cadeaux", () => {
  assert.ok(isGiftCard(make({ name: "Google Play 20 EUR", brand: "Google Play" })));
  assert.ok(isGiftCard(make({ name: "iTunes Gift Card", brand: "Apple" })));
  assert.ok(isGiftCard(make({ name: "Steam Wallet 50 MAD", category: "steam" })));
});

test("subscriptions are classified as Abonnements", () => {
  assert.ok(isSubscription(make({ name: "Netflix Premium" })));
  assert.ok(isSubscription(make({ name: "Discord Nitro" })));
  assert.ok(isSubscription(make({ name: "Xbox Game Pass Ultimate" })));
});

test("software licences are classified as Logiciels", () => {
  assert.ok(isSoftware(make({ name: "Microsoft Office 2021", category: "software" })));
  assert.ok(isSoftware(make({ name: "NordVPN 1 an" })));
  assert.ok(isSoftware(make({ name: "Windows 11 Pro" })));
  assert.equal(isSoftware(make({ name: "Steam Wallet", category: "steam" })), false);
});

test("accent-insensitive keyword matching", () => {
  assert.ok(isSubscription(make({ name: "Abonnement Spotify" })));
  assert.ok(isSoftware(make({ name: "Licence Office", category: "logiciel" })));
});

test("regional membership uses ONLY structured region codes", () => {
  assert.ok(inEurope(make({ regions: ["EU"] })));
  assert.ok(inEurope(make({ regions: ["FR"] })));
  assert.equal(inEurope(make({ regions: ["US", "GLOBAL"] })), false);

  assert.ok(inUnitedStates(make({ regions: ["US"] })));
  assert.equal(inUnitedStates(make({ regions: ["EU"] })), false);

  assert.ok(isGlobal(make({ regions: ["GLOBAL"] })));
  // A missing/empty region is NEVER assumed to be Global.
  assert.equal(isGlobal(make({ regions: [] })), false);
  assert.equal(isGlobal(make({ regions: ["MA"] })), false);
});

test("title text alone never drives regional membership", () => {
  // "Europe" in the name but no EU/FR region code → not in Europe.
  assert.equal(inEurope(make({ name: "Carte Europe", regions: ["MA"] })), false);
  // "Global" in the name but region is US → not Global.
  assert.equal(isGlobal(make({ name: "Global Card", regions: ["US"] })), false);
});
