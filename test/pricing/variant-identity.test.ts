// Variant uniqueness identity (importer §6). Pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";

import { variantIdentityKey, variantSku } from "../../src/lib/pricing/variant-identity";

test("same parent + face value + currency + region → duplicate (equal keys)", () => {
  const a = variantIdentityKey({
    faceValue: 10,
    faceCurrency: "EUR",
    reloadlyProductId: 15802,
    reloadlyCountryCode: "FR",
  });
  const b = variantIdentityKey({
    faceValue: 10,
    faceCurrency: "EUR",
    reloadlyProductId: 15802,
    reloadlyCountryCode: "FR",
  });
  assert.equal(a, b);
});

test("same face value + currency but DIFFERENT region → distinct keys (allowed)", () => {
  // Two different regional Reloadly products both at 10 EUR.
  const fr = variantIdentityKey({
    faceValue: 10,
    faceCurrency: "EUR",
    reloadlyProductId: 15802,
    reloadlyCountryCode: "FR",
  });
  const de = variantIdentityKey({
    faceValue: 10,
    faceCurrency: "EUR",
    reloadlyProductId: 15803,
    reloadlyCountryCode: "DE",
  });
  assert.notEqual(fr, de);
});

test("same Reloadly mapping imported twice → duplicate (equal keys)", () => {
  const first = variantIdentityKey({
    faceValue: 20,
    faceCurrency: "EUR",
    reloadlyProductId: 15802,
    reloadlyCountryCode: "FR",
  });
  const second = variantIdentityKey({
    faceValue: 20,
    faceCurrency: "EUR",
    reloadlyProductId: 15802,
    reloadlyCountryCode: "FR",
  });
  assert.equal(first, second);
});

test("manual variants (no reloadly) collapse identity to face value + currency", () => {
  const a = variantIdentityKey({ faceValue: 50, faceCurrency: "EUR", reloadlyProductId: null, reloadlyCountryCode: null });
  const b = variantIdentityKey({ faceValue: 50, faceCurrency: "EUR" });
  assert.equal(a, b);
  // A manual 50 EUR and a Reloadly 50 EUR are NOT the same identity.
  const reloadly = variantIdentityKey({ faceValue: 50, faceCurrency: "EUR", reloadlyProductId: 999, reloadlyCountryCode: "FR" });
  assert.notEqual(a, reloadly);
});

test("currency/country are case-insensitive in the key", () => {
  assert.equal(
    variantIdentityKey({ faceValue: 10, faceCurrency: "eur", reloadlyCountryCode: "fr", reloadlyProductId: 1 }),
    variantIdentityKey({ faceValue: 10, faceCurrency: "EUR", reloadlyCountryCode: "FR", reloadlyProductId: 1 }),
  );
});

test("SKU includes the country so regional variants never collide", () => {
  const fr = variantSku("steam-wallet", { faceValue: 10, faceCurrency: "EUR", reloadlyCountryCode: "FR" });
  const us = variantSku("steam-wallet", { faceValue: 10, faceCurrency: "USD", reloadlyCountryCode: "US" });
  const frEurAgain = variantSku("steam-wallet", { faceValue: 10, faceCurrency: "EUR", reloadlyCountryCode: "FR" });
  assert.notEqual(fr, us);
  assert.equal(fr, frEurAgain); // deterministic
  assert.match(fr, /steam-wallet-fr-10-eur/);
});

test("SKU does not double the region when the parent slug already ends with it", () => {
  // Region-named parent (slug already ends with the country) must not repeat it.
  assert.equal(
    variantSku("google-play-us", { faceValue: 10, faceCurrency: "USD", reloadlyCountryCode: "US" }),
    "google-play-us-10-usd",
  );
  assert.equal(
    variantSku("google-play-fr", { faceValue: 50, faceCurrency: "EUR", reloadlyCountryCode: "FR" }),
    "google-play-fr-50-eur",
  );
  // Case-insensitive, and only a trailing whole segment counts (not "plus-us").
  assert.equal(
    variantSku("google-play-us", { faceValue: 25, faceCurrency: "USD", reloadlyCountryCode: "us" }),
    "google-play-us-25-usd",
  );
  // Region-neutral parent still keeps the country so FR/US stay distinct.
  assert.equal(
    variantSku("google-play", { faceValue: 10, faceCurrency: "USD", reloadlyCountryCode: "US" }),
    "google-play-us-10-usd",
  );
  assert.notEqual(
    variantSku("google-play", { faceValue: 10, faceCurrency: "EUR", reloadlyCountryCode: "FR" }),
    variantSku("google-play", { faceValue: 10, faceCurrency: "USD", reloadlyCountryCode: "US" }),
  );
});
