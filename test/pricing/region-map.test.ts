// Reloadly country → Ghost region mapping (Phase 2 importer). Pure, no DB.
import { test } from "node:test";
import assert from "node:assert/strict";

import { reloadlyCountryToRegion } from "../../src/lib/regions";

test("direct country codes map to themselves", () => {
  assert.equal(reloadlyCountryToRegion("FR"), "FR");
  assert.equal(reloadlyCountryToRegion("US"), "US");
  assert.equal(reloadlyCountryToRegion("TR"), "TR");
  assert.equal(reloadlyCountryToRegion("SA"), "SA");
  assert.equal(reloadlyCountryToRegion("MA"), "MA");
});

test("aliased codes map to Ghost region names", () => {
  assert.equal(reloadlyCountryToRegion("GB"), "UK");
  assert.equal(reloadlyCountryToRegion("AE"), "UAE");
});

test("euro-zone countries collapse to EU", () => {
  assert.equal(reloadlyCountryToRegion("DE"), "EU");
  assert.equal(reloadlyCountryToRegion("ES"), "EU");
  assert.equal(reloadlyCountryToRegion("IT"), "EU");
  assert.equal(reloadlyCountryToRegion("BE"), "EU");
});

test("unknown / missing countries return '' (admin completes it)", () => {
  assert.equal(reloadlyCountryToRegion("TH"), "");
  assert.equal(reloadlyCountryToRegion("PH"), "");
  assert.equal(reloadlyCountryToRegion(null), "");
  assert.equal(reloadlyCountryToRegion(undefined), "");
  assert.equal(reloadlyCountryToRegion(""), "");
});

test("case-insensitive", () => {
  assert.equal(reloadlyCountryToRegion("gb"), "UK");
  assert.equal(reloadlyCountryToRegion("de"), "EU");
});
