// Collection scheduling / visibility state. Pure — no DB, no network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectionState,
  isCollectionPublic,
  collectionStateLabel,
} from "../../src/lib/collections/schedule";

const NOW = new Date("2026-07-13T12:00:00.000Z");
const PAST = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2026-08-01T00:00:00.000Z");

test("inactive collection is never public regardless of window", () => {
  const c = { active: false, startAt: null, endAt: null };
  assert.equal(collectionState(c, NOW), "inactive");
  assert.equal(isCollectionPublic(c, NOW), false);
});

test("active with no window is live/public", () => {
  const c = { active: true, startAt: null, endAt: null };
  assert.equal(collectionState(c, NOW), "live");
  assert.equal(isCollectionPublic(c, NOW), true);
});

test("active but before start date is upcoming (hidden)", () => {
  const c = { active: true, startAt: FUTURE, endAt: null };
  assert.equal(collectionState(c, NOW), "upcoming");
  assert.equal(isCollectionPublic(c, NOW), false);
});

test("active but after end date is expired (hidden)", () => {
  const c = { active: true, startAt: null, endAt: PAST };
  assert.equal(collectionState(c, NOW), "expired");
  assert.equal(isCollectionPublic(c, NOW), false);
});

test("active and inside the window is live", () => {
  const c = { active: true, startAt: PAST, endAt: FUTURE };
  assert.equal(collectionState(c, NOW), "live");
  assert.equal(isCollectionPublic(c, NOW), true);
});

test("accepts ISO strings as well as Date instances", () => {
  const c = { active: true, startAt: PAST.toISOString(), endAt: FUTURE.toISOString() };
  assert.equal(isCollectionPublic(c, NOW), true);
});

test("invalid dates are ignored (treated as no bound)", () => {
  const c = { active: true, startAt: "not-a-date", endAt: null };
  assert.equal(collectionState(c, NOW), "live");
});

test("labels are French and defined for every state", () => {
  assert.equal(collectionStateLabel("live"), "En ligne");
  assert.equal(collectionStateLabel("upcoming"), "Programmée");
  assert.equal(collectionStateLabel("expired"), "Expirée");
  assert.equal(collectionStateLabel("inactive"), "Inactive");
});
